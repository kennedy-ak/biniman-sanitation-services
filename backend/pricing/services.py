from __future__ import annotations

import math
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from accounts.models import Region
from pricing.models import DisposalSite, PricingConfig, VolumeTier

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


def get_active_disposal_site() -> Optional["DisposalSite"]:
    """The composite plant (C). For now a single active row; lowest id wins."""
    return DisposalSite.objects.filter(is_active=True).order_by("id").first()


@dataclass
class Quote:
    base_fee: Decimal
    distance_km: Decimal               # actual A→B→C→A loop distance
    billable_distance_km: Decimal      # max(loop, min_billable_km)
    distance_fee: Decimal
    subtotal: Decimal
    volume_tier: str
    volume_multiplier: Decimal
    adjusted_subtotal: Decimal
    num_trips: int
    trips_multiplier: Decimal
    total: Decimal
    commission: Decimal
    driver_payout: Decimal


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _q0(value: Decimal) -> Decimal:
    """Round to whole cedis."""
    return value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def volume_multiplier(config: PricingConfig, volume_tier: str) -> Decimal:
    """Full load is the baseline (×1); partial loads get a discount."""
    if volume_tier == VolumeTier.SMALL:
        return (Decimal("100") - config.small_discount_pct) / Decimal("100")
    if volume_tier == VolumeTier.MEDIUM:
        return (Decimal("100") - config.medium_discount_pct) / Decimal("100")
    return Decimal("1")  # FULL / unknown


def trips_multiplier(config: PricingConfig, num_trips: int) -> Decimal:
    """First trip is unsurcharged; each extra trip adds extra_trip_surcharge_pct."""
    if num_trips <= 1:
        return Decimal("1")
    surcharge = Decimal("1") + config.extra_trip_surcharge_pct / Decimal("100")
    return Decimal("1") + (Decimal(num_trips) - Decimal("1")) * surcharge


def calculate_quote(
    *,
    region: Optional[Region],
    distance_km: float,
    volume_tier: str,
    num_trips: int = 1,
) -> Quote:
    config = get_or_default_config(region)

    loop = Decimal(str(round(distance_km, 2)))
    billable = max(loop, Decimal(config.min_billable_km))
    distance_fee = config.distance_rate_per_km * billable
    subtotal = config.base_fee + distance_fee

    vmult = volume_multiplier(config, volume_tier)
    adjusted = subtotal * vmult

    tmult = trips_multiplier(config, num_trips)
    total = _q0(adjusted * tmult)

    commission = _q(total * (config.commission_pct / Decimal("100")))
    payout = total - commission

    return Quote(
        base_fee=_q(config.base_fee),
        distance_km=loop,
        billable_distance_km=billable.quantize(Decimal("0.01")),
        distance_fee=_q(distance_fee),
        subtotal=_q(subtotal),
        volume_tier=volume_tier,
        volume_multiplier=vmult.quantize(Decimal("0.01")),
        adjusted_subtotal=_q(adjusted),
        num_trips=num_trips,
        trips_multiplier=tmult.quantize(Decimal("0.01")),
        total=total,
        commission=commission,
        driver_payout=payout,
    )


__all__ = [
    "haversine_km",
    "get_or_default_config",
    "get_active_disposal_site",
    "Quote",
    "calculate_quote",
    "volume_multiplier",
    "trips_multiplier",
    "VolumeTier",
]
