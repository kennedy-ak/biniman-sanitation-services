"""Resend email adapter with a dev mock when no API key is configured."""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


def send_email(to_email: str, subject: str, html: str, text: str = "") -> dict:
    """Send a transactional email via Resend.

    Falls back to a console-logged mock when RESEND_API_KEY is empty so OTP
    codes are visible in dev terminals.
    """
    api_key = getattr(settings, "RESEND_API_KEY", "")
    sender = getattr(settings, "RESEND_FROM_EMAIL", "onboarding@resend.dev")

    if not api_key:
        banner = (
            f"\n{'=' * 60}\n[EMAIL MOCK] to={to_email} from={sender}\n"
            f"  subject: {subject}\n  body:    {text or html}\n{'=' * 60}\n"
        )
        print(banner, flush=True)
        logger.warning("[EMAIL MOCK] to=%s subject=%r", to_email, subject)
        return {"mocked": True, "to": to_email, "subject": subject}

    payload = {
        "from": sender,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text

    try:
        resp = requests.post(
            RESEND_ENDPOINT,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as exc:
        body = ""
        resp_obj = getattr(exc, "response", None)
        if resp_obj is not None:
            body = (resp_obj.text or "")[:500]
        logger.error(
            "Resend send failed (to=%s, from=%s): %s | body=%s",
            to_email, sender, exc, body,
        )
        return {"error": str(exc), "body": body}
