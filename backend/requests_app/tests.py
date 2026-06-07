"""Matching engine tests.

Covers ranking filters, composite scoring, parallel-broadcast batch creation,
first-accept-wins supersession, decline-no-cascade behaviour, and batch timeout.
External adapters (Mapbox, Paystack refund) are mocked or rely on the built-in
mock fallbacks (`MAPBOX_SECRET_TOKEN` is empty in test settings).
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import Region, Role, User
from drivers.models import Driver, DriverStatus, VehicleType
from pricing.models import DisposalSite, PricingConfig
from ratings.models import Rating
from requests_app.models import (
    AssignmentOutcome,
    RequestAssignment,
    RequestStatus,
    ServiceRequest,
)
from requests_app.services.matching import (
    candidate_drivers,
    offer_to_next_batch,
    mark_unfulfilled,
)
from requests_app.tasks import handle_batch_timeout


NO_THROTTLES = {
    "CACHES": {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
}

# In-memory channel layer keeps broadcast helpers from reaching out to Redis.
IN_MEMORY_CHANNELS = {
    "CHANNEL_LAYERS": {
        "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"},
    },
}

TEST_OVERRIDES = {**NO_THROTTLES, **IN_MEMORY_CHANNELS}


def _make_user(phone: str, role: str = Role.DRIVER, **kwargs) -> User:
    return User.objects.create_user(phone=phone, role=role, **kwargs)


def _make_driver(
    *,
    phone: str,
    lat: float = 5.6037,
    lng: float = -0.1870,
    is_online: bool = True,
    status: str = DriverStatus.APPROVED,
    last_seen_seconds_ago: int = 5,
    base_fee: Decimal = Decimal("50.00"),
) -> Driver:
    user = _make_user(phone=phone, role=Role.DRIVER)
    return Driver.objects.create(
        user=user,
        vehicle_reg=f"GR-{phone[-4:]}-25",
        vehicle_type=VehicleType.MEDIUM_TANKER,
        vehicle_capacity_litres=3000,
        license_number=f"DL-{phone[-4:]}",
        base_fee=base_fee,
        status=status,
        is_online=is_online,
        last_lat=Decimal(str(lat)),
        last_lng=Decimal(str(lng)),
        last_seen_at=timezone.now() - timedelta(seconds=last_seen_seconds_ago),
    )


def _make_request(customer: User, region: Region, lat: float = 5.6037, lng: float = -0.1870) -> ServiceRequest:
    return ServiceRequest.objects.create(
        customer=customer,
        region=region,
        waste_type="septic",
        volume_tier="medium",
        pickup_lat=Decimal(str(lat)),
        pickup_lng=Decimal(str(lng)),
        quote_total=Decimal("150"),
        quote_base_fee=Decimal("50"),
        quote_distance_km=Decimal("1.0"),
        quote_distance_fee=Decimal("3"),
        commission_amount=Decimal("22.5"),
    )


@override_settings(**TEST_OVERRIDES)
class MatchingFilterTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.region = Region.objects.create(name="Greater Accra Test", code="GAT")
        cls.customer = _make_user(phone="+233200000010", role=Role.CUSTOMER)
        PricingConfig.objects.create(region=cls.region, matching_radius_km=15)

    def setUp(self):
        self.request = _make_request(self.customer, self.region)

    def test_excludes_offline_drivers(self):
        _make_driver(phone="+233241110001", is_online=False)
        self.assertEqual(candidate_drivers(self.request), [])

    def test_excludes_unapproved_drivers(self):
        _make_driver(phone="+233241110002", status=DriverStatus.PENDING)
        self.assertEqual(candidate_drivers(self.request), [])

    def test_excludes_stale_last_seen(self):
        # driver_stale_after_seconds defaults to 1800; go well past it.
        _make_driver(phone="+233241110003", last_seen_seconds_ago=2400)
        self.assertEqual(candidate_drivers(self.request), [])

    def test_excludes_busy_drivers(self):
        d = _make_driver(phone="+233241110004")
        ServiceRequest.objects.create(
            customer=self.customer,
            region=self.region,
            driver=d,
            waste_type="septic",
            volume_tier="small",
            pickup_lat=Decimal("5.6"),
            pickup_lng=Decimal("-0.18"),
            quote_total=Decimal("100"),
            quote_base_fee=Decimal("50"),
            status=RequestStatus.EN_ROUTE.value,
        )
        self.assertEqual(candidate_drivers(self.request), [])

    def test_includes_out_of_radius_no_cap(self):
        # ~30km north of pickup. matching_radius_km is only a consent threshold
        # now — there is no hard matching cap, so the driver is still a candidate.
        d = _make_driver(phone="+233241110005", lat=5.87, lng=-0.187)
        results = candidate_drivers(self.request)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0][0].id, d.id)

    def test_includes_valid_driver(self):
        d = _make_driver(phone="+233241110006", lat=5.6040, lng=-0.1875)
        results = candidate_drivers(self.request)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0][0].id, d.id)


@override_settings(**TEST_OVERRIDES)
class CompositeScoringTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.region = Region.objects.create(name="Scoring Region", code="SCO")
        cls.customer = _make_user(phone="+233200000020", role=Role.CUSTOMER)
        PricingConfig.objects.create(region=cls.region, matching_radius_km=20)

    def test_higher_rating_outranks_slightly_closer_low_rated(self):
        sr = _make_request(self.customer, self.region)

        # Close driver with poor rating; slightly farther driver with great rating.
        close_bad = _make_driver(phone="+233241120001", lat=5.6038, lng=-0.1871)
        far_good = _make_driver(phone="+233241120002", lat=5.6055, lng=-0.1900)

        # Ratings are uniquely keyed on (request, rated_by); spawn one rater per row.
        for i, score in enumerate((1, 2, 1)):
            rater = _make_user(phone=f"+23320{i:07d}", role=Role.CUSTOMER)
            Rating.objects.create(request=sr, rated_by=rater, rated_user=close_bad.user, score=score)
        for i, score in enumerate((5, 5, 5)):
            rater = _make_user(phone=f"+23321{i:07d}", role=Role.CUSTOMER)
            Rating.objects.create(request=sr, rated_by=rater, rated_user=far_good.user, score=score)

        ranked = candidate_drivers(sr)
        self.assertEqual(len(ranked), 2)
        self.assertEqual(ranked[0][0].id, far_good.id)


@override_settings(**TEST_OVERRIDES)
class BatchOfferTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.region = Region.objects.create(name="Batch Region", code="BCH")
        cls.customer = _make_user(phone="+233200000030", role=Role.CUSTOMER)
        PricingConfig.objects.create(
            region=cls.region, matching_radius_km=20, parallel_offer_count=3,
        )

    def test_offer_creates_batch_with_shared_uuid(self):
        sr = _make_request(self.customer, self.region)
        for i in range(5):
            _make_driver(phone=f"+2332413{i:05d}", lat=5.6037 + 0.0005 * i, lng=-0.1870)

        assignments = offer_to_next_batch(sr)
        self.assertEqual(len(assignments), 3)
        batch_ids = {a.batch_uuid for a in assignments}
        self.assertEqual(len(batch_ids), 1)
        expiries = {a.expires_at for a in assignments}
        self.assertEqual(len(expiries), 1)

        sr.refresh_from_db()
        self.assertEqual(sr.status, RequestStatus.ASSIGNED.value)
        self.assertIsNone(sr.driver_id)

    def test_offer_skips_already_invited(self):
        sr = _make_request(self.customer, self.region)
        for i in range(2):
            _make_driver(phone=f"+2332414{i:05d}", lat=5.6037 + 0.0005 * i, lng=-0.1870)

        first = offer_to_next_batch(sr)
        self.assertEqual(len(first), 2)
        # No remaining unoffered candidates → empty second batch.
        second = offer_to_next_batch(sr)
        self.assertEqual(second, [])


@override_settings(**TEST_OVERRIDES)
class AcceptDeclineTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.region = Region.objects.create(name="Accept Region", code="ACP")
        cls.customer = _make_user(phone="+233200000040", role=Role.CUSTOMER)
        PricingConfig.objects.create(
            region=cls.region, matching_radius_km=20, parallel_offer_count=3,
        )

    def _seed_batch(self, n: int = 3) -> tuple[ServiceRequest, list[RequestAssignment]]:
        sr = _make_request(self.customer, self.region)
        for i in range(n):
            _make_driver(phone=f"+2332415{i:05d}", lat=5.6037 + 0.0005 * i, lng=-0.1870)
        assignments = offer_to_next_batch(sr)
        sr.refresh_from_db()
        return sr, assignments

    def test_first_accept_supersedes_siblings(self):
        sr, assignments = self._seed_batch(3)
        winner = assignments[0]
        self.client.force_authenticate(user=winner.driver.user)
        resp = self.client.post(
            reverse("requests_app:driver-accept", args=[winner.id])
        )
        self.assertEqual(resp.status_code, 200, resp.data)

        winner.refresh_from_db()
        self.assertEqual(winner.outcome, AssignmentOutcome.ACCEPTED)
        sr.refresh_from_db()
        self.assertEqual(sr.status, RequestStatus.ACCEPTED.value)
        self.assertEqual(sr.driver_id, winner.driver_id)

        for sibling in assignments[1:]:
            sibling.refresh_from_db()
            self.assertEqual(sibling.outcome, AssignmentOutcome.SUPERSEDED)
            self.assertIsNotNone(sibling.decided_at)

    def test_second_accept_returns_409_style_error(self):
        sr, assignments = self._seed_batch(3)
        first, second = assignments[0], assignments[1]
        self.client.force_authenticate(user=first.driver.user)
        self.client.post(reverse("requests_app:driver-accept", args=[first.id]))

        self.client.force_authenticate(user=second.driver.user)
        resp = self.client.post(
            reverse("requests_app:driver-accept", args=[second.id])
        )
        self.assertEqual(resp.status_code, 400)
        second.refresh_from_db()
        self.assertEqual(second.outcome, AssignmentOutcome.SUPERSEDED)

    def test_decline_does_not_advance_cascade(self):
        sr, assignments = self._seed_batch(3)
        decliner = assignments[0]
        self.client.force_authenticate(user=decliner.driver.user)
        resp = self.client.post(
            reverse("requests_app:driver-decline", args=[decliner.id])
        )
        self.assertEqual(resp.status_code, 200, resp.data)

        decliner.refresh_from_db()
        self.assertEqual(decliner.outcome, AssignmentOutcome.DECLINED)
        sr.refresh_from_db()
        self.assertEqual(sr.status, RequestStatus.ASSIGNED.value)
        for other in assignments[1:]:
            other.refresh_from_db()
            self.assertEqual(other.outcome, AssignmentOutcome.PENDING)


@override_settings(**TEST_OVERRIDES)
class BatchTimeoutTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.region = Region.objects.create(name="Timeout Region", code="TMO")
        cls.customer = _make_user(phone="+233200000050", role=Role.CUSTOMER)
        PricingConfig.objects.create(
            region=cls.region, matching_radius_km=20, parallel_offer_count=2,
        )

    def test_timeout_advances_to_next_batch(self):
        sr = _make_request(self.customer, self.region)
        for i in range(4):
            _make_driver(phone=f"+2332416{i:05d}", lat=5.6037 + 0.0005 * i, lng=-0.1870)
        first = offer_to_next_batch(sr)
        self.assertEqual(len(first), 2)
        batch_uuid = first[0].batch_uuid

        with patch("requests_app.tasks.handle_batch_timeout.apply_async"):
            handle_batch_timeout(str(batch_uuid))

        # First batch should all be TIMEOUT.
        for a in first:
            a.refresh_from_db()
            self.assertEqual(a.outcome, AssignmentOutcome.TIMEOUT)

        # A new batch of 2 should now exist.
        new_pending = sr.assignments.filter(outcome=AssignmentOutcome.PENDING)
        self.assertEqual(new_pending.count(), 2)
        new_batch_uuids = {a.batch_uuid for a in new_pending}
        self.assertEqual(len(new_batch_uuids), 1)
        self.assertNotIn(batch_uuid, new_batch_uuids)

    def test_timeout_no_more_candidates_marks_unfulfilled(self):
        sr = _make_request(self.customer, self.region)
        _make_driver(phone="+233241170001", lat=5.6037, lng=-0.1870)
        first = offer_to_next_batch(sr)
        self.assertEqual(len(first), 1)

        with patch("payments.tasks.task_refund_request.apply_async") as refund_mock, \
                patch("requests_app.tasks.handle_batch_timeout.apply_async"):
            handle_batch_timeout(str(first[0].batch_uuid))
            refund_mock.assert_called_once()

        sr.refresh_from_db()
        self.assertEqual(sr.status, RequestStatus.UNFULFILLED.value)
        self.assertIsNone(sr.driver_id)

    def test_timeout_noop_if_already_accepted(self):
        sr = _make_request(self.customer, self.region)
        for i in range(2):
            _make_driver(phone=f"+2332418{i:05d}", lat=5.6037, lng=-0.1870)
        batch = offer_to_next_batch(sr)
        # Manually accept one
        winner = batch[0]
        winner.outcome = AssignmentOutcome.ACCEPTED
        winner.decided_at = timezone.now()
        winner.save(update_fields=["outcome", "decided_at"])
        sr.driver = winner.driver
        sr.transition(RequestStatus.ACCEPTED.value)
        sr.save(update_fields=["driver", "status", "accepted_at"])

        with patch("requests_app.tasks.handle_batch_timeout.apply_async"):
            handle_batch_timeout(str(winner.batch_uuid))

        loser = batch[1]
        loser.refresh_from_db()
        # Untouched — handler short-circuits when batch has an acceptance.
        self.assertEqual(loser.outcome, AssignmentOutcome.PENDING)


@override_settings(**TEST_OVERRIDES)
class UnfulfilledRefundTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.region = Region.objects.create(name="Refund Region", code="REF")
        cls.customer = _make_user(phone="+233200000060", role=Role.CUSTOMER)
        PricingConfig.objects.create(region=cls.region, matching_radius_km=15)

    def test_mark_unfulfilled_fires_refund(self):
        sr = _make_request(self.customer, self.region)
        with patch("payments.tasks.task_refund_request.apply_async") as refund_mock:
            mark_unfulfilled(sr)
            refund_mock.assert_called_once_with(
                args=[sr.pk, "Unfulfilled — no driver available"], countdown=3600
            )
        sr.refresh_from_db()
        self.assertEqual(sr.status, RequestStatus.UNFULFILLED.value)


@override_settings(**TEST_OVERRIDES)
class BookingQuoteFlowTests(APITestCase):
    """Loop-distance quote, no-driver block, and >radius consent gate."""

    @classmethod
    def setUpTestData(cls):
        cls.region = Region.objects.create(name="Booking Region", code="BKG")
        PricingConfig.objects.create(region=cls.region)  # defaults: radius 20km, base 879
        # Disposal site (C) near the pickup so the loop is modest.
        DisposalSite.objects.create(name="Test Plant", lat=Decimal("5.65"), lng=Decimal("-0.20"))

    def _customer(self, suffix: str) -> User:
        return _make_user(phone=f"+2332019{suffix}", role=Role.CUSTOMER)

    def _create_payload(self, **overrides):
        payload = {
            "region_id": self.region.id,
            "waste_type": "septic",
            "volume_tier": "full",
            "num_trips": 1,
            "pickup_lat": "5.6037",
            "pickup_lng": "-0.1870",
        }
        payload.update(overrides)
        return payload

    def test_quote_no_drivers_online(self):
        cust = self._customer("00001")
        self.client.force_authenticate(user=cust)
        resp = self.client.post(
            reverse("requests_app:quote"),
            {"region_id": self.region.id, "pickup_lat": "5.6037", "pickup_lng": "-0.1870",
             "volume_tier": "full", "num_trips": 1},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["no_drivers"])

    def test_quote_with_nearby_driver_uses_loop(self):
        _make_driver(phone="+233242000001", lat=5.6040, lng=-0.1875)
        cust = self._customer("00002")
        self.client.force_authenticate(user=cust)
        resp = self.client.post(
            reverse("requests_app:quote"),
            {"region_id": self.region.id, "pickup_lat": "5.6037", "pickup_lng": "-0.1870",
             "volume_tier": "full", "num_trips": 1},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertFalse(resp.data["no_drivers"])
        self.assertFalse(resp.data["requires_confirmation"])
        self.assertGreater(Decimal(resp.data["total"]), Decimal("879"))  # base + loop distance

    def test_create_blocked_when_no_drivers(self):
        cust = self._customer("00003")
        self.client.force_authenticate(user=cust)
        resp = self.client.post(reverse("requests_app:create"), self._create_payload(), format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data.get("code"), "no_drivers")
        self.assertFalse(ServiceRequest.objects.filter(customer=cust).exists())

    def test_create_requires_confirmation_when_driver_far(self):
        # Only driver is ~30km north of pickup → beyond the 20km standard radius.
        _make_driver(phone="+233242000004", lat=5.87, lng=-0.187)
        cust = self._customer("00004")
        self.client.force_authenticate(user=cust)
        resp = self.client.post(reverse("requests_app:create"), self._create_payload(), format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data.get("code"), "confirmation_required")
        self.assertIn("nearest_driver_km", resp.data)
        self.assertFalse(ServiceRequest.objects.filter(customer=cust).exists())

    def test_create_far_driver_succeeds_with_accept_expanded(self):
        _make_driver(phone="+233242000005", lat=5.87, lng=-0.187)
        cust = self._customer("00005")
        self.client.force_authenticate(user=cust)
        resp = self.client.post(
            reverse("requests_app:create"),
            self._create_payload(accept_expanded=True),
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        sr = ServiceRequest.objects.get(customer=cust)
        self.assertEqual(sr.volume_tier, "full")

    def test_create_nearby_driver_stores_loop_quote(self):
        _make_driver(phone="+233242000006", lat=5.6040, lng=-0.1875)
        cust = self._customer("00006")
        self.client.force_authenticate(user=cust)
        resp = self.client.post(
            reverse("requests_app:create"),
            self._create_payload(num_trips=2),
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        sr = ServiceRequest.objects.get(customer=cust)
        self.assertEqual(sr.num_trips, 2)
        self.assertEqual(sr.quote_trips_multiplier, Decimal("2.80"))
        self.assertGreater(sr.quote_billable_distance_km, Decimal("0"))
