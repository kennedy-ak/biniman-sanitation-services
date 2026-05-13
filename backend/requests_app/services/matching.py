"""Driver matching + cascade engine.

Pipeline per cascade round:

1. Filter approved + online + fresh + idle drivers within the region's
   matching radius (haversine).
2. Refine the top-K closest with road distance (Mapbox, haversine fallback).
3. Score each candidate with a composite of distance, rating, and a fairness
   penalty for drivers who just completed a job.
4. Offer the request to the top-N as a parallel batch sharing a `batch_uuid`.

First accept wins (see `views.driver_accept`); siblings are marked SUPERSEDED.
"""
from __future__ import annotations

import logging
import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Optional

from django.db import transaction
from django.db.models import Avg
from django.utils import timezone

from drivers.models import Driver, DriverStatus
from pricing.distance import road_distance_km
from pricing.models import PricingConfig
from pricing.services import haversine_km
from ratings.models import Rating
from requests_app.models import (
    AssignmentOutcome,
    RequestAssignment,
    RequestStatus,
    ServiceRequest,
)

logger = logging.getLogger(__name__)

# Neutral default rating used when a driver has no completed ratings yet.
DEFAULT_RATING = 4.0
# Window for the fairness penalty: drivers with an ACCEPTED assignment in the
# last hour get a small penalty so work spreads across the pool.
FAIRNESS_WINDOW = timedelta(hours=1)


def _config_for(request: ServiceRequest) -> PricingConfig:
    config, _ = PricingConfig.objects.get_or_create(region=request.region)
    return config


def _drivers_already_invited(request: ServiceRequest) -> set[int]:
    return set(request.assignments.values_list("driver_id", flat=True))


def _busy_driver_ids() -> set[int]:
    return set(
        ServiceRequest.objects.filter(
            driver__isnull=False,
            status__in=[
                RequestStatus.ASSIGNED,
                RequestStatus.ACCEPTED,
                RequestStatus.EN_ROUTE,
                RequestStatus.ARRIVED,
            ],
        ).values_list("driver_id", flat=True)
    )


def _avg_ratings_for(driver_user_ids: list[int]) -> dict[int, float]:
    if not driver_user_ids:
        return {}
    rows = (
        Rating.objects.filter(rated_user_id__in=driver_user_ids)
        .values("rated_user_id")
        .annotate(avg=Avg("score"))
    )
    return {r["rated_user_id"]: float(r["avg"]) for r in rows if r["avg"] is not None}


def _recently_active_driver_ids(driver_ids: list[int]) -> set[int]:
    if not driver_ids:
        return set()
    since = timezone.now() - FAIRNESS_WINDOW
    return set(
        RequestAssignment.objects.filter(
            driver_id__in=driver_ids,
            outcome=AssignmentOutcome.ACCEPTED,
            decided_at__gte=since,
        ).values_list("driver_id", flat=True)
    )


def candidate_drivers(request: ServiceRequest) -> list[tuple[Driver, float, float]]:
    """Return ranked (driver, distance_km, score) tuples — best first (lowest score).

    Filters: approved, online, has location, fresh `last_seen_at`, idle,
    within `matching_radius_km`. Top-K refined by road distance; scored by
    composite of normalized distance, inverse rating, and fairness penalty.
    """
    config = _config_for(request)
    radius = float(config.matching_radius_km)
    stale_cutoff = timezone.now() - timedelta(seconds=int(config.driver_stale_after_seconds))

    qs = (
        Driver.objects.select_related("user")
        .filter(status=DriverStatus.APPROVED, is_online=True)
        .filter(last_seen_at__gte=stale_cutoff)
        .exclude(last_lat__isnull=True)
        .exclude(last_lng__isnull=True)
        .exclude(id__in=list(_busy_driver_ids()))
    )

    pickup_lat = float(request.pickup_lat)
    pickup_lng = float(request.pickup_lng)

    # Stage 1: haversine prefilter inside radius.
    near: list[tuple[Driver, float]] = []
    for driver in qs:
        d_km = haversine_km(
            pickup_lat, pickup_lng,
            float(driver.last_lat), float(driver.last_lng),
        )
        if d_km <= radius:
            near.append((driver, d_km))
    if not near:
        return []
    near.sort(key=lambda t: t[1])

    # Stage 2: refine top-K with road distance.
    k = int(config.eta_refine_top_k)
    refined: list[tuple[Driver, float]] = []
    for driver, hav_km in near[:k]:
        road_km = road_distance_km(
            from_lat=float(driver.last_lat), from_lng=float(driver.last_lng),
            to_lat=pickup_lat, to_lng=pickup_lng,
        )
        refined.append((driver, road_km))
    # Anything past K keeps its haversine estimate.
    for driver, hav_km in near[k:]:
        refined.append((driver, hav_km))

    # Stage 3: batched rating + fairness lookups.
    driver_user_ids = [d.user_id for d, _ in refined]
    driver_ids = [d.id for d, _ in refined]
    ratings_map = _avg_ratings_for(driver_user_ids)
    recently_active = _recently_active_driver_ids(driver_ids)

    w_dist = float(config.rank_weight_distance)
    w_rate = float(config.rank_weight_rating)
    w_fair = float(config.rank_weight_fairness)
    radius_for_norm = radius if radius > 0 else 1.0

    scored: list[tuple[Driver, float, float]] = []
    for driver, distance_km in refined:
        norm_dist = min(distance_km / radius_for_norm, 1.0)
        rating = ratings_map.get(driver.user_id, DEFAULT_RATING)
        norm_rating_gap = max(0.0, (5.0 - rating)) / 5.0
        fairness = 1.0 if driver.id in recently_active else 0.0
        score = w_dist * norm_dist + w_rate * norm_rating_gap + w_fair * fairness
        scored.append((driver, distance_km, score))

    scored.sort(key=lambda t: (t[2], t[1]))
    return scored


def offer_to_next_batch(request: ServiceRequest) -> list[RequestAssignment]:
    """Create a parallel-offer batch to the top-N unoffered candidates.

    Returns the list of new assignments (empty if no candidates remain).
    `request.driver` is NOT set here — it is written only when a driver accepts.
    """
    if request.status not in {RequestStatus.PENDING.value, RequestStatus.ASSIGNED.value}:
        return []

    config = _config_for(request)
    already = _drivers_already_invited(request)
    eligible = [c for c in candidate_drivers(request) if c[0].id not in already]
    if not eligible:
        return []

    batch_size = max(1, int(config.parallel_offer_count))
    chosen = eligible[:batch_size]
    expires_at = timezone.now() + timedelta(seconds=int(config.accept_window_seconds))
    batch_id = uuid.uuid4()

    with transaction.atomic():
        assignments = [
            RequestAssignment.objects.create(
                request=request,
                driver=driver,
                distance_km=Decimal(str(round(distance_km, 2))),
                expires_at=expires_at,
                batch_uuid=batch_id,
            )
            for driver, distance_km, _score in chosen
        ]
        if request.status == RequestStatus.PENDING.value:
            request.transition(RequestStatus.ASSIGNED.value)
            request.save(update_fields=["status"])

    logger.info(
        "Offered request %s to batch %s (%d drivers)",
        request.pk, batch_id, len(assignments),
    )
    return assignments


def mark_unfulfilled(request: ServiceRequest) -> None:
    if request.status not in {RequestStatus.PENDING.value, RequestStatus.ASSIGNED.value}:
        return
    request.driver = None
    request.transition(RequestStatus.UNFULFILLED.value)
    request.save(update_fields=["driver", "status"])
    logger.info("Request %s marked unfulfilled", request.pk)

    from payments.tasks import task_refund_request

    task_refund_request.delay(request.pk, "Unfulfilled — no driver available")


def expire_batch(batch_uuid: uuid.UUID) -> int:
    """Mark all still-PENDING assignments in a batch as TIMEOUT.

    Returns count of newly timed-out assignments.
    """
    now = timezone.now()
    return RequestAssignment.objects.filter(
        batch_uuid=batch_uuid,
        outcome=AssignmentOutcome.PENDING,
    ).update(outcome=AssignmentOutcome.TIMEOUT, decided_at=now)


def batch_has_acceptance(batch_uuid: uuid.UUID) -> bool:
    return RequestAssignment.objects.filter(
        batch_uuid=batch_uuid, outcome=AssignmentOutcome.ACCEPTED
    ).exists()
