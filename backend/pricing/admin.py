from django.contrib import admin

from .models import DisposalSite, PricingConfig


@admin.register(PricingConfig)
class PricingConfigAdmin(admin.ModelAdmin):
    list_display = (
        "region", "base_fee", "distance_rate_per_km", "min_billable_km",
        "small_discount_pct", "medium_discount_pct", "extra_trip_surcharge_pct",
        "commission_pct", "matching_radius_km",
    )


@admin.register(DisposalSite)
class DisposalSiteAdmin(admin.ModelAdmin):
    """Manage the disposal sites (point C). Add as many as needed — the quote
    engine picks the active site nearest each pickup for the A→B→C→A loop."""

    list_display = ("name", "region", "lat", "lng", "is_active", "created_at")
    list_editable = ("is_active",)
    list_filter = ("is_active", "region")
    search_fields = ("name",)
    ordering = ("name",)
    readonly_fields = ("created_at",)
    fieldsets = (
        (None, {"fields": ("name", "region", "is_active")}),
        ("Location", {
            "fields": ("lat", "lng"),
            "description": "Decimal degrees, e.g. lat 6.5983125, lng -1.5840625.",
        }),
        ("Meta", {"fields": ("created_at",)}),
    )
