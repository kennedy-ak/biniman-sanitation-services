"""mNotify SMS adapter with a dev mock when no API key is configured."""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

MNOTIFY_ENDPOINT = "https://api.mnotify.com/api/sms/quick"


def send_sms(to_phone: str, message: str) -> dict:
    """Send an SMS via mNotify. Falls back to a dev mock when MNOTIFY_API_KEY is empty.

    The mock logs the message + recipient at WARNING level so OTP codes are visible
    in dev terminals during local testing.
    """
    api_key = settings.MNOTIFY_API_KEY
    sender = settings.MNOTIFY_SENDER_ID

    if not api_key:
        banner = f"\n{'=' * 60}\n[SMS MOCK] to={to_phone} sender={sender}\n  {message}\n{'=' * 60}\n"
        print(banner, flush=True)
        logger.warning("[SMS MOCK] to=%s sender=%s body=%r", to_phone, sender, message)
        return {"mocked": True, "to": to_phone, "message": message}

    payload = {
        "key": api_key,
        "recipient[]": [to_phone],
        "sender": sender,
        "message": message,
    }
    try:
        resp = requests.post(MNOTIFY_ENDPOINT, data=payload, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as exc:
        logger.exception("mNotify send failed: %s", exc)
        return {"error": str(exc)}
