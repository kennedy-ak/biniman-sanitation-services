"""Custom DRF exception handler.

Rewrites the default 429 throttled message into something a user can read,
with the wait time in minutes instead of raw seconds.
"""
from rest_framework.exceptions import Throttled
from rest_framework.views import exception_handler as drf_default_handler


SCOPE_LABELS = {
    "otp_request": "OTP code",
    "otp_verify": "OTP verification",
    "payment_init": "payment",
    "payment_verify": "payment verification",
    "webhook": "webhook",
}


def _humanize_seconds(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds} seconds"
    minutes = round(seconds / 60)
    if minutes < 60:
        return f"about {minutes} minute{'s' if minutes != 1 else ''}"
    hours = seconds // 3600
    rem_min = round((seconds % 3600) / 60)
    if rem_min == 0:
        return f"about {hours} hour{'s' if hours != 1 else ''}"
    return f"about {hours}h {rem_min}m"


def custom_exception_handler(exc, context):
    response = drf_default_handler(exc, context)

    if isinstance(exc, Throttled) and response is not None:
        wait = int(exc.wait or 0)
        view = context.get("view")
        scope = getattr(view, "throttle_scope", None) or getattr(
            getattr(view, "throttle_classes", [None])[0], "scope", None
        )
        label = SCOPE_LABELS.get(scope, "this action")

        when = _humanize_seconds(wait) if wait else "a moment"
        response.data = {
            "detail": (
                f"Too many {label} requests. Please try again in {when}."
            ),
            "retry_after_seconds": wait,
        }

    return response
