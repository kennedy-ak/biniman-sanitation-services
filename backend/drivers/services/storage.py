"""File upload helper. Uses Cloudinary when configured, local VPS disk otherwise.

Images are compressed (max 1920 px, JPEG q=80) before saving to keep disk usage low.
PDFs and non-image files pass through without modification.
"""
import io
import logging
import os
import secrets
from typing import IO

from django.conf import settings
from django.core.files.storage import default_storage

logger = logging.getLogger(__name__)

MAX_DIMENSION = 1920
JPEG_QUALITY = 80


def _is_configured() -> bool:
    cfg = settings.CLOUDINARY
    return bool(cfg.get("cloud_name") and cfg.get("api_key") and cfg.get("api_secret"))


def _compress_image(file_obj: IO) -> tuple[IO, str]:
    """Return (compressed_file, extension). Non-images returned as-is."""
    from PIL import Image, UnidentifiedImageError

    original_name = getattr(file_obj, "name", "") or ""
    ext = os.path.splitext(original_name)[1].lower()

    try:
        img = Image.open(file_obj)
    except UnidentifiedImageError:
        file_obj.seek(0)
        return file_obj, ext or ".bin"

    img = img.convert("RGB")

    if img.width > MAX_DIMENSION or img.height > MAX_DIMENSION:
        img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    buf.seek(0)
    buf.name = os.path.splitext(original_name)[0] + ".jpg" if original_name else "upload.jpg"
    logger.info(
        "[COMPRESS] %s -> JPEG q=%s max=%spx",
        original_name or "upload", JPEG_QUALITY, MAX_DIMENSION,
    )
    return buf, ".jpg"


def upload_document(file_obj: IO, folder: str = "biniman/drivers", resource_type: str = "auto") -> dict:
    """Upload a file. Returns ``{"url": ..., "public_id": ...}``.

    Uses Cloudinary when credentials are set, otherwise saves to MEDIA_ROOT
    on the local VPS disk and returns a full URL via BACKEND_BASE_URL.
    Images are compressed before saving in both paths.

    Pass resource_type="raw" for PDFs/binary files to guarantee public access —
    "auto" can classify PDFs as restricted depending on the Cloudinary account plan.
    """
    original_name = getattr(file_obj, "name", "") or ""
    ext = os.path.splitext(original_name)[1].lower()
    is_image = ext in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff"}

    if is_image:
        file_obj, ext = _compress_image(file_obj)

    if not _is_configured():
        token = secrets.token_hex(8)
        filename = f"{token}{ext or os.path.splitext(getattr(file_obj, 'name', 'file'))[1] or '.bin'}"
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
    result = cloudinary.uploader.upload(
        file_obj,
        folder=folder,
        resource_type=resource_type,
        access_mode="public",
    )
    return {"url": result["secure_url"], "public_id": result["public_id"]}
