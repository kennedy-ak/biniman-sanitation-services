"""Driver matching + cascade engine."""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Iterable, Optional

from django.db import transaction
from django.utils import timezone

from drivers.models import Driver, DriverStatus
from pricing.models import PricingConfig
from pricing.services import haversine_km
from requests_app.models import (
    AssignmentOutcome,
    RequestAssignment,
    RequestStatus,
    ServiceRequest,
)

logger = logging.getLogger(__name__)


def _config_for(request: ServiceRequest) -> PricingConfig:
    config, _ = PricingConfig.objects.get_or_create(region=request.region)
    return config


def candidate_drivers(request: ServiceRequest) -> list[tuple[Driver, float]]:
    """Return online, approved, idle drivers within radius, ranked by distance."""
    config = _config_for(request)
    radius = config.matching_radius_km

    qs = (
        Driver.objects.select_related("user")
        .filter(status=DriverStatus.APPROVED, is_online=True)
        .exclude(last_lat__isnull=True)
        .exclude(last_lng__isnull=True)
    )
    # Exclude drivers with active jobs (any non-terminal request).
    busy_ids = ServiceRequest.objects.filter(
        driver__isnull=False,
        status__in=[
            RequestStatus.ASSIGNED, RequestStatus.ACCEPTED,
            RequestStatus.EN_ROUTE, RequestStatus.ARRIVED,
        ],
    ).values_list("driver_id", flat=True)
    qs = qs.exclude(id__in=list(busy_ids))

    pickup_lat = float(request.pickup_lat)
    pickup_lng = float(request.pickup_lng)

    ranked: list[tuple[Driver, float]] = []
    for driver in qs:
        d_km = haversine_km(
            pickup_lat, pickup_lng,
            float(driver.last_lat), float(driver.last_lng),
        )
        if d_km <= radius:
            ranked.append((driver, d_km))
    ranked.sort(key=lambda t: t[1])
    return ranked


def _drivers_already_offered(request: ServiceRequest) -> set[int]:
    return set(
        request.assignments.exclude(outcome=AssignmentOutcome.PENDING).values_list("driver_id", flat=True)
    ) | set(
        request.assignments.filter(outcome=AssignmentOutcome.PENDING).values_list("driver_id", flat=True)
    )


def offer_to_next_driver(request: ServiceRequest) -> Optional[RequestAssignment]:
    """Find the next-closest unoffered driver and create a pending assignment.

    Returns the new assignment or None if no candidates remain.
    Caller is responsible for triggering the cascade timeout task.
    """
    if request.status not in {RequestStatus.PENDING.value, RequestStatus.ASSIGNED.value}:
        return None

    config = _config_for(request)
    already = _drivers_already_offered(request)
    candidates = [c for c in candidate_drivers(request) if c[0].id not in already]
    if not candidates:
        return None

    driver, distance_km = candidates[0]
    expires_at = timezone.now() + timedelta(seconds=config.accept_window_seconds)

    with transaction.atomic():
        assignment = RequestAssignment.objects.create(
            request=request,
            driver=driver,
            distance_km=round(distance_km, 2),
            expires_at=expires_at,
        )
        request.driver = driver
        request.transition(RequestStatus.ASSIGNED.value)
        request.save(update_fields=["driver", "status"])

    logger.info("Offered request %s to driver %s (%.2f km)", request.pk, driver.pk, distance_km)
    return assignment


def mark_unfulfilled(request: ServiceRequest) -> None:
    if request.status not in {RequestStatus.PENDING.value, RequestStatus.ASSIGNED.value}:
        return
    request.driver = None
    request.transition(RequestStatus.UNFULFILLED.value)
    request.save(update_fields=["driver", "status"])
    logger.info("Request %s marked unfulfilled", request.pk)

    from payments.tasks import task_refund_request

    task_refund_request.delay(request.pk, "Unfulfilled — no driver available")


def expire_pending_assignment(assignment: RequestAssignment) -> bool:
    """Mark an assignment as TIMEOUT if it is still pending and past its expiry.

    Returns True if it was expired by this call (meaning the cascade should advance).
    """
    if assignment.outcome != AssignmentOutcome.PENDING:
        return False
    if timezone.now() < assignment.expires_at:
        return False
    assignment.outcome = AssignmentOutcome.TIMEOUT
    assignment.decided_at = timezone.now()
    assignment.save(update_fields=["outcome", "decided_at"])
    return True
