from decimal import Decimal

from django.db import models


class VolumeTier(models.TextChoices):
    SMALL = "small", "Small load (under 50%)"
    MEDIUM = "medium", "Medium load (50–75%)"
    FULL = "full", "Full load (75–100%)"


class PricingConfig(models.Model):
    """Per-region pricing configuration. One active row per region.

    Multiplicative model (snapshotted onto each request at booking):
        subtotal = base_fee + distance_rate_per_km × max(loop_km, min_billable_km)
        total    = ROUND(subtotal × volume_multiplier × trips_multiplier, 0)
    where volume_multiplier discounts partial loads and trips_multiplier adds
    a per-extra-trip surcharge.
    """

    region = models.OneToOneField(
        "accounts.Region", on_delete=models.CASCADE, related_name="pricing"
    )

    # Base + distance
    base_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("879"))
    distance_rate_per_km = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("20"))
    min_billable_km = models.PositiveIntegerField(default=10)

    # Volume tier discounts (full load is the baseline at 0%)
    small_discount_pct = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("30"))
    medium_discount_pct = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("15"))

    # Multi-trip surcharge applied per extra trip beyond the first
    extra_trip_surcharge_pct = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("80"))

    commission_pct = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("15"))

    # Standard radius: beyond this driver→pickup distance the rider must confirm
    # the (higher) price before paying. Not a hard matching cap.
    matching_radius_km = models.PositiveIntegerField(default=20)
    accept_window_seconds = models.PositiveIntegerField(default=60)

    # Dispatch tuning — see requests_app.services.matching
    parallel_offer_count = models.PositiveSmallIntegerField(default=3)
    eta_refine_top_k = models.PositiveSmallIntegerField(default=5)
    driver_stale_after_seconds = models.PositiveIntegerField(default=1800)
    rank_weight_distance = models.DecimalField(max_digits=3, decimal_places=2, default=Decimal("0.55"))
    rank_weight_rating = models.DecimalField(max_digits=3, decimal_places=2, default=Decimal("0.25"))
    rank_weight_fairness = models.DecimalField(max_digits=3, decimal_places=2, default=Decimal("0.20"))

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Pricing config"
        verbose_name_plural = "Pricing configs"

    def __str__(self) -> str:
        return f"Pricing for {self.region.name}"


class DisposalSite(models.Model):
    """A composite / waste treatment plant (point C in the A→B→C→A loop).

    Waste collected at the rider's pickup is hauled here for disposal. For now a
    single active row is seeded (KCARP, Kumasi); the quote engine picks the active
    site via `pricing.services.get_active_disposal_site`.
    """

    name = models.CharField(max_length=120)
    region = models.ForeignKey(
        "accounts.Region",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="disposal_sites",
    )
    lat = models.DecimalField(max_digits=10, decimal_places=7)
    lng = models.DecimalField(max_digits=10, decimal_places=7)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Disposal site"
        verbose_name_plural = "Disposal sites"

    def __str__(self) -> str:
        return self.name
