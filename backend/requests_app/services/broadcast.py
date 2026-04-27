"""Channels broadcast helpers — push offers + status updates over WebSocket."""
from __future__ import annotations

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from requests_app.models import RequestAssignment, ServiceRequest

logger = logging.getLogger(__name__)


def _layer():
    layer = get_channel_layer()
    if layer is None:
        logger.warning("No channel layer configured")
    return layer


def driver_group(driver_id: int) -> str:
    return f"driver-{driver_id}"


def request_group(request_id: int) -> str:
    return f"request-{request_id}"


def push_offer(assignment: RequestAssignment) -> None:
    layer = _layer()
    if not layer:
        return
    payload = {
        "type": "offer.new",
        "assignment_id": assignment.id,
        "request_id": assignment.request_id,
        "distance_km": float(assignment.distance_km),
        "expires_at": assignment.expires_at.isoformat(),
        "request": _request_brief(assignment.request),
    }
    async_to_sync(layer.group_send)(driver_group(assignment.driver_id), payload)


def push_request_status(request: ServiceRequest) -> None:
    layer = _layer()
    if not layer:
        return
    payload = {
        "type": "request.status",
        "request_id": request.id,
        "status": request.status,
        "driver_id": request.driver_id,
    }
    async_to_sync(layer.group_send)(request_group(request.id), payload)


def push_driver_location(*, request_id: int, driver_id: int, lat: float, lng: float) -> None:
    layer = _layer()
    if not layer:
        return
    payload = {
        "type": "driver.location",
        "request_id": request_id,
        "driver_id": driver_id,
        "lat": lat,
        "lng": lng,
    }
    async_to_sync(layer.group_send)(request_group(request_id), payload)


def _request_brief(request: ServiceRequest) -> dict:
    return {
        "id": request.id,
        "waste_type": request.waste_type,
        "volume_tier": request.volume_tier,
        "pickup_lat": float(request.pickup_lat),
        "pickup_lng": float(request.pickup_lng),
        "pickup_address": request.pickup_address,
        "quote_total": str(request.quote_total),
        "notes": request.notes,
    }
