from decimal import Decimal

from rest_framework import serializers

from accounts.serializers import UserSerializer
from drivers.serializers import DriverSerializer
from requests_app.models import (
    AssignmentOutcome,
    GateFit,
    LastEmptied,
    ParkingDistance,
    PreferredTime,
    RequestAssignment,
    RequestStatus,
    ServiceRequest,
    TankCoverState,
    TankLocation,
    WasteType,
)


class CreateRequestSerializer(serializers.Serializer):
    region_id = serializers.IntegerField()
    waste_type = serializers.ChoiceField(choices=WasteType.choices)
    volume_tier = serializers.ChoiceField(choices=["small", "medium", "full"])
    num_trips = serializers.IntegerField(min_value=1, max_value=3, required=False, default=1)
    # Rider's explicit consent to a higher price when the nearest driver is
    # beyond the standard radius. Required by the server before such a booking.
    accept_expanded = serializers.BooleanField(required=False, default=False)
    pickup_lat = serializers.DecimalField(max_digits=10, decimal_places=7)
    pickup_lng = serializers.DecimalField(max_digits=10, decimal_places=7)
    pickup_address = serializers.CharField(allow_blank=True, max_length=300, required=False, default="")
    notes = serializers.CharField(allow_blank=True, required=False, default="")

    # Site survey
    gate_fits_truck = serializers.ChoiceField(choices=GateFit.choices, required=False, allow_blank=True)
    gate_photo = serializers.ImageField(required=False, allow_null=True)
    tank_location = serializers.ChoiceField(choices=TankLocation.choices, required=False, allow_blank=True)
    truck_parking_distance = serializers.ChoiceField(
        choices=ParkingDistance.choices, required=False, allow_blank=True
    )
    tank_cover_photo = serializers.ImageField(required=False, allow_null=True)
    tank_cover_state = serializers.ChoiceField(
        choices=TankCoverState.choices, required=False, allow_blank=True
    )
    last_emptied = serializers.ChoiceField(choices=LastEmptied.choices, required=False, allow_blank=True)
    is_overflowing = serializers.BooleanField(required=False, allow_null=True)
    preferred_time = serializers.ChoiceField(choices=PreferredTime.choices, required=False, allow_blank=True)
    someone_on_site = serializers.BooleanField(required=False, allow_null=True)


class QuotePreviewSerializer(serializers.Serializer):
    base_fee = serializers.DecimalField(max_digits=10, decimal_places=2)
    distance_km = serializers.DecimalField(max_digits=8, decimal_places=2)
    billable_distance_km = serializers.DecimalField(max_digits=8, decimal_places=2)
    distance_fee = serializers.DecimalField(max_digits=10, decimal_places=2)
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2)
    volume_tier = serializers.CharField()
    volume_multiplier = serializers.DecimalField(max_digits=4, decimal_places=2)
    adjusted_subtotal = serializers.DecimalField(max_digits=10, decimal_places=2)
    num_trips = serializers.IntegerField()
    trips_multiplier = serializers.DecimalField(max_digits=4, decimal_places=2)
    total = serializers.DecimalField(max_digits=10, decimal_places=2)
    commission = serializers.DecimalField(max_digits=10, decimal_places=2)
    driver_payout = serializers.DecimalField(max_digits=10, decimal_places=2)
    # `nearest_driver_km`, `requires_confirmation` and `no_drivers` are attached
    # to the response dict in the view — they are booking context, not Quote data.


class ServiceRequestSerializer(serializers.ModelSerializer):
    customer = UserSerializer(read_only=True)
    driver = DriverSerializer(read_only=True)
    payment_status = serializers.SerializerMethodField()

    class Meta:
        model = ServiceRequest
        fields = (
            "id", "customer", "driver", "region",
            "waste_type", "volume_tier",
            "pickup_lat", "pickup_lng", "pickup_address", "notes",
            "gate_fits_truck", "gate_photo", "tank_location",
            "truck_parking_distance", "tank_cover_photo", "tank_cover_state",
            "last_emptied", "is_overflowing", "preferred_time", "someone_on_site",
            "num_trips",
            "quote_total", "quote_base_fee", "quote_distance_km",
            "quote_billable_distance_km", "quote_distance_fee",
            "quote_volume_multiplier", "quote_trips_multiplier", "commission_amount",
            "status", "cancel_reason", "payment_status",
            "created_at", "accepted_at", "en_route_at",
            "arrived_at", "completed_at", "cancelled_at",
            "receipt_url", "receipt_generated_at",
        )
        read_only_fields = fields

    def get_payment_status(self, obj) -> str | None:
        payment = getattr(obj, "payment", None)
        return payment.status if payment else None


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
    volume_tier = serializers.ChoiceField(choices=["small", "medium", "full"])
    num_trips = serializers.IntegerField(min_value=1, max_value=3, required=False, default=1)
