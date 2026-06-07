from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class DriverStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    SUSPENDED = "suspended", "Suspended"
    REJECTED = "rejected", "Rejected"


class VehicleType(models.TextChoices):
    SMALL_TANKER = "small_tanker", "Small tanker"
    MEDIUM_TANKER = "medium_tanker", "Medium tanker"
    LARGE_TANKER = "large_tanker", "Large tanker"


class Driver(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="driver_profile"
    )
    fleet = models.ForeignKey(
        "fleets.FleetCompany",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="drivers",
    )

    # Vehicle
    vehicle_reg = models.CharField(max_length=32, unique=True)
    vehicle_type = models.CharField(max_length=32, choices=VehicleType.choices)
    vehicle_capacity_litres = models.PositiveIntegerField()
    license_number = models.CharField(max_length=64)

    # Pricing
    base_fee = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0"))]
    )

    # Payout
    momo_number = models.CharField(max_length=16, blank=True)
    momo_provider = models.CharField(
        max_length=16,
        choices=[("mtn", "MTN"), ("vodafone", "Vodafone"), ("airteltigo", "AirtelTigo")],
        blank=True,
    )

    # Status
    status = models.CharField(
        max_length=16, choices=DriverStatus.choices, default=DriverStatus.PENDING
    )
    rejection_reason = models.TextField(blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_drivers",
    )

    # Realtime — switching to PostGIS PointField in Phase 2
    is_online = models.BooleanField(default=False)
    online_since = models.DateTimeField(null=True, blank=True)
    last_lat = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    last_lng = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "is_online"], name="driver_status_online_idx"),
        ]

    def __str__(self) -> str:
        return f"Driver {self.user.phone} ({self.vehicle_reg})"


class DocumentType(models.TextChoices):
    NATIONAL_ID = "national_id", "National ID"
    DRIVING_LICENSE = "driving_license", "Driving licence"
    VEHICLE_REGISTRATION = "vehicle_registration", "Vehicle registration"
    EPA_PERMIT = "epa_permit", "EPA waste handling permit"


class DriverDocument(models.Model):
    driver = models.ForeignKey(
        Driver, on_delete=models.CASCADE, related_name="documents"
    )
    doc_type = models.CharField(max_length=32, choices=DocumentType.choices)
    file_url = models.URLField(max_length=500)
    public_id = models.CharField(max_length=200, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("driver", "doc_type")]

    def __str__(self) -> str:
        return f"{self.driver_id}:{self.doc_type}"
