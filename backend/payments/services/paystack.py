"""Paystack adapter. Falls back to a deterministic mock when PAYSTACK_SECRET_KEY is empty.

The mock returns success immediately so the dev environment exercises the same
code paths as production without external calls.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from decimal import Decimal
from typing import Any

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

PAYSTACK_BASE = "https://api.paystack.co"


class PaystackError(Exception):
    pass


def _is_live() -> bool:
    return bool(settings.PAYSTACK_SECRET_KEY)


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json",
    }


def _post(path: str, payload: dict) -> dict:
    resp = requests.post(f"{PAYSTACK_BASE}{path}", json=payload, headers=_headers(), timeout=20)
    data = resp.json()
    if not resp.ok or not data.get("status"):
        raise PaystackError(data.get("message") or f"Paystack error {resp.status_code}")
    return data["data"]


def _get(path: str) -> dict:
    resp = requests.get(f"{PAYSTACK_BASE}{path}", headers=_headers(), timeout=20)
    data = resp.json()
    if not resp.ok or not data.get("status"):
        raise PaystackError(data.get("message") or f"Paystack error {resp.status_code}")
    return data["data"]


# ---------------- Public API ----------------


def initialize_transaction(*, email: str, amount_ghs: Decimal, reference: str | None = None) -> dict:
    """Initialize a charge. Returns a dict with reference, authorization_url, access_code."""
    ref = reference or f"liquidgo_{secrets.token_hex(8)}"
    amount_kobo = int((amount_ghs * Decimal("100")).quantize(Decimal("1")))

    if not _is_live():
        logger.warning("[PAYSTACK MOCK] init txn ref=%s amount=%s", ref, amount_ghs)
        return {
            "mocked": True,
            "reference": ref,
            "authorization_url": f"https://mock.paystack.co/pay/{ref}",
            "access_code": f"mock_{ref}",
        }

    return _post(
        "/transaction/initialize",
        {
            "email": email,
            "amount": amount_kobo,
            "reference": ref,
            "currency": "GHS",
            "channels": ["mobile_money", "card"],
        },
    )


def verify_transaction(reference: str) -> dict:
    """Returns the full transaction record. Status field will be 'success' on success."""
    if not _is_live():
        logger.warning("[PAYSTACK MOCK] verify ref=%s -> success", reference)
        return {
            "mocked": True,
            "status": "success",
            "reference": reference,
            "channel": "mobile_money",
            "currency": "GHS",
            "paid_at": None,
        }
    return _get(f"/transaction/verify/{reference}")


def create_transfer_recipient(*, name: str, momo_number: str, bank_code: str = "MTN") -> dict:
    """Create a Paystack TransferRecipient for a driver's MoMo wallet."""
    if not _is_live():
        return {"mocked": True, "recipient_code": f"RCP_mock_{secrets.token_hex(6)}"}
    return _post(
        "/transferrecipient",
        {
            "type": "mobile_money",
            "name": name,
            "account_number": momo_number,
            "bank_code": bank_code,
            "currency": "GHS",
        },
    )


def initiate_transfer(*, recipient_code: str, amount_ghs: Decimal, reason: str = "Biniman payout") -> dict:
    if not _is_live():
        return {
            "mocked": True,
            "status": "success",
            "transfer_code": f"TRF_mock_{secrets.token_hex(6)}",
            "reference": f"trf_{secrets.token_hex(8)}",
        }
    amount_kobo = int((amount_ghs * Decimal("100")).quantize(Decimal("1")))
    return _post(
        "/transfer",
        {
            "source": "balance",
            "amount": amount_kobo,
            "recipient": recipient_code,
            "reason": reason,
            "currency": "GHS",
        },
    )


def refund_transaction(*, reference: str, amount_ghs: Decimal | None = None) -> dict:
    if not _is_live():
        return {"mocked": True, "status": "success"}
    payload: dict[str, Any] = {"transaction": reference}
    if amount_ghs is not None:
        payload["amount"] = int((amount_ghs * Decimal("100")).quantize(Decimal("1")))
    return _post("/refund", payload)


def verify_signature(raw_body: bytes, signature: str | None) -> bool:
    if not signature:
        return False
    secret = settings.PAYSTACK_WEBHOOK_SECRET or settings.PAYSTACK_SECRET_KEY
    if not secret:
        # In mock mode we accept whatever comes in to enable local testing.
        return True
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)


# ---------------- Bank code helpers ----------------

MOMO_BANK_CODES = {
    "mtn": "MTN",
    "vodafone": "VOD",
    "airteltigo": "ATL",
}


def momo_bank_code(provider: str) -> str:
    return MOMO_BANK_CODES.get(provider.lower(), "MTN")
