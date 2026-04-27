from collections import OrderedDict
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.db.models.functions import TruncWeek
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role, User, validate_ghana_phone
from drivers.models import Driver, DriverStatus
from drivers.permissions import IsAdmin, IsFleetAdmin
from drivers.serializers import DriverSerializer
from fleets.models import FleetCompany, FleetStatus
from fleets.serializers import (
    FleetActionSerializer,
    FleetCompanySerializer,
    FleetDriverInviteSerializer,
    FleetSignupSerializer,
    WeeklyEarningsRowSerializer,
)
from notifications.services.sms import send_sms
from payments.models import Payout
from payments.serializers import PayoutSerializer
from requests_app.models import RequestStatus, ServiceRequest
from requests_app.serializers import ServiceRequestSerializer


def _approved_fleet(user) -> FleetCompany:
    fleet = getattr(user, "fleet_company", None)
    if not fleet:
        raise PermissionDenied("No fleet company.")
    if fleet.status != FleetStatus.APPROVED:
        raise PermissionDenied("Fleet not approved.")
    return fleet


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def signup(request):
    """Register a fleet company tied to the requesting user. Sets role to fleet_admin."""
    serializer = FleetSignupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    if hasattr(request.user, "fleet_company"):
        return Response(
            {"detail": "User already owns a fleet company."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    fleet = FleetCompany.objects.create(
        owner=request.user,
        name=data["name"],
        registration_number=data["registration_number"],
        contact_email=data.get("contact_email", ""),
        contact_phone=data.get("contact_phone", ""),
        region_id=data["region_id"],
    )

    if request.user.role != Role.FLEET_ADMIN:
        request.user.role = Role.FLEET_ADMIN
        request.user.save(update_fields=["role"])

    return Response(FleetCompanySerializer(fleet).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsFleetAdmin])
def my_fleet(request):
    fleet = getattr(request.user, "fleet_company", None)
    if not fleet:
        return Response({"detail": "No fleet company yet."}, status=status.HTTP_404_NOT_FOUND)
    return Response(FleetCompanySerializer(fleet).data)


# ---------------- Roster ----------------


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsFleetAdmin])
def list_drivers(request):
    fleet = _approved_fleet(request.user)
    qs = Driver.objects.filter(fleet=fleet).select_related("user")
    return Response(DriverSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsFleetAdmin])
def invite_driver(request):
    fleet = _approved_fleet(request.user)
    serializer = FleetDriverInviteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    phone = serializer.validated_data["phone"]
    validate_ghana_phone(phone)
    full_name = serializer.validated_data.get("full_name", "")

    user = User.objects.filter(phone=phone).first()
    if user is None:
        user = User.objects.create_user(
            phone=phone,
            role=Role.DRIVER,
            full_name=full_name,
            region=fleet.region,
        )
    elif user.role not in {Role.DRIVER, Role.CUSTOMER}:
        raise ValidationError({"phone": "User is registered with a non-driver role."})
    else:
        if user.role != Role.DRIVER:
            user.role = Role.DRIVER
            user.save(update_fields=["role"])

    driver = getattr(user, "driver_profile", None)
    if driver is None:
        # Create a placeholder profile that the driver will complete on first login.
        driver = Driver.objects.create(
            user=user,
            fleet=fleet,
            vehicle_reg=f"PENDING-{user.id}",
            vehicle_type="medium_tanker",
            vehicle_capacity_litres=0,
            license_number="",
            base_fee=Decimal("0"),
            status=DriverStatus.PENDING,
        )
    else:
        if driver.fleet_id and driver.fleet_id != fleet.id:
            raise ValidationError({"phone": "Driver belongs to another fleet."})
        driver.fleet = fleet
        driver.save(update_fields=["fleet"])

    send_sms(
        phone,
        f"You've been added to {fleet.name} on Biniman Sanitation. "
        f"Sign in at the app with this number to complete onboarding.",
    )
    return Response(DriverSerializer(driver).data, status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated, IsFleetAdmin])
def remove_driver(request, driver_id: int):
    fleet = _approved_fleet(request.user)
    driver = get_object_or_404(Driver, pk=driver_id, fleet=fleet)
    driver.fleet = None
    driver.save(update_fields=["fleet"])
    return Response({"ok": True})


# ---------------- Jobs ----------------


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsFleetAdmin])
def list_jobs(request):
    fleet = _approved_fleet(request.user)
    qs = ServiceRequest.objects.filter(driver__fleet=fleet).select_related(
        "driver", "driver__user", "customer", "region"
    )
    status_param = request.query_params.get("status")
    if status_param:
        qs = qs.filter(status=status_param)
    return Response(ServiceRequestSerializer(qs[:200], many=True).data)


# ---------------- Earnings ----------------


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsFleetAdmin])
def list_payouts(request):
    fleet = _approved_fleet(request.user)
    qs = Payout.objects.filter(driver__fleet=fleet).select_related(
        "driver", "driver__user", "request"
    )
    return Response(PayoutSerializer(qs[:200], many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsFleetAdmin])
def weekly_earnings(request):
    """Sum payouts to fleet drivers, grouped by ISO week, last 12 weeks."""
    fleet = _approved_fleet(request.user)
    cutoff = timezone.now() - timedelta(weeks=12)
    qs = (
        ServiceRequest.objects.filter(
            driver__fleet=fleet,
            status=RequestStatus.COMPLETED.value,
            completed_at__gte=cutoff,
        )
        .annotate(week_start=TruncWeek("completed_at"))
        .values("week_start")
        .annotate(
            jobs=Count("id"),
            gross=Sum("quote_total"),
            commission=Sum("commission_amount"),
        )
        .order_by("-week_start")
    )

    rows = []
    for row in qs:
        gross = row["gross"] or Decimal("0")
        commission = row["commission"] or Decimal("0")
        rows.append(
            {
                "week_start": row["week_start"].date() if row["week_start"] else None,
                "jobs": row["jobs"],
                "gross": gross,
                "commission": commission,
                "payout": gross - commission,
            }
        )

    totals = {
        "jobs": sum(r["jobs"] for r in rows),
        "gross": sum((r["gross"] for r in rows), Decimal("0")),
        "commission": sum((r["commission"] for r in rows), Decimal("0")),
        "payout": sum((r["payout"] for r in rows), Decimal("0")),
    }
    return Response(
        OrderedDict(
            weeks=WeeklyEarningsRowSerializer(rows, many=True).data,
            totals={k: str(v) for k, v in totals.items()},
        )
    )


# ---------------- Admin ----------------


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_list(request):
    qs = FleetCompany.objects.select_related("owner", "region").all()
    status_param = request.query_params.get("status")
    if status_param:
        qs = qs.filter(status=status_param)
    return Response(FleetCompanySerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_action(request, fleet_id: int):
    fleet = get_object_or_404(FleetCompany, pk=fleet_id)
    serializer = FleetActionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    action = serializer.validated_data["action"]
    reason = serializer.validated_data.get("reason", "")

    if action == "approve":
        fleet.status = FleetStatus.APPROVED
        fleet.rejection_reason = ""
        fleet.approved_at = timezone.now()
        fleet.approved_by = request.user
    elif action == "reject":
        fleet.status = FleetStatus.REJECTED
        fleet.rejection_reason = reason
    elif action == "suspend":
        fleet.status = FleetStatus.SUSPENDED
        fleet.rejection_reason = reason

    fleet.save()
    return Response(FleetCompanySerializer(fleet).data)
