from django.contrib import admin

from .models import PricingConfig


@admin.register(PricingConfig)
class PricingConfigAdmin(admin.ModelAdmin):
    list_display = (
        "region", "base_fee_min", "base_fee_max", "distance_rate_per_km",
        "commission_pct", "matching_radius_km",
    )
