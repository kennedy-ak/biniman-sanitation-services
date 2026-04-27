"""WebSocket consumers for live job offers (driver) and request status (customer)."""
import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser

from requests_app.models import ServiceRequest


def _driver_group(driver_id: int) -> str:
    return f"driver-{driver_id}"


def _request_group(request_id: int) -> str:
    return f"request-{request_id}"


class DriverConsumer(AsyncJsonWebsocketConsumer):
    """Drivers subscribe to receive live job offers tied to their driver profile."""

    async def connect(self):
        user = self.scope.get("user", AnonymousUser())
        if not user or not user.is_authenticated or user.role != "driver":
            await self.close(code=4401)
            return

        driver_id = await self._driver_id(user)
        if not driver_id:
            await self.close(code=4403)
            return

        self.group_name = _driver_group(driver_id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({"type": "connected", "driver_id": driver_id})

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def offer_new(self, event):
        await self.send_json(event)

    @database_sync_to_async
    def _driver_id(self, user) -> int | None:
        return getattr(getattr(user, "driver_profile", None), "id", None)


class RequestConsumer(AsyncJsonWebsocketConsumer):
    """Customers subscribe to live status of a specific request they own."""

    async def connect(self):
        user = self.scope.get("user", AnonymousUser())
        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return

        request_id = int(self.scope["url_route"]["kwargs"]["request_id"])
        allowed = await self._can_access(user, request_id)
        if not allowed:
            await self.close(code=4403)
            return

        self.group_name = _request_group(request_id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({"type": "connected", "request_id": request_id})

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def request_status(self, event):
        await self.send_json(event)

    async def driver_location(self, event):
        await self.send_json(event)

    @database_sync_to_async
    def _can_access(self, user, request_id: int) -> bool:
        try:
            sr = ServiceRequest.objects.select_related("driver").get(pk=request_id)
        except ServiceRequest.DoesNotExist:
            return False
        if sr.customer_id == user.id:
            return True
        driver = getattr(user, "driver_profile", None)
        if driver and sr.driver_id == driver.id:
            return True
        return user.is_staff
