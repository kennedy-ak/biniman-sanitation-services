"""Cloudinary upload helper with a dev mock when no credentials are configured."""
import logging
import secrets
from typing import IO

from django.conf import settings

logger = logging.getLogger(__name__)


def _is_configured() -> bool:
    cfg = settings.CLOUDINARY
    return bool(cfg.get("cloud_name") and cfg.get("api_key") and cfg.get("api_secret"))


def upload_document(file_obj: IO, folder: str = "liquidgo/drivers") -> dict:
    """Upload a file. Returns ``{"url": ..., "public_id": ...}``.

    When Cloudinary is not configured, returns a deterministic fake URL so
    onboarding flows still work end-to-end during development.
    """
    if not _is_configured():
        token = secrets.token_hex(8)
        url = f"https://placehold.co/600x400?text=mock+upload+{token}"
        logger.warning("[CLOUDINARY MOCK] folder=%s -> %s", folder, url)
        return {"url": url, "public_id": f"mock/{token}"}

    import cloudinary  # local import keeps app start fast
    import cloudinary.uploader

    cloudinary.config(**settings.CLOUDINARY)
    result = cloudinary.uploader.upload(file_obj, folder=folder, resource_type="auto")
    return {"url": result["secure_url"], "public_id": result["public_id"]}
