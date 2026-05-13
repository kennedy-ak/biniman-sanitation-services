"""Celery tasks for the matching cascade and request lifecycle."""
import logging
import uuid

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from requests_app.models import RequestAssignment, RequestStatus, ServiceRequest
from requests_app.services.matching import (
    batch_has_acceptance,
    expire_batch,
    mark_unfulfilled,
    offer_to_next_batch,
)

logger = logging.getLogger(__name__)


@shared_task
def start_cascade(request_id: int) -> None:
    """Kick off matching for a freshly created request."""
    try:
        request = ServiceRequest.objects.get(pk=request_id)
    except ServiceRequest.DoesNotExist:
        return
    if request.status != RequestStatus.PENDING.value:
        return

    _dispatch_next_batch(request)


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


def _dispatch_next_batch(request: ServiceRequest) -> None:
    from requests_app.services.broadcast import push_offer, push_request_status

    assignments = offer_to_next_batch(request)
    if not assignments:
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
