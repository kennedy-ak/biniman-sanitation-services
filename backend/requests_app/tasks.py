"""Celery tasks for the matching cascade and request lifecycle."""
import logging

from celery import shared_task
from django.db import transaction

from requests_app.models import RequestAssignment, RequestStatus, ServiceRequest
from requests_app.services.matching import (
    expire_pending_assignment,
    mark_unfulfilled,
    offer_to_next_driver,
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

    assignment = offer_to_next_driver(request)
    if not assignment:
        mark_unfulfilled(request)
        from requests_app.services.broadcast import push_request_status
        push_request_status(request)
        return

    from requests_app.services.broadcast import push_offer, push_request_status
    push_offer(assignment)
    push_request_status(request)
    handle_offer_timeout.apply_async(args=[assignment.id], countdown=_seconds_until(assignment))


@shared_task
def handle_offer_timeout(assignment_id: int) -> None:
    """Run when an offer's accept window has elapsed. If still pending, advance cascade."""
    try:
        assignment = RequestAssignment.objects.select_related("request").get(pk=assignment_id)
    except RequestAssignment.DoesNotExist:
        return

    if not expire_pending_assignment(assignment):
        return

    request = assignment.request
    request.refresh_from_db()
    if request.status != RequestStatus.ASSIGNED.value:
        return

    from requests_app.services.broadcast import push_offer, push_request_status

    next_assignment = offer_to_next_driver(request)
    if not next_assignment:
        with transaction.atomic():
            mark_unfulfilled(request)
        push_request_status(request)
        return

    push_offer(next_assignment)
    push_request_status(request)
    handle_offer_timeout.apply_async(
        args=[next_assignment.id], countdown=_seconds_until(next_assignment)
    )


def _seconds_until(assignment: RequestAssignment) -> int:
    from django.utils import timezone

    delta = (assignment.expires_at - timezone.now()).total_seconds()
    return max(int(delta) + 1, 1)
