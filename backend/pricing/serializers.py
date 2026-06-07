from rest_framework import serializers

from accounts.serializers import RegionSerializer
from pricing.models import PricingConfig

_CONFIG_FIELDS = (
    "base_fee", "distance_rate_per_km", "min_billable_km",
    "small_discount_pct", "medium_discount_pct", "extra_trip_surcharge_pct",
    "commission_pct", "matching_radius_km", "accept_window_seconds",
)


class PricingConfigSerializer(serializers.ModelSerializer):
    region = RegionSerializer(read_only=True)

    class Meta:
        model = PricingConfig
        fields = ("region", *_CONFIG_FIELDS, "updated_at")
        read_only_fields = ("region", "updated_at")


class PricingConfigUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PricingConfig
        fields = _CONFIG_FIELDS
