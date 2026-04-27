from django.conf import settings
from django.db import models


class FleetStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    SUSPENDED = "suspended", "Suspended"
    REJECTED = "rejected", "Rejected"


class FleetCompany(models.Model):
    name = models.CharField(max_length=200)
    registration_number = models.CharField(max_length=64, unique=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=16, blank=True)

    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="fleet_company",
    )
    region = models.ForeignKey(
        "accounts.Region", on_delete=models.PROTECT, related_name="fleet_companies"
    )

    status = models.CharField(
        max_length=16, choices=FleetStatus.choices, default=FleetStatus.PENDING
    )
    rejection_reason = models.TextField(blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_fleets",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "Fleet companies"

    def __str__(self) -> str:
        return self.name
