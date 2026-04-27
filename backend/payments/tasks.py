"""Celery tasks for payment lifecycle."""
import logging

from celery import shared_task

from payments.services.orchestrator import refund_request, trigger_payout
from requests_app.models import ServiceRequest

logger = logging.getLogger(__name__)


@shared_task
def task_refund_request(request_id: int, reason: str = "") -> None:
    try:
        sr = ServiceRequest.objects.get(pk=request_id)
    except ServiceRequest.DoesNotExist:
        return
    refund_request(sr, reason=reason)


@shared_task
def task_trigger_payout(request_id: int) -> None:
    try:
        sr = ServiceRequest.objects.select_related("driver", "driver__user").get(pk=request_id)
    except ServiceRequest.DoesNotExist:
        return
    trigger_payout(sr)
