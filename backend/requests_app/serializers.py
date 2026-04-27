from decimal import Decimal

from rest_framework import serializers

from accounts.serializers import UserSerializer
from drivers.serializers import DriverSerializer
from requests_app.models import (
    AssignmentOutcome,
    RequestAssignment,
    RequestStatus,
    ServiceRequest,
    WasteType,
)


class CreateRequestSerializer(serializers.Serializer):
    region_id = serializers.IntegerField()
    waste_type = serializers.ChoiceField(choices=WasteType.choices)
    volume_tier = serializers.ChoiceField(choices=["small", "medium", "large"])
    pickup_lat = serializers.DecimalField(max_digits=10, decimal_places=7)
    pickup_lng = serializers.DecimalField(max_digits=10, decimal_places=7)
    pickup_address = serializers.CharField(allow_blank=True, max_length=300, required=False, default="")
    notes = serializers.CharField(allow_blank=True, required=False, default="")


class QuotePreviewSerializer(serializers.Serializer):
    base_fee = serializers.DecimalField(max_digits=10, decimal_places=2)
    distance_km = serializers.DecimalField(max_digits=8, decimal_places=2)
    distance_fee = serializers.DecimalField(max_digits=10, decimal_places=2)
    tier_fee = serializers.DecimalField(max_digits=10, decimal_places=2)
    total = serializers.DecimalField(max_digits=10, decimal_places=2)
    commission = serializers.DecimalField(max_digits=10, decimal_places=2)
    driver_payout = serializers.DecimalField(max_digits=10, decimal_places=2)


class ServiceRequestSerializer(serializers.ModelSerializer):
    customer = UserSerializer(read_only=True)
    driver = DriverSerializer(read_only=True)

    class Meta:
        model = ServiceRequest
        fields = (
            "id", "customer", "driver", "region",
            "waste_type", "volume_tier",
            "pickup_lat", "pickup_lng", "pickup_address", "notes",
            "quote_total", "quote_base_fee", "quote_distance_km",
            "quote_distance_fee", "quote_tier_fee", "commission_amount",
            "status", "cancel_reason",
            "created_at", "accepted_at", "en_route_at",
            "arrived_at", "completed_at", "cancelled_at",
        )
        read_only_fields = fields


class RequestAssignmentSerializer(serializers.ModelSerializer):
    request = ServiceRequestSerializer(read_only=True)

    class Meta:
        model = RequestAssignment
        fields = ("id", "request", "distance_km", "expires_at", "outcome", "created_at")
        read_only_fields = fields


class StatusTransitionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[s.value for s in RequestStatus]
    )


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField(allow_blank=True, max_length=500, required=False, default="")


class LocationPingSerializer(serializers.Serializer):
    lat = serializers.DecimalField(max_digits=10, decimal_places=7)
    lng = serializers.DecimalField(max_digits=10, decimal_places=7)


class OnlineToggleSerializer(serializers.Serializer):
    is_online = serializers.BooleanField()
    lat = serializers.DecimalField(max_digits=10, decimal_places=7, required=False)
    lng = serializers.DecimalField(max_digits=10, decimal_places=7, required=False)


class QuoteRequestSerializer(serializers.Serializer):
    region_id = serializers.IntegerField()
    pickup_lat = serializers.DecimalField(max_digits=10, decimal_places=7)
    pickup_lng = serializers.DecimalField(max_digits=10, decimal_places=7)
    volume_tier = serializers.ChoiceField(choices=["small", "medium", "large"])
