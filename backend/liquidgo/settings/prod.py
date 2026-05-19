import os
import sys

from .base import *  # noqa

DEBUG = False

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Refuse to start if webhook secret is missing — prevents silent mock-mode in prod.
if not os.environ.get("PAYSTACK_WEBHOOK_SECRET", ""):
    sys.exit(
        "FATAL: PAYSTACK_WEBHOOK_SECRET is not set. "
        "Refusing to start in production without webhook authentication."
    )
