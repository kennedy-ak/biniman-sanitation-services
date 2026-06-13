"""Payment orchestration tests.

Focus: the Paystack initialize lifecycle. The mock adapter (no PAYSTACK_SECRET_KEY
in test settings) returns a fresh reference/authorization_url on every call, so we
can assert whether a re-init mints a new checkout link or hands back a stale one.
"""
from __future__ import annotations

from decimal import Decimal

from django.test import TestCase, override_settings

from accounts.models import Region, Role, User
from payments.models import PaymentStatus
from payments.services.orchestrator import confirm_payment, initialize_payment_for_request
from requests_app.models import ServiceRequest

NO_THROTTLES = {
    "CACHES": {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
}
IN_MEMORY_CHANNELS = {
    "CHANNEL_LAYERS": {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}},
}
TEST_OVERRIDES = {**NO_THROTTLES, **IN_MEMORY_CHANNELS}


def _make_request(customer: User, region: Region) -> ServiceRequest:
    return ServiceRequest.objects.create(
        customer=customer,
        region=region,
        waste_type="septic",
        volume_tier="medium",
        pickup_lat=Decimal("5.6037"),
        pickup_lng=Decimal("-0.1870"),
        quote_total=Decimal("150"),
        quote_base_fee=Decimal("50"),
        quote_distance_km=Decimal("1.0"),
        quote_distance_fee=Decimal("3"),
        commission_amount=Decimal("22.5"),
    )


@override_settings(**TEST_OVERRIDES)
class InitializePaymentTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.region = Region.objects.create(name="Pay Region", code="PAY")
        cls.customer = _make_user_customer()

    def setUp(self):
        self.request = _make_request(self.customer, self.region)

    def test_reinit_pending_payment_mints_fresh_checkout_link(self):
        """Revisiting the pay page must NOT reuse a stale Paystack link.

        Reusing a consumed/expired authorization_url is what surfaces Paystack's
        "We could not start this transaction" error. A pending payment must be
        re-initialized into a fresh reference + authorization_url each time.
        """
        first = initialize_payment_for_request(self.request)
        first_ref = first.paystack_reference
        first_url = first.paystack_authorization_url

        # Re-fetch so the cached OneToOne accessor doesn't mask DB state.
        self.request.refresh_from_db()
        second = initialize_payment_for_request(self.request)

        self.assertEqual(first.pk, second.pk, "should reuse the same Payment row")
        self.assertNotEqual(
            first_ref, second.paystack_reference,
            "a pending re-init must produce a new Paystack reference",
        )
        self.assertNotEqual(
            first_url, second.paystack_authorization_url,
            "a pending re-init must produce a fresh checkout link",
        )
        self.assertEqual(second.status, PaymentStatus.PENDING)

    def test_succeeded_payment_is_not_reinitialized(self):
        """A paid request must never be re-charged on a repeat init call."""
        payment = initialize_payment_for_request(self.request)
        confirm_payment(payment, channel="mobile_money")
        paid_ref = payment.paystack_reference

        self.request.refresh_from_db()
        again = initialize_payment_for_request(self.request)

        self.assertEqual(again.pk, payment.pk)
        self.assertEqual(again.paystack_reference, paid_ref)
        self.assertEqual(again.status, PaymentStatus.SUCCEEDED)


def _make_user_customer() -> User:
    return User.objects.create_user(phone="+233200000099", role=Role.CUSTOMER)
