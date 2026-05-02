"""Tests for admin user-create endpoint."""
from decimal import Decimal

from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import Region, Role, User
from drivers.models import Driver, DriverStatus


# Use in-memory cache so per-view throttles don't need a running Redis.
NO_THROTTLES = {
    "CACHES": {
        "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
    },
    "REST_FRAMEWORK": {
        "DEFAULT_AUTHENTICATION_CLASSES": (
            "rest_framework_simplejwt.authentication.JWTAuthentication",
        ),
        "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
        "EXCEPTION_HANDLER": "liquidgo.exception_handler.custom_exception_handler",
        "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend",),
        # Empty so AdminUserCreateThrottle's per-view scope still resolves but with no per-min cap clash.
        "DEFAULT_THROTTLE_RATES": {"admin_user_create": "10000/hour"},
    },
}


@override_settings(**NO_THROTTLES)
class AdminUserCreateTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.region = Region.objects.create(name="Greater Accra", code="GA")
        cls.admin = User.objects.create_user(
            phone="+233200000000", role=Role.ADMIN, full_name="Admin",
        )
        cls.superuser = User.objects.create_superuser(
            phone="+233200000001", password=None, full_name="Super",
        )
        cls.url = reverse("analytics:user-create")

    def _login(self, user):
        self.client.force_authenticate(user=user)

    def _payload(self, **overrides):
        base = {
            "phone": "+233241234567",
            "full_name": "Test User",
            "role": "customer",
        }
        base.update(overrides)
        return base

    def test_requires_authentication(self):
        resp = self.client.post(self.url, self._payload(), format="json")
        self.assertEqual(resp.status_code, 401)

    def test_non_admin_forbidden(self):
        regular = User.objects.create_user(phone="+233244444444", role=Role.CUSTOMER)
        self._login(regular)
        resp = self.client.post(self.url, self._payload(), format="json")
        self.assertEqual(resp.status_code, 403)

    def test_admin_creates_customer(self):
        self._login(self.admin)
        resp = self.client.post(self.url, self._payload(email="Foo@BAR.com"), format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        u = User.objects.get(phone="+233241234567")
        self.assertEqual(u.role, Role.CUSTOMER)
        self.assertEqual(u.email, "foo@bar.com")  # normalized lowercase
        self.assertTrue(u.is_phone_verified)
        self.assertFalse(u.has_usable_password())

    def test_invalid_phone_rejected(self):
        self._login(self.admin)
        resp = self.client.post(self.url, self._payload(phone="0241234567"), format="json")
        self.assertEqual(resp.status_code, 400)

    def test_duplicate_phone_rejected(self):
        User.objects.create_user(phone="+233241234567", role=Role.CUSTOMER)
        self._login(self.admin)
        resp = self.client.post(self.url, self._payload(), format="json")
        self.assertEqual(resp.status_code, 400)

    def test_duplicate_email_case_insensitive(self):
        User.objects.create_user(phone="+233244000000", email="foo@bar.com", role=Role.CUSTOMER)
        self._login(self.admin)
        resp = self.client.post(
            self.url, self._payload(email="FOO@bar.COM"), format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_admin_cannot_create_admin(self):
        self._login(self.admin)
        resp = self.client.post(self.url, self._payload(role="admin"), format="json")
        self.assertEqual(resp.status_code, 403)
        self.assertFalse(User.objects.filter(phone="+233241234567").exists())

    def test_admin_cannot_create_fleet_admin(self):
        self._login(self.admin)
        resp = self.client.post(self.url, self._payload(role="fleet_admin"), format="json")
        self.assertEqual(resp.status_code, 403)

    def test_superuser_can_create_admin(self):
        self._login(self.superuser)
        resp = self.client.post(self.url, self._payload(role="admin"), format="json")
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_create_driver_with_profile(self):
        self._login(self.admin)
        resp = self.client.post(
            self.url,
            self._payload(
                role="driver",
                vehicle_reg="GR-1234-25",
                vehicle_type="medium_tanker",
                vehicle_capacity_litres=3000,
                license_number="DL-001",
                base_fee="50.00",
                momo_number="0241234567",
                momo_provider="mtn",
            ),
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        d = Driver.objects.get(user__phone="+233241234567")
        self.assertEqual(d.status, DriverStatus.PENDING)
        self.assertEqual(d.vehicle_reg, "GR-1234-25")
        self.assertEqual(d.base_fee, Decimal("50.00"))

    def test_create_driver_without_profile_is_allowed(self):
        self._login(self.admin)
        resp = self.client.post(self.url, self._payload(role="driver"), format="json")
        self.assertEqual(resp.status_code, 201)
        u = User.objects.get(phone="+233241234567")
        self.assertEqual(u.role, Role.DRIVER)
        self.assertFalse(hasattr(u, "driver_profile") and u.driver_profile is not None and u.driver_profile.pk)

    def test_driver_partial_fields_rejected(self):
        self._login(self.admin)
        resp = self.client.post(
            self.url,
            self._payload(role="driver", vehicle_reg="GR-9999-25"),
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(User.objects.filter(phone="+233241234567").exists())

    def test_driver_capacity_below_minimum(self):
        self._login(self.admin)
        resp = self.client.post(
            self.url,
            self._payload(
                role="driver",
                vehicle_reg="GR-1234-25",
                vehicle_type="small_tanker",
                vehicle_capacity_litres=100,
                license_number="DL-001",
                base_fee="50.00",
            ),
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_invalid_momo_number_rejected(self):
        self._login(self.admin)
        resp = self.client.post(
            self.url,
            self._payload(
                role="driver",
                vehicle_reg="GR-1234-25",
                vehicle_type="medium_tanker",
                vehicle_capacity_litres=3000,
                license_number="DL-001",
                base_fee="50.00",
                momo_number="abc",
                momo_provider="mtn",
            ),
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_driver_creation_atomic_on_failure(self):
        # Pre-existing driver vehicle reg → IntegrityError; user must NOT be created.
        existing = User.objects.create_user(phone="+233244111111", role=Role.DRIVER)
        Driver.objects.create(
            user=existing,
            vehicle_reg="GR-1234-25",
            vehicle_type="medium_tanker",
            vehicle_capacity_litres=3000,
            license_number="DL-OLD",
            base_fee=Decimal("50.00"),
        )
        self._login(self.admin)
        resp = self.client.post(
            self.url,
            self._payload(
                role="driver",
                vehicle_reg="GR-1234-25",
                vehicle_type="medium_tanker",
                vehicle_capacity_litres=3000,
                license_number="DL-002",
                base_fee="50.00",
            ),
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(User.objects.filter(phone="+233241234567").exists())
