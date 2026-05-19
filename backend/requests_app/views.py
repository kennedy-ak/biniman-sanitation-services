from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes, throttle_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Region, Role
from drivers.models import Driver, DriverStatus
from drivers.permissions import IsDriver
from pricing.distance import road_distance_km
from pricing.services import calculate_quote, haversine_km
from requests_app.models import (
    AssignmentOutcome,
    RequestAssignment,
    RequestStatus,
    ServiceRequest,
)
from requests_app.serializers import (
    CancelSerializer,
    CreateRequestSerializer,
    LocationPingSerializer,
    OnlineToggleSerializer,
    QuotePreviewSerializer,
    QuoteRequestSerializer,
    ServiceRequestSerializer,
    StatusTransitionSerializer,
)
from requests_app.services.broadcast import push_offer_cancelled, push_request_status
from liquidgo.throttles import ReceiptRegenerateThrottle


def _nearest_idle_driver_distance_km(region: Region, lat: float, lng: float) -> float:
    """Used for *quote previews* before a request exists. Returns 0 if no drivers.

    Picks the nearest driver by haversine, then refines via Mapbox road distance
    (haversine fallback when Mapbox is not configured).
    """
    drivers = list(
        Driver.objects.filter(status=DriverStatus.APPROVED, is_online=True)
        .exclude(last_lat__isnull=True)
        .exclude(last_lng__isnull=True)
    )
    if not drivers:
        return 0.0
    nearest = min(
        drivers,
        key=lambda d: haversine_km(lat, lng, float(d.last_lat), float(d.last_lng)),
    )
    return road_distance_km(
        from_lat=float(nearest.last_lat), from_lng=float(nearest.last_lng),
        to_lat=lat, to_lng=lng,
    )


def _avg_base_fee_for_region(region: Region) -> Decimal:
    qs = Driver.objects.filter(status=DriverStatus.APPROVED, base_fee__gt=0)
    fees = list(qs.values_list("base_fee", flat=True))
    if not fees:
        return Decimal("50")
    avg = sum(fees) / len(fees)
    return Decimal(avg).quantize(Decimal("0.01"))


# ---------- Customer endpoints ----------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def quote_preview(request):
    serializer = QuoteRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    region = get_object_or_404(Region, pk=data["region_id"])
    distance_km = _nearest_idle_driver_distance_km(
        region, float(data["pickup_lat"]), float(data["pickup_lng"])
    )
    quote = calculate_quote(
        region=region,
        distance_km=distance_km,
        volume_tier=data["volume_tier"],
        driver_base_fee=_avg_base_fee_for_region(region),
    )
    return Response(QuotePreviewSerializer(quote.__dict__).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def create_request(request):
    if request.user.role not in {Role.CUSTOMER, Role.ADMIN}:
        raise PermissionDenied("Only customers can create requests.")

    serializer = CreateRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    region = get_object_or_404(Region, pk=data["region_id"])

    distance_km = _nearest_idle_driver_distance_km(
        region, float(data["pickup_lat"]), float(data["pickup_lng"])
    )
    quote = calculate_quote(
        region=region,
        distance_km=distance_km,
        volume_tier=data["volume_tier"],
        driver_base_fee=_avg_base_fee_for_region(region),
    )

    survey_fields = {
        k: data[k]
        for k in (
            "gate_fits_truck", "tank_location", "truck_parking_distance",
            "tank_cover_state", "last_emptied", "preferred_time",
        )
        if data.get(k)
    }
    for k in ("is_overflowing", "someone_on_site"):
        if data.get(k) is not None:
            survey_fields[k] = data[k]
    for k in ("gate_photo", "tank_cover_photo"):
        if data.get(k):
            survey_fields[k] = data[k]

    with transaction.atomic():
        sr = ServiceRequest.objects.create(
            customer=request.user,
            region=region,
            waste_type=data["waste_type"],
            volume_tier=data["volume_tier"],
            pickup_lat=data["pickup_lat"],
            pickup_lng=data["pickup_lng"],
            pickup_address=data.get("pickup_address", ""),
            notes=data.get("notes", ""),
            quote_total=quote.total,
            quote_base_fee=quote.base_fee,
            quote_distance_km=quote.distance_km,
            quote_distance_fee=quote.distance_fee,
            quote_tier_fee=quote.tier_fee,
            commission_amount=quote.commission,
            **survey_fields,
        )

    # Pay-first: do NOT fire the cascade here. The customer is redirected to
    # /pay; on payment success `payments.orchestrator.confirm_payment` fires
    # `start_cascade.delay()`. Unpaid PENDING requests never reach a driver.
    return Response(ServiceRequestSerializer(sr).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_requests(request):
    qs = ServiceRequest.objects.filter(customer=request.user).select_related(
        "driver__user", "region"
    )
    return Response(ServiceRequestSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def request_detail(request, request_id: int):
    sr = get_object_or_404(ServiceRequest, pk=request_id)
    if request.user.role == Role.CUSTOMER and sr.customer_id != request.user.id:
        raise PermissionDenied()
    if request.user.role == Role.DRIVER:
        driver = getattr(request.user, "driver_profile", None)
        if not driver or sr.driver_id != driver.id:
            raise PermissionDenied()
    if request.user.role == Role.FLEET_ADMIN:
        fleet = getattr(request.user, "fleet_company", None)
        if not fleet or not sr.driver or getattr(sr.driver, "fleet_id", None) != fleet.id:
            raise PermissionDenied()
    # ADMIN: intentional platform-wide read access for support/audit
    return Response(ServiceRequestSerializer(sr).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_request(request, request_id: int):
    sr = get_object_or_404(ServiceRequest, pk=request_id)
    if request.user.role == Role.CUSTOMER and sr.customer_id != request.user.id:
        raise PermissionDenied()
    if sr.status in {RequestStatus.COMPLETED.value, RequestStatus.CANCELLED.value, RequestStatus.UNFULFILLED.value}:
        raise ValidationError("Request already in a terminal state.")

    serializer = CancelSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    sr.cancel_reason = serializer.validated_data.get("reason", "")
    sr.transition(RequestStatus.CANCELLED.value)
    sr.save()

    # Mark any pending offer as superseded.
    sr.assignments.filter(outcome=AssignmentOutcome.PENDING).update(
        outcome=AssignmentOutcome.SUPERSEDED, decided_at=timezone.now()
    )
    push_request_status(sr)

    # Auto-refund if the customer had paid.
    from payments.tasks import task_refund_request

    task_refund_request.delay(sr.id, "Cancelled by customer")
    return Response(ServiceRequestSerializer(sr).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def retry_request(request, request_id: int):
    """Re-trigger the matching cascade for an UNFULFILLED request.

    The customer already paid, so we skip payment and go straight back to
    PENDING then run the first cascade dispatch synchronously so the response
    already reflects whether a driver was found.
    """
    from requests_app.tasks import _dispatch_next_batch

    sr = get_object_or_404(ServiceRequest, pk=request_id)
    if sr.customer_id != request.user.id:
        raise PermissionDenied()
    if sr.status != RequestStatus.UNFULFILLED.value:
        raise ValidationError("Only unfulfilled requests can be retried.")

    with transaction.atomic():
        sr.status = RequestStatus.PENDING.value
        sr.driver = None
        sr.accepted_at = None
        sr.en_route_at = None
        sr.arrived_at = None
        sr.completed_at = None
        sr.save(update_fields=[
            "status", "driver", "accepted_at", "en_route_at",
            "arrived_at", "completed_at",
        ])
        # Delete all previous assignments so _drivers_already_invited()
        # starts fresh — without this, drivers who timed out are permanently
        # excluded and the retry cascade goes UNFULFILLED immediately.
        sr.assignments.all().delete()

    # Run the first dispatch inline so the response reflects the real status.
    # _dispatch_next_batch handles PENDING→ASSIGNED transition and schedules
    # the Celery timeout task for the new batch.
    sr.refresh_from_db()
    _dispatch_next_batch(sr)
    sr.refresh_from_db()
    return Response(ServiceRequestSerializer(sr).data)


# ---------- Driver endpoints ----------


def _require_driver(user) -> Driver:
    driver = getattr(user, "driver_profile", None)
    if not driver:
        raise PermissionDenied("No driver profile.")
    if driver.status != DriverStatus.APPROVED:
        raise PermissionDenied("Driver not approved.")
    return driver


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDriver])
def driver_online(request):
    serializer = OnlineToggleSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    driver = _require_driver(request.user)
    driver.is_online = serializer.validated_data["is_online"]
    if "lat" in serializer.validated_data and "lng" in serializer.validated_data:
        driver.last_lat = serializer.validated_data["lat"]
        driver.last_lng = serializer.validated_data["lng"]
    driver.last_seen_at = timezone.now()
    driver.save(update_fields=["is_online", "last_lat", "last_lng", "last_seen_at"])
    return Response({"is_online": driver.is_online})


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDriver])
def driver_ping(request):
    serializer = LocationPingSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    driver = _require_driver(request.user)
    driver.last_lat = serializer.validated_data["lat"]
    driver.last_lng = serializer.validated_data["lng"]
    driver.last_seen_at = timezone.now()
    driver.save(update_fields=["last_lat", "last_lng", "last_seen_at"])

    # If the driver has an active job, broadcast the location to the customer.
    active = (
        ServiceRequest.objects.filter(
            driver=driver,
            status__in=[
                RequestStatus.ACCEPTED.value, RequestStatus.EN_ROUTE.value,
                RequestStatus.ARRIVED.value,
            ],
        )
        .order_by("-created_at")
        .first()
    )
    if active:
        from requests_app.services.broadcast import push_driver_location

        push_driver_location(
            request_id=active.id,
            driver_id=driver.id,
            lat=float(driver.last_lat),
            lng=float(driver.last_lng),
        )

    return Response({"ok": True})


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDriver])
def driver_current_offer(request):
    driver = _require_driver(request.user)
    offer = (
        RequestAssignment.objects.select_related("request")
        .filter(driver=driver, outcome=AssignmentOutcome.PENDING)
        .order_by("-created_at")
        .first()
    )
    if not offer:
        return Response(None)
    if not offer.is_active():
        return Response(None)
    return Response(
        {
            "assignment_id": offer.id,
            "request": ServiceRequestSerializer(offer.request).data,
            "distance_km": float(offer.distance_km),
            "expires_at": offer.expires_at.isoformat(),
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDriver])
def driver_accept(request, assignment_id: int):
    driver = _require_driver(request.user)

    with transaction.atomic():
        try:
            offer = (
                RequestAssignment.objects.select_for_update()
                .select_related("request")
                .get(pk=assignment_id, driver=driver)
            )
        except RequestAssignment.DoesNotExist:
            raise ValidationError("Offer not found.")

        if offer.outcome != AssignmentOutcome.PENDING:
            raise ValidationError("Offer is no longer pending.")
        if timezone.now() >= offer.expires_at:
            raise ValidationError("Offer has expired.")

        sr = (
            ServiceRequest.objects.select_for_update().get(pk=offer.request_id)
        )
        if sr.status != RequestStatus.ASSIGNED.value:
            raise ValidationError("Request is no longer assignable.")

        now = timezone.now()
        offer.outcome = AssignmentOutcome.ACCEPTED
        offer.decided_at = now
        offer.save(update_fields=["outcome", "decided_at"])

        sr.driver = driver
        sr.transition(RequestStatus.ACCEPTED.value)
        sr.save(update_fields=["driver", "status", "accepted_at"])

        superseded = list(
            sr.assignments.filter(outcome=AssignmentOutcome.PENDING).exclude(pk=offer.pk)
        )
        if superseded:
            sr.assignments.filter(
                outcome=AssignmentOutcome.PENDING
            ).exclude(pk=offer.pk).update(
                outcome=AssignmentOutcome.SUPERSEDED, decided_at=now
            )

    for sibling in superseded:
        push_offer_cancelled(sibling)

    # Cancel this driver's pending offers on OTHER requests so those requests
    # immediately re-cascade instead of waiting for their timeout.
    other_pending = list(
        RequestAssignment.objects.select_related("request")
        .filter(driver=driver, outcome=AssignmentOutcome.PENDING)
        .exclude(pk=offer.pk)
    )
    if other_pending:
        RequestAssignment.objects.filter(
            pk__in=[o.pk for o in other_pending]
        ).update(outcome=AssignmentOutcome.SUPERSEDED, decided_at=timezone.now())
        from requests_app.tasks import _dispatch_next_batch
        for other in other_pending:
            other.request.refresh_from_db()
            if other.request.status == RequestStatus.ASSIGNED.value:
                other.request.status = RequestStatus.PENDING.value
                other.request.save(update_fields=["status"])
                _dispatch_next_batch(other.request)

    push_request_status(sr)
    return Response(ServiceRequestSerializer(sr).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDriver])
def driver_decline(request, assignment_id: int):
    """Mark the driver's own offer as declined. The cascade advances when the
    batch's timeout fires (see `tasks.handle_batch_timeout`).
    """
    driver = _require_driver(request.user)
    offer = get_object_or_404(RequestAssignment, pk=assignment_id, driver=driver)
    if offer.outcome != AssignmentOutcome.PENDING:
        raise ValidationError("Offer is no longer pending.")

    offer.outcome = AssignmentOutcome.DECLINED
    offer.decided_at = timezone.now()
    offer.save(update_fields=["outcome", "decided_at"])
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsDriver])
def driver_status(request, request_id: int):
    """Driver advances request status: en_route → arrived → completed."""
    driver = _require_driver(request.user)
    sr = get_object_or_404(ServiceRequest, pk=request_id, driver=driver)
    serializer = StatusTransitionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    target = serializer.validated_data["status"]
    if target not in {RequestStatus.EN_ROUTE.value, RequestStatus.ARRIVED.value, RequestStatus.COMPLETED.value}:
        raise ValidationError("Driver may only set en_route, arrived, or completed.")

    sr.transition(target)
    sr.save()
    push_request_status(sr)

    if target == RequestStatus.COMPLETED.value:
        # Pay-after-job model: only fires if the customer has already paid.
        # Otherwise the payout fires when payment confirms (see orchestrator).
        from payments.tasks import task_trigger_payout
        from requests_app.tasks import generate_receipt

        task_trigger_payout.delay(sr.id)
        generate_receipt.delay(sr.id)

    return Response(ServiceRequestSerializer(sr).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDriver])
def driver_active_request(request):
    driver = _require_driver(request.user)
    sr = (
        ServiceRequest.objects.filter(
            driver=driver,
            status__in=[
                RequestStatus.ACCEPTED.value, RequestStatus.EN_ROUTE.value,
                RequestStatus.ARRIVED.value,
            ],
        )
        .order_by("-created_at")
        .first()
    )
    if not sr:
        return Response(None)
    return Response(ServiceRequestSerializer(sr).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDriver])
def driver_pending_rating(request):
    """Most recent completed job where the driver hasn't yet rated the customer."""
    driver = _require_driver(request.user)
    qs = ServiceRequest.objects.filter(
        driver=driver, status=RequestStatus.COMPLETED.value
    ).order_by("-completed_at")
    for sr in qs[:5]:
        if not sr.ratings.filter(rated_by=request.user).exists():
            return Response(ServiceRequestSerializer(sr).data)
    return Response(None)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsDriver])
def driver_job_history(request):
    """Completed, cancelled and unfulfilled jobs for the driver, newest first."""
    driver = _require_driver(request.user)
    qs = ServiceRequest.objects.filter(
        driver=driver,
        status__in=[RequestStatus.COMPLETED.value, RequestStatus.CANCELLED.value],
    ).order_by("-created_at")[:50]
    return Response(ServiceRequestSerializer(qs, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ReceiptRegenerateThrottle])
def regenerate_receipt(request, request_id: int):
    """Safety net: re-enqueue PDF generation for a completed request.

    Allowed for the request's customer and any staff user. Idempotent — the
    task overwrites `receipt_url` on completion.
    """
    sr = get_object_or_404(ServiceRequest, pk=request_id)
    if not (request.user == sr.customer or request.user.is_staff):
        raise PermissionDenied("You may not regenerate this receipt.")
    if sr.status != RequestStatus.COMPLETED.value:
        raise ValidationError("Receipt is only available for completed requests.")

    from requests_app.tasks import generate_receipt

    generate_receipt.delay(sr.id)
    return Response({"status": "queued"}, status=status.HTTP_202_ACCEPTED)
