from decimal import Decimal

from django.conf import settings
from django.db import models


class PaymentStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    SUCCEEDED = "succeeded", "Succeeded"
    FAILED = "failed", "Failed"
    REFUNDED = "refunded", "Refunded"


class PayoutStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    SUCCEEDED = "succeeded", "Succeeded"
    FAILED = "failed", "Failed"


class PaymentMethod(models.TextChoices):
    MOMO = "momo", "Mobile money"
    CARD = "card", "Card"
    UNKNOWN = "unknown", "Unknown"


class Payment(models.Model):
    request = models.OneToOneField(
        "requests_app.ServiceRequest",
        on_delete=models.PROTECT,
        related_name="payment",
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="payments"
    )

    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="GHS")

    paystack_reference = models.CharField(max_length=100, unique=True)
    paystack_authorization_url = models.URLField(max_length=500, blank=True)
    paystack_access_code = models.CharField(max_length=100, blank=True)

    method = models.CharField(max_length=10, choices=PaymentMethod.choices, default=PaymentMethod.UNKNOWN)
    status = models.CharField(max_length=12, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)

    paid_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)
    refund_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"))

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Payment {self.paystack_reference} ({self.status})"


class Payout(models.Model):
    request = models.OneToOneField(
        "requests_app.ServiceRequest",
        on_delete=models.PROTECT,
        related_name="payout",
    )
    driver = models.ForeignKey(
        "drivers.Driver", on_delete=models.PROTECT, related_name="payouts"
    )

    amount = models.DecimalField(max_digits=10, decimal_places=2)
    commission = models.DecimalField(max_digits=10, decimal_places=2)

    paystack_recipient_code = models.CharField(max_length=100, blank=True)
    paystack_transfer_code = models.CharField(max_length=100, blank=True, db_index=True)
    paystack_reference = models.CharField(max_length=100, blank=True, db_index=True)

    status = models.CharField(max_length=12, choices=PayoutStatus.choices, default=PayoutStatus.PENDING)
    failure_reason = models.TextField(blank=True)

    transferred_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Payout req={self.request_id} {self.status}"


class WebhookEvent(models.Model):
    """Idempotency log for inbound Paystack webhooks."""

    event_id = models.CharField(max_length=100, unique=True)
    event_type = models.CharField(max_length=64)
    payload = models.JSONField()
    processed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-processed_at"]

    def __str__(self) -> str:
        return f"{self.event_type}:{self.event_id}"
