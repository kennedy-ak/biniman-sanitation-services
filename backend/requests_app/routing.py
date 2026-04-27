from django.urls import path

from requests_app.consumers import DriverConsumer, RequestConsumer

websocket_urlpatterns = [
    path("ws/driver/", DriverConsumer.as_asgi()),
    path("ws/request/<int:request_id>/", RequestConsumer.as_asgi()),
]
