"""File upload helper. Uses Cloudinary when configured, local VPS disk otherwise."""
import logging
import os
import secrets
from typing import IO

from django.conf import settings
from django.core.files.storage import default_storage

logger = logging.getLogger(__name__)


def _is_configured() -> bool:
    cfg = settings.CLOUDINARY
    return bool(cfg.get("cloud_name") and cfg.get("api_key") and cfg.get("api_secret"))


def upload_document(file_obj: IO, folder: str = "biniman/drivers") -> dict:
    """Upload a file. Returns ``{"url": ..., "public_id": ...}``.

    Uses Cloudinary when credentials are set, otherwise saves to MEDIA_ROOT
    on the local VPS disk and returns a full URL via BACKEND_BASE_URL.
    """
    if not _is_configured():
        filename = f"{secrets.token_hex(8)}_{os.path.basename(getattr(file_obj, 'name', 'file'))}"
        save_path = f"{folder}/{filename}"
        saved = default_storage.save(save_path, file_obj)
        base = settings.BACKEND_BASE_URL.rstrip("/")
        media = settings.MEDIA_URL.rstrip("/")
        url = f"{base}{media}/{saved}"
        logger.info("[LOCAL STORAGE] saved %s -> %s", saved, url)
        return {"url": url, "public_id": saved}

    import cloudinary  # local import keeps app start fast
    import cloudinary.uploader

    cloudinary.config(**settings.CLOUDINARY)
    result = cloudinary.uploader.upload(file_obj, folder=folder, resource_type="auto")
    return {"url": result["secure_url"], "public_id": result["public_id"]}
