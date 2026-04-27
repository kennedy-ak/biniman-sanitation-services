from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class WasteType(models.TextChoices):
    SEPTIC = "septic", "Septic tank"
    SOAK_PIT = "soak_pit", "Soak pit / cesspit"
    INDUSTRIAL = "industrial", "Industrial liquid waste"


class RequestStatus(models.TextChoices):
    PENDING = "pending", "Pending"  # created, waiting for first assignment
    ASSIGNED = "assigned", "Assigned"  # offered to a driver, waiting for accept
    ACCEPTED = "accepted", "Accepted"  # driver accepted, on the way
    EN_ROUTE = "en_route", "En route"
    ARRIVED = "arrived", "Arrived"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"
    UNFULFILLED = "unfulfilled", "Unfulfilled"


# State machine: only forward transitions allowed.
ALLOWED_TRANSITIONS = {
    RequestStatus.PENDING: {RequestStatus.ASSIGNED, RequestStatus.UNFULFILLED, RequestStatus.CANCELLED},
    RequestStatus.ASSIGNED: {
        RequestStatus.ACCEPTED, RequestStatus.PENDING, RequestStatus.UNFULFILLED, RequestStatus.CANCELLED
    },
    RequestStatus.ACCEPTED: {RequestStatus.EN_ROUTE, RequestStatus.CANCELLED},
    RequestStatus.EN_ROUTE: {RequestStatus.ARRIVED, RequestStatus.CANCELLED},
    RequestStatus.ARRIVED: {RequestStatus.COMPLETED, RequestStatus.CANCELLED},
    RequestStatus.COMPLETED: set(),
    RequestStatus.CANCELLED: set(),
    RequestStatus.UNFULFILLED: set(),
}


class ServiceRequest(models.Model):
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="service_requests"
    )
    driver = models.ForeignKey(
        "drivers.Driver",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="service_requests",
    )
    region = models.ForeignKey(
        "accounts.Region", on_delete=models.PROTECT, related_name="service_requests"
    )

    waste_type = models.CharField(max_length=20, choices=WasteType.choices)
    volume_tier = models.CharField(max_length=10, choices=[("small","Small"),("medium","Medium"),("large","Large")])

    # Location — switching to PostGIS PointField in a later phase
    pickup_lat = models.DecimalField(max_digits=10, decimal_places=7)
    pickup_lng = models.DecimalField(max_digits=10, decimal_places=7)
    pickup_address = models.CharField(max_length=300, blank=True)
    notes = models.TextField(blank=True)

    # Quote (snapshot at booking time)
    quote_total = models.DecimalField(max_digits=10, decimal_places=2)
    quote_base_fee = models.DecimalField(max_digits=10, decimal_places=2)
    quote_distance_km = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("0"))
    quote_distance_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"))
    quote_tier_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"))
    commission_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"))

    status = models.CharField(
        max_length=16, choices=RequestStatus.choices, default=RequestStatus.PENDING
    )
    cancel_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    en_route_at = models.DateTimeField(null=True, blank=True)
    arrived_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["customer", "-created_at"]),
            models.Index(fields=["driver", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"Request #{self.pk} ({self.status})"

    def transition(self, new_status: str) -> None:
        """Validate + apply a status transition. Caller is responsible for save()."""
        current = RequestStatus(self.status)
        target = RequestStatus(new_status)
        if target not in ALLOWED_TRANSITIONS[current]:
            raise ValidationError(
                f"Invalid transition: {current.value} -> {target.value}"
            )
        self.status = target.value
        now = timezone.now()
        if target == RequestStatus.ACCEPTED:
            self.accepted_at = now
        elif target == RequestStatus.EN_ROUTE:
            self.en_route_at = now
        elif target == RequestStatus.ARRIVED:
            self.arrived_at = now
        elif target == RequestStatus.COMPLETED:
            self.completed_at = now
        elif target == RequestStatus.CANCELLED:
            self.cancelled_at = now


class AssignmentOutcome(models.TextChoices):
    PENDING = "pending", "Pending"
    ACCEPTED = "accepted", "Accepted"
    DECLINED = "declined", "Declined"
    TIMEOUT = "timeout", "Timeout"
    SUPERSEDED = "superseded", "Superseded"  # request was cancelled or accepted by another


class RequestAssignment(models.Model):
    """One offer to one driver. A request can have many of these as the cascade walks."""

    request = models.ForeignKey(
        ServiceRequest, on_delete=models.CASCADE, related_name="assignments"
    )
    driver = models.ForeignKey(
        "drivers.Driver", on_delete=models.CASCADE, related_name="assignments"
    )
    distance_km = models.DecimalField(max_digits=8, decimal_places=2)
    expires_at = models.DateTimeField()
    outcome = models.CharField(
        max_length=12, choices=AssignmentOutcome.choices, default=AssignmentOutcome.PENDING
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["request", "-created_at"])]

    def __str__(self) -> str:
        return f"Offer req={self.request_id} driver={self.driver_id} {self.outcome}"

    def is_active(self) -> bool:
        return self.outcome == AssignmentOutcome.PENDING and timezone.now() < self.expires_at
