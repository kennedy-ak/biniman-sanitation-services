"""Admin analytics + dispute resolution endpoints."""
import logging
import re
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from django.db import IntegrityError, transaction

from django.db.models import Q

from accounts.models import PHONE_RE, Region, Role, User
from drivers.models import Driver, DriverStatus, VehicleType
from drivers.permissions import IsAdmin
from drivers.serializers import DriverSerializer
from liquidgo.throttles import AdminUserCreateThrottle
from payments.models import DisputeMessage, Payment, PaymentStatus, Payout, PayoutStatus
from payments.services.orchestrator import (
    confirm_payout_success,
    refund_request,
    trigger_payout,
)
from ratings.services import aggregate_for_user
from requests_app.models import RequestStatus, ServiceRequest
from requests_app.serializers import ServiceRequestSerializer


def _purge_users(user_ids: list[int]) -> int:
    """Hard-delete users plus all rows that PROTECT them.

    PROTECT chain on User: ServiceRequest.customer, Payment.customer.
    PROTECT chain on ServiceRequest: Payment.request, Payout.request.
    PROTECT chain on Driver: Payout.driver. Driver itself CASCADE-deletes
    when its user goes, but the payouts pointing at that driver block it.

    Order: Payouts -> Payments -> ServiceRequests -> Users (cascades to
    Driver, FleetCompany, EmailOTP, Ratings).

    Returns count of users actually deleted.
    """
    if not user_ids:
        return 0

    with transaction.atomic():
        sr_ids = list(
            ServiceRequest.objects.filter(
                Q(customer_id__in=user_ids) | Q(driver__user_id__in=user_ids)
            ).values_list("id", flat=True)
        )

        Payout.objects.filter(
            Q(request_id__in=sr_ids) | Q(driver__user_id__in=user_ids)
        ).delete()
        Payment.objects.filter(
            Q(request_id__in=sr_ids) | Q(customer_id__in=user_ids)
        ).delete()
        if sr_ids:
            ServiceRequest.objects.filter(id__in=sr_ids).delete()

        User.objects.filter(id__in=user_ids).delete()
    return len(user_ids)

logger = logging.getLogger(__name__)


def _window(request) -> tuple[int, timezone.datetime]:
    """Parse ?days=N (default 30) and return (days, since)."""
    try:
        days = max(1, min(int(request.query_params.get("days", 30)), 365))
    except (TypeError, ValueError):
        days = 30
    return days, timezone.now() - timedelta(days=days)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def overview(request):
    days, since = _window(request)

    requests_qs = ServiceRequest.objects.filter(created_at__gte=since)
    total = requests_qs.count()
    completed = requests_qs.filter(status=RequestStatus.COMPLETED.value).count()
    cancelled = requests_qs.filter(status=RequestStatus.CANCELLED.value).count()
    unfulfilled = requests_qs.filter(status=RequestStatus.UNFULFILLED.value).count()

    payments = Payment.objects.filter(
        created_at__gte=since, status=PaymentStatus.SUCCEEDED
    )
    gmv = payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    commission = ServiceRequest.objects.filter(
        completed_at__gte=since, status=RequestStatus.COMPLETED.value
    ).aggregate(total=Sum("commission_amount"))["total"] or Decimal("0")

    refunded = Payment.objects.filter(
        status=PaymentStatus.REFUNDED, refunded_at__gte=since
    ).aggregate(total=Sum("refund_amount"))["total"] or Decimal("0")

    drivers_total = Driver.objects.count()
    drivers_approved = Driver.objects.filter(status=DriverStatus.APPROVED).count()
    drivers_online = Driver.objects.filter(
        status=DriverStatus.APPROVED, is_online=True
    ).count()
    customers_total = User.objects.filter(role=Role.CUSTOMER).count()

    unfulfilled_rate = (unfulfilled / total) if total else 0.0

    return Response(
        {
            "window_days": days,
            "requests": {
                "total": total,
                "completed": completed,
                "cancelled": cancelled,
                "unfulfilled": unfulfilled,
                "unfulfilled_rate": round(unfulfilled_rate, 4),
            },
            "money": {
                "gmv": str(gmv),
                "commission": str(commission),
                "refunded": str(refunded),
            },
            "drivers": {
                "total": drivers_total,
                "approved": drivers_approved,
                "online": drivers_online,
            },
            "customers_total": customers_total,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def daily_jobs(request):
    days, since = _window(request)
    qs = (
        ServiceRequest.objects.filter(created_at__gte=since)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(
            total=Count("id"),
            completed=Count("id", filter=Q(status=RequestStatus.COMPLETED.value)),
            unfulfilled=Count("id", filter=Q(status=RequestStatus.UNFULFILLED.value)),
            cancelled=Count("id", filter=Q(status=RequestStatus.CANCELLED.value)),
        )
        .order_by("day")
    )
    rows = [
        {
            "day": row["day"].isoformat() if row["day"] else None,
            "total": row["total"],
            "completed": row["completed"],
            "unfulfilled": row["unfulfilled"],
            "cancelled": row["cancelled"],
        }
        for row in qs
    ]
    return Response({"window_days": days, "rows": rows})


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def top_drivers(request):
    days, since = _window(request)
    qs = (
        ServiceRequest.objects.filter(
            completed_at__gte=since, status=RequestStatus.COMPLETED.value
        )
        .values("driver_id", "driver__user__phone", "driver__user__full_name")
        .annotate(
            jobs=Count("id"),
            gross=Sum("quote_total"),
            commission=Sum("commission_amount"),
        )
        .order_by("-jobs")[:10]
    )
    return Response(
        [
            {
                "driver_id": r["driver_id"],
                "phone": r["driver__user__phone"],
                "name": r["driver__user__full_name"],
                "jobs": r["jobs"],
                "gross": str(r["gross"] or Decimal("0")),
                "commission": str(r["commission"] or Decimal("0")),
                "payout": str((r["gross"] or Decimal("0")) - (r["commission"] or Decimal("0"))),
            }
            for r in qs
        ]
    )


# ---------------- Dispute resolution ----------------


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def disputes(request):
    """Surface requests that need admin attention.

    Heuristic: cancelled or unfulfilled with a paid payment (refund stuck);
    completed requests where the payout failed; pending payouts older than 1 hour.
    """
    one_hour = timezone.now() - timedelta(hours=1)
    flagged = []

    failed_payouts = Payout.objects.filter(status=PayoutStatus.FAILED).select_related(
        "request", "driver", "driver__user"
    )
    for p in failed_payouts:
        flagged.append(
            {
                "kind": "failed_payout",
                "request_id": p.request_id,
                "amount": str(p.amount),
                "driver_phone": p.driver.user.phone,
                "reason": p.failure_reason,
                "created_at": p.created_at.isoformat(),
            }
        )

    stuck_payouts = Payout.objects.filter(
        status=PayoutStatus.PENDING, created_at__lt=one_hour
    ).select_related("request", "driver", "driver__user")
    for p in stuck_payouts:
        flagged.append(
            {
                "kind": "stuck_payout",
                "request_id": p.request_id,
                "amount": str(p.amount),
                "driver_phone": p.driver.user.phone,
                "created_at": p.created_at.isoformat(),
            }
        )

    refund_pending = Payment.objects.filter(
        status=PaymentStatus.SUCCEEDED,
        request__status__in=[
            RequestStatus.CANCELLED.value, RequestStatus.UNFULFILLED.value,
        ],
    ).select_related("request", "customer").prefetch_related("request__dispute_messages__sender")
    now_ts = timezone.now()
    for p in refund_pending:
        phone = p.customer.phone  # E.164: +233XXXXXXXXX
        momo = "0" + phone[4:] if phone.startswith("+233") else phone
        messages = [
            _serialize_dispute_message(m)
            for m in p.request.dispute_messages.all()
        ]
        flagged.append(
            {
                "kind": "refund_pending",
                "request_id": p.request_id,
                "amount": str(p.amount),
                "customer_phone": phone,
                "customer_name": p.customer.full_name or "",
                "momo_number": momo,
                "cancel_reason": p.request.cancel_reason,
                "has_cancel_reason": bool(p.request.cancel_reason),
                "request_status": p.request.status,
                "payment_reference": p.paystack_reference,
                "days_pending": (now_ts - p.created_at).days,
                "thread_messages": messages,
                "created_at": p.created_at.isoformat(),
            }
        )

    return Response(flagged)


def _serialize_dispute_message(m: DisputeMessage) -> dict:
    return {
        "id": m.id,
        "sender_type": m.sender_type,
        "sender_name": (m.sender.full_name or m.sender.phone) if m.sender else "System",
        "content": m.content,
        "attachment_url": m.attachment_url,
        "created_at": m.created_at.isoformat(),
    }


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def force_refund(request, request_id: int):
    reason = (request.data.get("reason") or "").strip()
    if not reason:
        raise ValidationError({"reason": "A reason is required to force a refund."})
    sr = get_object_or_404(ServiceRequest, pk=request_id)
    refunded = refund_request(sr, reason=f"Admin override by {request.user.phone}: {reason}")
    if not refunded:
        raise ValidationError("Nothing to refund.")
    return Response({"ok": True, "status": refunded.status})


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def request_cancel_reason(request, request_id: int):
    from notifications.services.sms import send_sms
    sr = get_object_or_404(ServiceRequest, pk=request_id)
    if sr.status not in {RequestStatus.CANCELLED.value, RequestStatus.UNFULFILLED.value}:
        raise ValidationError("Request is not cancelled or unfulfilled.")
    customer = sr.customer
    name = customer.full_name or "there"
    msg = (
        f"Hi {name}, before we process your refund for Request #{sr.id}, "
        f"could you tell us why you cancelled? Please open the Biniman app to reply."
    )
    send_sms(customer.phone, msg)
    DisputeMessage.objects.create(
        request=sr,
        sender=request.user,
        sender_type=DisputeMessage.ADMIN,
        content=msg,
    )
    return Response({"ok": True})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def dispute_thread(request, request_id: int):
    sr = get_object_or_404(ServiceRequest, pk=request_id)

    if request.method == "GET":
        msgs = DisputeMessage.objects.filter(request=sr).select_related("sender")
        return Response([_serialize_dispute_message(m) for m in msgs])

    # POST — send a message with optional receipt upload
    from notifications.services.sms import send_sms
    from drivers.services.storage import upload_document

    content = (request.data.get("message") or "").strip()
    if not content:
        raise ValidationError({"message": "Message content is required."})

    attachment_url = ""
    receipt_file = request.FILES.get("receipt")
    if receipt_file:
        result = upload_document(receipt_file, folder="biniman/dispute_receipts")
        attachment_url = result["url"]

    msg = DisputeMessage.objects.create(
        request=sr,
        sender=request.user,
        sender_type=DisputeMessage.ADMIN,
        content=content,
        attachment_url=attachment_url,
    )
    send_sms(sr.customer.phone, content)
    return Response(_serialize_dispute_message(msg), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def force_payout(request, request_id: int):
    sr = get_object_or_404(ServiceRequest, pk=request_id)
    if sr.status != RequestStatus.COMPLETED.value:
        raise ValidationError("Request must be completed before payout.")
    payout = trigger_payout(sr)
    if not payout:
        raise ValidationError("Could not initiate payout — check driver MoMo + payment status.")
    return Response({"ok": True, "status": payout.status})


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def mark_payout_succeeded(request, payout_id: int):
    """Manual override for cases where Paystack succeeded but webhook never fired."""
    payout = get_object_or_404(Payout, pk=payout_id)
    confirm_payout_succeeded = confirm_payout_success(payout)
    return Response({"ok": True, "status": confirm_payout_succeeded.status})


# ---------------- Users / Drivers directory ----------------


def _user_summary(u: User) -> dict:
    """Aggregate trip + spend stats for a user (customer or driver)."""
    if u.role == Role.DRIVER:
        as_driver = ServiceRequest.objects.filter(driver__user=u)
        total = as_driver.count()
        completed = as_driver.filter(status=RequestStatus.COMPLETED.value).count()
        gross = as_driver.filter(status=RequestStatus.COMPLETED.value).aggregate(
            total=Sum("quote_total")
        )["total"] or Decimal("0")
        commission = as_driver.filter(status=RequestStatus.COMPLETED.value).aggregate(
            total=Sum("commission_amount")
        )["total"] or Decimal("0")
        return {
            "trips_total": total,
            "trips_completed": completed,
            "gross": str(gross),
            "earnings": str(gross - commission),
        }
    qs = ServiceRequest.objects.filter(customer=u)
    total = qs.count()
    completed = qs.filter(status=RequestStatus.COMPLETED.value).count()
    # Net spent = succeeded payments tied to non-cancelled, non-unfulfilled requests,
    # minus refunds. Excludes pending payments from open requests.
    spent_succeeded = Payment.objects.filter(
        customer=u, status=PaymentStatus.SUCCEEDED
    ).exclude(
        request__status__in=[
            RequestStatus.CANCELLED.value,
            RequestStatus.UNFULFILLED.value,
        ]
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    refunded = Payment.objects.filter(
        customer=u, status=PaymentStatus.REFUNDED
    ).aggregate(total=Sum("refund_amount"))["total"] or Decimal("0")
    spent = spent_succeeded - refunded
    return {
        "trips_total": total,
        "trips_completed": completed,
        "spent": str(spent if spent > 0 else Decimal("0")),
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def list_users(request):
    """List all users, optionally filtered by ?role=customer|driver|fleet_admin|admin
    and ?q= (search by phone or full_name). Includes per-user trip/spend summary."""
    qs = User.objects.select_related("region").all()
    role = request.query_params.get("role")
    if role:
        qs = qs.filter(role=role)
    q = request.query_params.get("q")
    if q:
        qs = qs.filter(Q(phone__icontains=q) | Q(full_name__icontains=q) | Q(email__icontains=q))
    qs = qs.order_by("-created_at")[:500]

    out = []
    for u in qs:
        out.append(
            {
                "id": u.id,
                "phone": u.phone,
                "email": u.email,
                "full_name": u.full_name,
                "role": u.role,
                "region": u.region.name if u.region else None,
                "is_active": u.is_active,
                "is_phone_verified": u.is_phone_verified,
                "created_at": u.created_at.isoformat(),
                "stats": _user_summary(u),
            }
        )
    return Response(out)


PRIVILEGED_ROLES = {Role.ADMIN.value, Role.FLEET_ADMIN.value}
MOMO_RE = re.compile(r"^0\d{9}$")


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
@throttle_classes([AdminUserCreateThrottle])
def user_create(request):
    """Admin: create a new user. If role=driver and driver fields are provided,
    a Driver profile (status=pending) is also created. If a password is supplied
    the user can sign in by phone+password right away; otherwise the account
    has an unusable password and the user must sign in via OTP and set one
    from their security settings. Phone is marked verified since an admin is
    vouching for it.

    Privileged roles (admin, fleet_admin) require is_superuser to create,
    preventing lateral self-escalation by ordinary admins.
    """
    data = request.data or {}
    phone = (data.get("phone") or "").strip()
    if not PHONE_RE.match(phone):
        raise ValidationError({"phone": "Phone must be in E.164 format, e.g. +233241234567"})

    role = data.get("role") or Role.CUSTOMER.value
    if role not in {r.value for r in Role}:
        raise ValidationError({"role": "Invalid role."})

    if role in PRIVILEGED_ROLES and not request.user.is_superuser:
        raise PermissionDenied("Only a superuser can create admin or fleet_admin accounts.")

    email_raw = (data.get("email") or "").strip()
    email = email_raw.lower() or None
    full_name = (data.get("full_name") or "").strip()
    region_id = data.get("region_id")
    password = (data.get("password") or "").strip() or None
    if password is not None:
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError
        if len(password) < 8:
            raise ValidationError({"password": "Password must be at least 8 characters."})
        try:
            validate_password(password)
        except DjangoValidationError as exc:
            raise ValidationError({"password": list(exc.messages)})

    if User.objects.filter(phone=phone).exists():
        raise ValidationError({"phone": "A user with this phone already exists."})
    if email and User.objects.filter(email__iexact=email).exists():
        raise ValidationError({"email": "A user with this email already exists."})

    region = None
    if region_id:
        try:
            region = Region.objects.get(pk=region_id)
        except Region.DoesNotExist:
            raise ValidationError({"region_id": "Region not found."})

    driver_fields = None
    if role == Role.DRIVER.value:
        provided = {
            k: data.get(k)
            for k in (
                "vehicle_reg",
                "vehicle_type",
                "vehicle_capacity_litres",
                "license_number",
                "base_fee",
                "momo_number",
                "momo_provider",
            )
            if data.get(k) not in (None, "")
        }
        if provided:
            required = ["vehicle_reg", "vehicle_type", "vehicle_capacity_litres", "license_number", "base_fee"]
            missing = [f for f in required if f not in provided]
            if missing:
                raise ValidationError({f: "Required when creating a driver profile." for f in missing})
            if provided["vehicle_type"] not in {v.value for v in VehicleType}:
                raise ValidationError({"vehicle_type": "Invalid vehicle type."})
            try:
                provided["vehicle_capacity_litres"] = int(provided["vehicle_capacity_litres"])
            except (TypeError, ValueError):
                raise ValidationError({"vehicle_capacity_litres": "Must be an integer."})
            if provided["vehicle_capacity_litres"] < 500:
                raise ValidationError({"vehicle_capacity_litres": "Minimum 500 L."})
            try:
                provided["base_fee"] = Decimal(str(provided["base_fee"]))
                if provided["base_fee"] < 0:
                    raise InvalidOperation
            except (InvalidOperation, TypeError):
                raise ValidationError({"base_fee": "Must be a non-negative decimal."})
            if Driver.objects.filter(vehicle_reg__iexact=provided["vehicle_reg"]).exists():
                raise ValidationError({"vehicle_reg": "Vehicle already registered."})
            momo = provided.get("momo_number")
            if momo and not MOMO_RE.match(momo):
                raise ValidationError({"momo_number": "MoMo number must be 10 digits starting with 0."})
            if momo and not provided.get("momo_provider"):
                raise ValidationError({"momo_provider": "Required when MoMo number is set."})
            if provided.get("momo_provider") and provided["momo_provider"] not in {"mtn", "vodafone", "airteltigo"}:
                raise ValidationError({"momo_provider": "Invalid provider."})
            driver_fields = provided

    try:
        with transaction.atomic():
            u = User.objects.create_user(
                phone=phone,
                password=password,
                email=email,
                full_name=full_name,
                role=role,
                region=region,
                is_phone_verified=True,
            )
            if driver_fields:
                Driver.objects.create(
                    user=u,
                    status=DriverStatus.PENDING,
                    **driver_fields,
                )
    except IntegrityError as e:
        msg = str(e).lower()
        if "phone" in msg:
            raise ValidationError({"phone": "A user with this phone already exists."})
        if "email" in msg:
            raise ValidationError({"email": "A user with this email already exists."})
        if "vehicle_reg" in msg:
            raise ValidationError({"vehicle_reg": "Vehicle already registered."})
        raise ValidationError("Could not create user — duplicate or constraint violation.")

    logger.info(
        "admin_user_create",
        extra={
            "actor_id": request.user.id,
            "actor_phone": request.user.phone,
            "created_user_id": u.id,
            "created_phone": u.phone,
            "role": u.role,
            "with_driver_profile": bool(driver_fields),
        },
    )

    return Response(
        {
            "id": u.id,
            "phone": u.phone,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "region": u.region.name if u.region else None,
            "is_active": u.is_active,
            "is_phone_verified": u.is_phone_verified,
            "created_at": u.created_at.isoformat(),
            "stats": _user_summary(u),
        },
        status=201,
    )


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsAdmin])
def user_update(request, user_id: int):
    """Admin: edit name, email, role, or region for any user."""
    u = get_object_or_404(User, pk=user_id)
    allowed = {"full_name", "email", "role", "region_id"}
    payload = {k: v for k, v in request.data.items() if k in allowed}
    if "role" in payload and payload["role"] not in {r.value for r in Role}:
        raise ValidationError({"role": "Invalid role."})
    if "role" in payload and payload["role"] in PRIVILEGED_ROLES and not request.user.is_superuser:
        raise PermissionDenied("Only a superuser can assign privileged roles.")
    for k, v in payload.items():
        setattr(u, k, v if v != "" else None if k == "email" else v)
    if payload:
        u.save(update_fields=list(payload.keys()))
    return Response(
        {
            "id": u.id,
            "phone": u.phone,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "region": u.region.name if u.region else None,
            "is_active": u.is_active,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def user_set_active(request, user_id: int):
    """Admin: ban (is_active=False) or unban (is_active=True) a user.
    Body: {"active": true|false}. Banned users get a clear error on login."""
    u = get_object_or_404(User, pk=user_id)
    if u.id == request.user.id:
        raise ValidationError("You cannot ban your own account.")
    active = bool(request.data.get("active", True))
    u.is_active = active
    u.save(update_fields=["is_active"])
    return Response({"id": u.id, "is_active": u.is_active})


@api_view(["DELETE"])
@permission_classes([IsAuthenticated, IsAdmin])
def user_delete(request, user_id: int):
    """Admin: hard-delete a user. Cascades through their payouts, payments,
    service requests, ratings, and driver/fleet profile.
    """
    u = get_object_or_404(User, pk=user_id)
    if u.id == request.user.id:
        raise ValidationError("You cannot delete your own account.")
    _purge_users([u.id])
    return Response({"deleted": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def user_bulk_delete(request):
    """Admin: hard-delete many users at once. Body: {"ids": [int, ...]}.
    Skips the caller's own id and any ids that don't exist. Cascades to
    each user's requests/driver profile.
    """
    raw_ids = request.data.get("ids")
    if not isinstance(raw_ids, list) or not raw_ids:
        raise ValidationError({"ids": "Provide a non-empty list of user ids."})

    ids: list[int] = []
    for v in raw_ids:
        try:
            ids.append(int(v))
        except (TypeError, ValueError):
            raise ValidationError({"ids": f"Invalid id: {v!r}."})

    if len(ids) > 500:
        raise ValidationError({"ids": "Limit bulk delete to 500 users at a time."})

    requested = set(ids)
    skipped_self = 1 if request.user.id in requested else 0
    requested.discard(request.user.id)

    qs = User.objects.filter(pk__in=requested)
    found_ids = list(qs.values_list("id", flat=True))
    not_found = sorted(requested - set(found_ids))

    deleted_count = _purge_users(found_ids)

    logger.info(
        "admin_user_bulk_delete actor=%s requested=%d deleted=%d skipped_self=%d not_found=%d",
        request.user.id, len(ids), deleted_count, skipped_self, len(not_found),
    )
    return Response(
        {
            "requested": len(ids),
            "deleted": deleted_count,
            "skipped_self": skipped_self,
            "not_found": not_found,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def user_detail(request, user_id: int):
    """Full profile for a single user including trip history + ratings."""
    u = get_object_or_404(User.objects.select_related("region"), pk=user_id)

    if u.role == Role.DRIVER:
        trips_qs = ServiceRequest.objects.filter(driver__user=u)
    else:
        trips_qs = ServiceRequest.objects.filter(customer=u)
    trips_qs = trips_qs.select_related("customer", "driver", "driver__user").order_by(
        "-created_at"
    )[:100]
    trips = ServiceRequestSerializer(trips_qs, many=True).data

    rating_summary = aggregate_for_user(u.id)
    driver_payload = None
    if u.role == Role.DRIVER:
        driver = getattr(u, "driver_profile", None)
        if driver:
            driver_payload = DriverSerializer(driver).data

    return Response(
        {
            "user": {
                "id": u.id,
                "phone": u.phone,
                "email": u.email,
                "full_name": u.full_name,
                "role": u.role,
                "region": u.region.name if u.region else None,
                "is_active": u.is_active,
                "is_phone_verified": u.is_phone_verified,
                "created_at": u.created_at.isoformat(),
            },
            "stats": _user_summary(u),
            "rating": rating_summary,
            "driver": driver_payload,
            "trips": trips,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_force_complete(request, request_id: int):
    """Force a stuck request into COMPLETED, then trigger payout."""
    sr = get_object_or_404(ServiceRequest, pk=request_id)
    if sr.status not in {
        RequestStatus.ARRIVED.value, RequestStatus.EN_ROUTE.value,
        RequestStatus.ACCEPTED.value,
    }:
        raise ValidationError(f"Cannot force-complete from status '{sr.status}'.")
    # Walk through legal transitions
    while sr.status != RequestStatus.COMPLETED.value:
        if sr.status == RequestStatus.ACCEPTED.value:
            sr.transition(RequestStatus.EN_ROUTE.value)
        elif sr.status == RequestStatus.EN_ROUTE.value:
            sr.transition(RequestStatus.ARRIVED.value)
        elif sr.status == RequestStatus.ARRIVED.value:
            sr.transition(RequestStatus.COMPLETED.value)
        sr.save()
    trigger_payout(sr)
    return Response({"ok": True, "status": sr.status})
