import uuid
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


class GateFit(models.TextChoices):
    YES = "yes", "Yes"
    NO = "no", "No"
    UNSURE = "unsure", "Not sure"


class TankLocation(models.TextChoices):
    FRONT = "front", "Front of house"
    SIDE = "side", "Side of house"
    BACK = "back", "Back of house"
    UNDER_DRIVEWAY = "under_driveway", "Under driveway"
    OTHER = "other", "Other"


class ParkingDistance(models.TextChoices):
    AT_GATE = "at_gate", "At the gate"
    M_5_10 = "5_10", "5–10 m"
    M_10_20 = "10_20", "10–20 m"
    M_20_PLUS = "20_plus", "20 m+"


class TankCoverState(models.TextChoices):
    OPEN = "open", "Open"
    CLOSED_ACCESSIBLE = "closed_accessible", "Closed but accessible"
    SEALED = "sealed", "Sealed (needs breaking)"
    UNKNOWN = "unknown", "Unknown"


class LastEmptied(models.TextChoices):
    LT_6M = "lt_6m", "Less than 6 months"
    M_6_12 = "6_12m", "6–12 months"
    Y_1_2 = "1_2y", "1–2 years"
    GT_2Y = "gt_2y", "2 years+"
    NEVER = "never", "Never"
    UNKNOWN = "unknown", "Unknown"


class PreferredTime(models.TextChoices):
    ASAP = "asap", "ASAP"
    MORNING = "morning", "Morning"
    AFTERNOON = "afternoon", "Afternoon"
    EVENING = "evening", "Evening"


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
    volume_tier = models.CharField(
        max_length=10,
        choices=[("small", "Small load"), ("medium", "Medium load"), ("full", "Full load")],
    )
    num_trips = models.PositiveSmallIntegerField(default=1)

    # Location — switching to PostGIS PointField in a later phase
    pickup_lat = models.DecimalField(max_digits=10, decimal_places=7)
    pickup_lng = models.DecimalField(max_digits=10, decimal_places=7)
    pickup_address = models.CharField(max_length=300, blank=True)
    notes = models.TextField(blank=True)

    # Site survey — captured at booking so the driver knows what to expect.
    gate_fits_truck = models.CharField(
        max_length=8, choices=GateFit.choices, blank=True, default=""
    )
    gate_photo = models.ImageField(upload_to="requests/gate/", blank=True, null=True)
    tank_location = models.CharField(
        max_length=16, choices=TankLocation.choices, blank=True, default=""
    )
    truck_parking_distance = models.CharField(
        max_length=8, choices=ParkingDistance.choices, blank=True, default=""
    )
    tank_cover_photo = models.ImageField(
        upload_to="requests/tank/", blank=True, null=True
    )
    tank_cover_state = models.CharField(
        max_length=20, choices=TankCoverState.choices, blank=True, default=""
    )
    last_emptied = models.CharField(
        max_length=10, choices=LastEmptied.choices, blank=True, default=""
    )
    is_overflowing = models.BooleanField(null=True, blank=True)
    preferred_time = models.CharField(
        max_length=10, choices=PreferredTime.choices, blank=True, default=""
    )
    someone_on_site = models.BooleanField(null=True, blank=True)

    # Quote (snapshot at booking time) — loop-distance multiplicative model
    quote_total = models.DecimalField(max_digits=10, decimal_places=2)
    quote_base_fee = models.DecimalField(max_digits=10, decimal_places=2)
    quote_distance_km = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("0"))
    quote_billable_distance_km = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("0"))
    quote_distance_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"))
    quote_volume_multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=Decimal("1"))
    quote_trips_multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=Decimal("1"))
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

    receipt_url = models.URLField(blank=True, default="")
    receipt_generated_at = models.DateTimeField(null=True, blank=True)

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
    # Groups assignments belonging to a single parallel-broadcast round.
    batch_uuid = models.UUIDField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["request", "-created_at"])]

    def __str__(self) -> str:
        return f"Offer req={self.request_id} driver={self.driver_id} {self.outcome}"

    def is_active(self) -> bool:
        return self.outcome == AssignmentOutcome.PENDING and timezone.now() < self.expires_at
