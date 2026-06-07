"""Pricing engine tests — multiplicative loop-distance model.

These exercise the pure quote functions; MAPBOX_SECRET_TOKEN is empty in test
settings so distance helpers use the haversine fallback.
"""
from decimal import Decimal

from django.test import TestCase, override_settings

from accounts.models import Region
from pricing.distance import road_distance_km_path
from pricing.models import PricingConfig, VolumeTier
from pricing.services import (
    calculate_quote,
    haversine_km,
    trips_multiplier,
    volume_multiplier,
)


class QuoteEngineTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.region = Region.objects.create(name="Quote Region", code="QTR")
        # Defaults match the seeded production values.
        cls.config = PricingConfig.objects.create(region=cls.region)

    def test_full_load_single_trip_baseline(self):
        # 20 km loop, full load, 1 trip → 879 + 20*20 = 1279, ×1 ×1
        q = calculate_quote(
            region=self.region, distance_km=20, volume_tier=VolumeTier.FULL, num_trips=1
        )
        self.assertEqual(q.billable_distance_km, Decimal("20.00"))
        self.assertEqual(q.distance_fee, Decimal("400.00"))
        self.assertEqual(q.subtotal, Decimal("1279.00"))
        self.assertEqual(q.volume_multiplier, Decimal("1.00"))
        self.assertEqual(q.total, Decimal("1279"))

    def test_small_load_applies_30pct_discount(self):
        # 20 km loop, small load → 1279 × 0.70 = 895.30 → ROUND → 895
        q = calculate_quote(
            region=self.region, distance_km=20, volume_tier=VolumeTier.SMALL, num_trips=1
        )
        self.assertEqual(q.volume_multiplier, Decimal("0.70"))
        self.assertEqual(q.total, Decimal("895"))

    def test_medium_load_applies_15pct_discount(self):
        # 1279 × 0.85 = 1087.15 → ROUND → 1087
        q = calculate_quote(
            region=self.region, distance_km=20, volume_tier=VolumeTier.MEDIUM, num_trips=1
        )
        self.assertEqual(q.volume_multiplier, Decimal("0.85"))
        self.assertEqual(q.total, Decimal("1087"))

    def test_min_billable_distance_floor(self):
        # 5 km loop is billed as 10 km → distance fee 200, subtotal 1079
        q = calculate_quote(
            region=self.region, distance_km=5, volume_tier=VolumeTier.FULL, num_trips=1
        )
        self.assertEqual(q.distance_km, Decimal("5.00"))
        self.assertEqual(q.billable_distance_km, Decimal("10.00"))
        self.assertEqual(q.distance_fee, Decimal("200.00"))
        self.assertEqual(q.total, Decimal("1079"))

    def test_two_trips_surcharge(self):
        # full load 20 km → 1279 × 2.8 = 3581.20 → ROUND → 3581
        q = calculate_quote(
            region=self.region, distance_km=20, volume_tier=VolumeTier.FULL, num_trips=2
        )
        self.assertEqual(q.trips_multiplier, Decimal("2.80"))
        self.assertEqual(q.total, Decimal("3581"))

    def test_three_trips_surcharge(self):
        # multiplier = 1 + 2*(1.8) = 4.6
        q = calculate_quote(
            region=self.region, distance_km=20, volume_tier=VolumeTier.FULL, num_trips=3
        )
        self.assertEqual(q.trips_multiplier, Decimal("4.60"))

    def test_commission_and_payout(self):
        q = calculate_quote(
            region=self.region, distance_km=20, volume_tier=VolumeTier.FULL, num_trips=1
        )
        self.assertEqual(q.commission, Decimal("191.85"))  # 1279 * 0.15
        self.assertEqual(q.driver_payout, Decimal("1087.15"))

    def test_multiplier_helpers(self):
        self.assertEqual(volume_multiplier(self.config, VolumeTier.SMALL), Decimal("0.7"))
        self.assertEqual(volume_multiplier(self.config, VolumeTier.MEDIUM), Decimal("0.85"))
        self.assertEqual(volume_multiplier(self.config, VolumeTier.FULL), Decimal("1"))
        self.assertEqual(trips_multiplier(self.config, 1), Decimal("1"))
        self.assertEqual(trips_multiplier(self.config, 2), Decimal("2.8"))


@override_settings(MAPBOX_SECRET_TOKEN="")
class DistancePathTests(TestCase):
    def test_path_sums_legs_with_haversine_fallback(self):
        # A→B→C→A loop; with no Mapbox token the path is the summed haversine legs.
        a = (5.6037, -0.1870)
        b = (5.7037, -0.1870)
        c = (6.7160, -1.5160)
        loop = road_distance_km_path([a, b, c, a])
        expected = (
            haversine_km(*a, *b)
            + haversine_km(*b, *c)
            + haversine_km(*c, *a)
        )
        self.assertAlmostEqual(loop, expected, places=4)

    def test_path_single_point_is_zero(self):
        self.assertEqual(road_distance_km_path([(5.6, -0.1)]), 0.0)
