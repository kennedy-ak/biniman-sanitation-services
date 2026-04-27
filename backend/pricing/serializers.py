from rest_framework import serializers

from accounts.serializers import RegionSerializer
from pricing.models import PricingConfig


class PricingConfigSerializer(serializers.ModelSerializer):
    region = RegionSerializer(read_only=True)

    class Meta:
        model = PricingConfig
        fields = (
            "region", "base_fee_min", "base_fee_max", "distance_rate_per_km",
            "tier_small_fee", "tier_medium_fee", "tier_large_fee",
            "commission_pct", "matching_radius_km", "accept_window_seconds",
            "updated_at",
        )
        read_only_fields = ("region", "updated_at")


class PricingConfigUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PricingConfig
        fields = (
            "base_fee_min", "base_fee_max", "distance_rate_per_km",
            "tier_small_fee", "tier_medium_fee", "tier_large_fee",
            "commission_pct", "matching_radius_km", "accept_window_seconds",
        )
