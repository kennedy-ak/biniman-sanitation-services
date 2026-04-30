"""Email-OTP service: send + verify codes for email add/change."""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import Throttled, ValidationError

from accounts.models import EmailOTP, User
from notifications.services.email import send_email


def request_email_otp(user: User, email: str) -> EmailOTP:
    """Generate + send a code to `email` for the given user.

    Rate-limited per-user. Caller must validate that the email is free
    (not owned by a different user).
    """
    now = timezone.now()
    email = (email or "").strip().lower()

    last = user.email_otps.order_by("-created_at").first()
    if last and (now - last.created_at) < EmailOTP.REQUEST_COOLDOWN:
        seconds_left = int((EmailOTP.REQUEST_COOLDOWN - (now - last.created_at)).total_seconds())
        raise Throttled(
            wait=seconds_left,
            detail=f"Please wait {seconds_left}s before requesting another code.",
        )

    hourly = user.email_otps.filter(created_at__gte=now - timedelta(hours=1)).count()
    if hourly >= EmailOTP.HOURLY_LIMIT:
        raise Throttled(wait=600, detail="Hourly email-OTP limit reached. Try again later.")

    code = EmailOTP.generate_code()
    with transaction.atomic():
        otp = EmailOTP.objects.create(user=user, email=email, code=code)

    subject = "Confirm your Biniman email"
    text = (
        f"Your Biniman email verification code is {code}.\n"
        "It expires in 10 minutes.\n\n"
        "If you didn't request this, you can ignore this email."
    )
    html = (
        f"<p>Your Biniman email verification code is "
        f'<strong style="font-size:18px;letter-spacing:2px">{code}</strong>.</p>'
        "<p>It expires in 10 minutes.</p>"
        '<p style="color:#888;font-size:12px">If you didn\'t request this, you can ignore this email.</p>'
    )
    send_email(email, subject, html, text)
    return otp


def verify_email_otp(user: User, email: str, code: str) -> User:
    """Validate code, then attach + verify email on the user."""
    email = (email or "").strip().lower()
    cutoff = timezone.now() - EmailOTP.OTP_TTL
    candidates = list(
        user.email_otps.filter(
            email__iexact=email,
            consumed_at__isnull=True,
            created_at__gte=cutoff,
        ).order_by("-created_at")
    )
    if not candidates:
        raise ValidationError(
            {"code": "No active code for this email. Request a new one."}
        )

    for otp in candidates:
        if otp.attempts >= EmailOTP.MAX_VERIFY_ATTEMPTS:
            continue
        if otp.code == code:
            otp.consumed_at = timezone.now()
            otp.save(update_fields=["consumed_at"])
            # Re-check uniqueness at write-time to avoid a race.
            if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
                raise ValidationError(
                    {"email": "This email is already linked to another account."}
                )
            user.email = email
            user.is_email_verified = True
            user.save(update_fields=["email", "is_email_verified"])
            return user

    latest = candidates[0]
    if latest.attempts >= EmailOTP.MAX_VERIFY_ATTEMPTS:
        raise ValidationError({"code": "Too many failed attempts. Request a new code."})
    latest.attempts += 1
    latest.save(update_fields=["attempts"])
    raise ValidationError({"code": "Incorrect code."})
