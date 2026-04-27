import re
import secrets
from datetime import timedelta

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from .managers import UserManager

PHONE_RE = re.compile(r"^\+233\d{9}$")


def validate_ghana_phone(value: str) -> None:
    if not PHONE_RE.match(value or ""):
        raise ValidationError("Phone must be in E.164 format, e.g. +233241234567")


class Role(models.TextChoices):
    CUSTOMER = "customer", "Customer"
    DRIVER = "driver", "Driver"
    FLEET_ADMIN = "fleet_admin", "Fleet Admin"
    ADMIN = "admin", "Admin"


class Region(models.Model):
    name = models.CharField(max_length=80, unique=True)
    code = models.CharField(max_length=16, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class User(AbstractBaseUser, PermissionsMixin):
    phone = models.CharField(
        max_length=16,
        unique=True,
        validators=[validate_ghana_phone],
        db_index=True,
    )
    email = models.EmailField(blank=True, null=True, unique=True)
    full_name = models.CharField(max_length=120, blank=True)
    role = models.CharField(
        max_length=16, choices=Role.choices, default=Role.CUSTOMER
    )
    region = models.ForeignKey(
        Region, on_delete=models.PROTECT, null=True, blank=True, related_name="users"
    )

    is_phone_verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.phone} ({self.role})"

    @property
    def display_name(self) -> str:
        return self.full_name or self.phone


class PhoneOTP(models.Model):
    """Single-use OTP code for phone verification + login."""

    OTP_TTL = timedelta(minutes=10)
    REQUEST_COOLDOWN = timedelta(seconds=60)
    HOURLY_LIMIT = 5

    phone = models.CharField(max_length=16, db_index=True)
    code = models.CharField(max_length=6)
    purpose = models.CharField(
        max_length=16,
        choices=[("login", "Login"), ("signup", "Signup")],
        default="login",
    )
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["phone", "-created_at"])]

    @classmethod
    def generate_code(cls) -> str:
        return f"{secrets.randbelow(1_000_000):06d}"

    def is_expired(self) -> bool:
        return timezone.now() > self.created_at + self.OTP_TTL

    def is_consumed(self) -> bool:
        return self.consumed_at is not None
