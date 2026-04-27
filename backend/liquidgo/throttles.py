"""Reusable throttle classes keyed off DEFAULT_THROTTLE_RATES scopes.

Function-based @api_view decorators don't reliably propagate `throttle_scope`
to the wrapped view, so we subclass once per scope and apply via @throttle_classes.
"""
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class OTPRequestThrottle(AnonRateThrottle):
    scope = "otp_request"


class OTPVerifyThrottle(AnonRateThrottle):
    scope = "otp_verify"


class PaymentInitThrottle(UserRateThrottle):
    scope = "payment_init"


class PaymentVerifyThrottle(UserRateThrottle):
    scope = "payment_verify"


class WebhookThrottle(AnonRateThrottle):
    scope = "webhook"
