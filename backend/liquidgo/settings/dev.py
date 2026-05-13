from .base import *  # noqa

DEBUG = True
ALLOWED_HOSTS = ["*"]

# Allow all origins in dev for convenience
CORS_ALLOW_ALL_ORIGINS = True

# Use in-memory cache in dev so Redis is not required for throttling
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}
