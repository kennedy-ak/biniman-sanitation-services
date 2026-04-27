from __future__ import annotations

import math
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from accounts.models import Region
from pricing.models import PricingConfig, VolumeTier

EARTH_RADIUS_KM = 6371.0088


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in km between two coordinates."""
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat = rlat2 - rlat1
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def get_or_default_config(region: Optional[Region]) -> PricingConfig:
    if region is None:
        # Fallback: use the first region's config or create a transient default.
        first = Region.objects.first()
        if first is None:
            return PricingConfig(region_id=0)  # transient — no DB
        region = first
    config, _ = PricingConfig.objects.get_or_create(region=region)
    return config


@dataclass
class Quote:
    base_fee: Decimal
    distance_km: Decimal
    distance_fee: Decimal
    tier_fee: Decimal
    total: Decimal
    commission: Decimal
    driver_payout: Decimal


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calculate_quote(
    *,
    region: Optional[Region],
    distance_km: float,
    volume_tier: str,
    driver_base_fee: Decimal,
) -> Quote:
    config = get_or_default_config(region)

    base = max(min(driver_base_fee, config.base_fee_max), config.base_fee_min)
    distance_fee = config.distance_rate_per_km * Decimal(str(round(distance_km, 2)))
    tier_fee = config.tier_fee(volume_tier)
    total = base + distance_fee + tier_fee
    commission = total * (config.commission_pct / Decimal("100"))
    payout = total - commission

    return Quote(
        base_fee=_q(base),
        distance_km=Decimal(str(round(distance_km, 2))),
        distance_fee=_q(distance_fee),
        tier_fee=_q(tier_fee),
        total=_q(total),
        commission=_q(commission),
        driver_payout=_q(payout),
    )


__all__ = ["haversine_km", "get_or_default_config", "Quote", "calculate_quote", "VolumeTier"]
