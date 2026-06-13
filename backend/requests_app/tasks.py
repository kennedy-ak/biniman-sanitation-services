"""Celery tasks for the matching cascade and request lifecycle."""
import logging
import uuid

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from requests_app.models import (
    AssignmentOutcome,
    RequestAssignment,
    RequestStatus,
    ServiceRequest,
)
from requests_app.services.matching import (
    batch_has_acceptance,
    expire_batch,
    mark_unfulfilled,
    offer_to_next_batch,
)

logger = logging.getLogger(__name__)

# When no drivers are available, retry up to this many times before giving up.
# Total wait before UNFULFILLED = MAX_CASCADE_RETRIES × CASCADE_RETRY_DELAY_SECONDS
MAX_CASCADE_RETRIES = 3          # 3 retries
CASCADE_RETRY_DELAY_SECONDS = 300  # 5 minutes between retries → up to 15 min total


@shared_task
def start_cascade(request_id: int) -> None:
    """Kick off matching for a freshly created request."""
    try:
        request = ServiceRequest.objects.get(pk=request_id)
    except ServiceRequest.DoesNotExist:
        return
    if request.status != RequestStatus.PENDING.value:
        return

    _dispatch_next_batch(request, attempt=0)


@shared_task
def retry_cascade(request_id: int, attempt: int) -> None:
    """Scheduled retry when no drivers were available in a previous cascade round."""
    try:
        request = ServiceRequest.objects.get(pk=request_id)
    except ServiceRequest.DoesNotExist:
        return
    if request.status != RequestStatus.PENDING.value:
        return
    _dispatch_next_batch(request, attempt=attempt)


@shared_task
def handle_batch_timeout(batch_uuid_str: str) -> None:
    """If batch is still open at expiry, time it out and advance to the next batch."""
    try:
        batch_uuid = uuid.UUID(batch_uuid_str)
    except (TypeError, ValueError):
        return

    if batch_has_acceptance(batch_uuid):
        return

    sample = (
        RequestAssignment.objects.select_related("request")
        .filter(batch_uuid=batch_uuid)
        .first()
    )
    if not sample:
        return

    with transaction.atomic():
        expire_batch(batch_uuid)

    request = sample.request
    request.refresh_from_db()
    if request.status != RequestStatus.ASSIGNED.value:
        return

    _dispatch_next_batch(request)


def _dispatch_next_batch(request: ServiceRequest, attempt: int = 0) -> None:
    from requests_app.services.broadcast import push_offer, push_request_status

    assignments = offer_to_next_batch(request)
    if not assignments:
        # Only retry when we haven't dispatched to anyone yet (still PENDING).
        # Once ASSIGNED, drivers were already offered and all timed out — give up.
        if request.status == RequestStatus.PENDING.value and attempt < MAX_CASCADE_RETRIES:
            retry_cascade.apply_async(
                args=[request.pk, attempt + 1],
                countdown=CASCADE_RETRY_DELAY_SECONDS,
            )
            logger.info(
                "No drivers for request %s (attempt %d/%d) — retrying in %ds",
                request.pk, attempt + 1, MAX_CASCADE_RETRIES, CASCADE_RETRY_DELAY_SECONDS,
            )
            return
        with transaction.atomic():
            mark_unfulfilled(request)
        push_request_status(request)
        return

    for assignment in assignments:
        push_offer(assignment)
    push_request_status(request)

    countdown = _seconds_until(assignments[0])
    handle_batch_timeout.apply_async(
        args=[str(assignments[0].batch_uuid)], countdown=countdown
    )


def _seconds_until(assignment: RequestAssignment) -> int:
    delta = (assignment.expires_at - timezone.now()).total_seconds()
    return max(int(delta) + 1, 1)


@shared_task
def auto_offline_stale_drivers() -> None:
    """Set is_online=False for drivers whose last_seen_at has expired.

    Drivers close the browser without going offline, leaving is_online=True
    indefinitely. The matching query already excludes them via last_seen_at,
    but leaving is_online=True is misleading and wastes admin dashboard counts.
    Runs on the same Celery Beat schedule as recover_stuck_cascades.
    """
    from datetime import timedelta
    from drivers.models import Driver

    cutoff = timezone.now() - timedelta(seconds=900)  # 15-minute hard cutoff
    stale_count = (
        Driver.objects.filter(is_online=True, last_seen_at__lt=cutoff)
        .update(is_online=False, online_since=None)
    )
    if stale_count:
        logger.info("auto_offline: marked %d stale drivers offline", stale_count)


@shared_task
def recover_stuck_cascades() -> None:
    """Periodic safety net for cascades that stalled because a Celery task was
    dropped (e.g. the worker was down when a countdown fired). Runs every 2
    minutes via Celery Beat; every action below is idempotent.

    1. PENDING with a succeeded payment → cascade never fired: re-queue it.
    2. ASSIGNED with an expired, still-PENDING offer batch → the
       handle_batch_timeout countdown never ran, so the request is frozen mid
       cascade and the customer is blocked from booking again: re-queue the
       timeout (which re-checks acceptance + status before acting).
    """
    from datetime import timedelta
    from payments.models import Payment, PaymentStatus

    grace = timezone.now() - timedelta(minutes=2)

    # 1. Payment succeeded but the request is still PENDING.
    stuck = (
        Payment.objects.filter(
            status=PaymentStatus.SUCCEEDED,
            paid_at__lte=grace,
            request__status=RequestStatus.PENDING.value,
        )
        .select_related("request")
        .values_list("request_id", flat=True)
    )
    for request_id in stuck:
        logger.warning("Recovering stuck cascade for request %s", request_id)
        start_cascade.delay(request_id)

    # 2. ASSIGNED requests whose offer batch expired but never timed out.
    stuck_batches = (
        RequestAssignment.objects.filter(
            request__status=RequestStatus.ASSIGNED.value,
            outcome=AssignmentOutcome.PENDING,
            expires_at__lte=grace,
        )
        .values_list("batch_uuid", flat=True)
        .distinct()
    )
    for batch_uuid in stuck_batches:
        if batch_uuid is None:
            continue
        logger.warning("Recovering stuck assigned batch %s", batch_uuid)
        handle_batch_timeout.delay(str(batch_uuid))


@shared_task
def generate_receipt(request_id: int) -> None:
    """Render and upload a PDF receipt for a completed request."""
    try:
        sr = (
            ServiceRequest.objects
            .select_related("customer", "driver__user", "payment", "region")
            .get(pk=request_id)
        )
    except ServiceRequest.DoesNotExist:
        return
    if sr.status != RequestStatus.COMPLETED.value:
        return

    from requests_app.services.receipt import build_and_upload_receipt

    build_and_upload_receipt(sr)
