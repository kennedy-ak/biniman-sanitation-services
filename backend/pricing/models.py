from decimal import Decimal

from django.db import models


class VolumeTier(models.TextChoices):
    SMALL = "small", "Small (≤ 2,000L)"
    MEDIUM = "medium", "Medium (2,000–5,000L)"
    LARGE = "large", "Large (5,000L+)"


class PricingConfig(models.Model):
    """Per-region pricing configuration. One active row per region."""

    region = models.OneToOneField(
        "accounts.Region", on_delete=models.CASCADE, related_name="pricing"
    )
    base_fee_min = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("30"))
    base_fee_max = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("150"))
    distance_rate_per_km = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("3"))

    tier_small_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("50"))
    tier_medium_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("100"))
    tier_large_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("200"))

    commission_pct = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("15"))

    matching_radius_km = models.PositiveIntegerField(default=15)
    accept_window_seconds = models.PositiveIntegerField(default=60)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Pricing config"
        verbose_name_plural = "Pricing configs"

    def __str__(self) -> str:
        return f"Pricing for {self.region.name}"

    def tier_fee(self, tier: str) -> Decimal:
        return {
            VolumeTier.SMALL: self.tier_small_fee,
            VolumeTier.MEDIUM: self.tier_medium_fee,
            VolumeTier.LARGE: self.tier_large_fee,
        }[tier]
