"""OTP request + verification service."""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import Throttled, ValidationError

from accounts.models import PhoneOTP
from notifications.services.email import send_email
from notifications.services.sms import send_sms

MAX_VERIFY_ATTEMPTS = 5


def request_otp(
    phone: str,
    purpose: str = "login",
    channel: str = "sms",
    email: str | None = None,
) -> PhoneOTP:
    """Generate + send a new OTP, enforcing rate limits. Delivers via SMS or email."""
    now = timezone.now()

    last = PhoneOTP.objects.filter(phone=phone).order_by("-created_at").first()
    if last and (now - last.created_at) < PhoneOTP.REQUEST_COOLDOWN:
        seconds_left = int((PhoneOTP.REQUEST_COOLDOWN - (now - last.created_at)).total_seconds())
        raise Throttled(wait=seconds_left, detail=f"Please wait {seconds_left}s before requesting another code.")

    hourly = PhoneOTP.objects.filter(
        phone=phone, created_at__gte=now - timedelta(hours=1)
    ).count()
    if hourly >= PhoneOTP.HOURLY_LIMIT:
        raise Throttled(wait=600, detail="Hourly OTP limit reached. Try again later.")

    code = PhoneOTP.generate_code()
    with transaction.atomic():
        otp = PhoneOTP.objects.create(
            phone=phone,
            code=code,
            purpose=purpose,
            channel=channel,
            email=email or None,
        )

    if channel == "email" and email:
        subject = "Your Biniman verification code"
        text = (
            f"Your Biniman Sanitation verification code is {code}.\n"
            "It expires in 10 minutes.\n\n"
            "If you didn't request this, you can ignore this email."
        )
        html = (
            f"<p>Your Biniman Sanitation verification code is "
            f"<strong style=\"font-size:18px;letter-spacing:2px\">{code}</strong>.</p>"
            "<p>It expires in 10 minutes.</p>"
            "<p style=\"color:#888;font-size:12px\">If you didn't request this, you can ignore this email.</p>"
        )
        send_email(email, subject, html, text)
    else:
        body = f"Your Biniman Sanitation verification code is {code}. Expires in 10 minutes."
        send_sms(phone, body)

    return otp


def verify_otp(phone: str, code: str) -> PhoneOTP:
    """Validate a code. Accepts any active (non-consumed, non-expired) code for the
    phone — so a late-arriving SMS still works after the user requested a new one.
    Marks consumed on success. Raises ValidationError otherwise.
    """
    cutoff = timezone.now() - PhoneOTP.OTP_TTL
    candidates = list(
        PhoneOTP.objects.filter(
            phone=phone, consumed_at__isnull=True, created_at__gte=cutoff
        ).order_by("-created_at")
    )
    if not candidates:
        raise ValidationError({"code": "No active code for this phone. Request a new one."})

    # Exact match against any active code (handles delayed SMS).
    for otp in candidates:
        if otp.attempts >= MAX_VERIFY_ATTEMPTS:
            continue
        if otp.code == code:
            otp.consumed_at = timezone.now()
            otp.save(update_fields=["consumed_at"])
            return otp

    # No match — increment attempts on the most recent so we still rate-limit brute force.
    latest = candidates[0]
    if latest.attempts >= MAX_VERIFY_ATTEMPTS:
        raise ValidationError({"code": "Too many failed attempts. Request a new code."})
    latest.attempts += 1
    latest.save(update_fields=["attempts"])
    raise ValidationError({"code": "Incorrect code."})
