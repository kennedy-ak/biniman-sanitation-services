"""Coordinates the payment lifecycle around a ServiceRequest."""
from __future__ import annotations

import logging

from django.db import transaction
from django.utils import timezone

from drivers.models import Driver
from payments.models import (
    Payment,
    PaymentMethod,
    PaymentStatus,
    Payout,
    PayoutStatus,
)
from payments.services import paystack
from requests_app.models import ServiceRequest

logger = logging.getLogger(__name__)


# ---------------- Charge ----------------


def initialize_payment_for_request(request: ServiceRequest) -> Payment:
    """Create Payment row + Paystack initialize call (mocked when no key)."""
    if hasattr(request, "payment"):
        return request.payment

    email = request.customer.email or f"{request.customer.phone.lstrip('+')}@liquidgo.local"
    init = paystack.initialize_transaction(
        email=email, amount_ghs=request.quote_total
    )
    payment = Payment.objects.create(
        request=request,
        customer=request.customer,
        amount=request.quote_total,
        paystack_reference=init["reference"],
        paystack_authorization_url=init.get("authorization_url", ""),
        paystack_access_code=init.get("access_code", ""),
    )
    return payment


def confirm_payment(payment: Payment, *, channel: str = "unknown") -> Payment:
    """Mark a payment succeeded; pay the driver out if the job is complete.

    Match-first / pay-after model: matching already happened at booking. The
    customer pays after the driver finishes, so successful payment is what
    releases the driver payout.

    Idempotent — calling repeatedly is safe.
    """
    if payment.status == PaymentStatus.SUCCEEDED:
        return payment

    method = PaymentMethod.MOMO if "money" in channel else (
        PaymentMethod.CARD if channel == "card" else PaymentMethod.UNKNOWN
    )

    with transaction.atomic():
        payment.status = PaymentStatus.SUCCEEDED
        payment.method = method
        payment.paid_at = timezone.now()
        payment.save(update_fields=["status", "method", "paid_at", "updated_at"])

    # If the job is already finished and the driver hasn't been paid yet,
    # release the payout now. If they pay before the job is done (rare —
    # would only happen via a manual /payments/init/ call), the payout will
    # be triggered later by a separate path; trigger_payout itself is a no-op
    # when the request has no driver yet.
    from payments.tasks import task_trigger_payout
    task_trigger_payout.delay(payment.request_id)

    logger.info(
        "Payment %s succeeded for req %s — payout queued",
        payment.paystack_reference, payment.request_id,
    )
    return payment


def fail_payment(payment: Payment, reason: str = "") -> Payment:
    if payment.status in {PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED}:
        return payment
    payment.status = PaymentStatus.FAILED
    payment.save(update_fields=["status", "updated_at"])
    logger.info("Payment %s failed: %s", payment.paystack_reference, reason)
    return payment


# ---------------- Refund ----------------


def refund_request(request: ServiceRequest, reason: str = "") -> Payment | None:
    payment = getattr(request, "payment", None)
    if not payment or payment.status != PaymentStatus.SUCCEEDED:
        return payment

    paystack.refund_transaction(reference=payment.paystack_reference)
    payment.status = PaymentStatus.REFUNDED
    payment.refunded_at = timezone.now()
    payment.refund_amount = payment.amount
    payment.save(update_fields=["status", "refunded_at", "refund_amount", "updated_at"])
    logger.info("Payment %s refunded: %s", payment.paystack_reference, reason)
    return payment


# ---------------- Payout ----------------


def trigger_payout(request: ServiceRequest) -> Payout | None:
    """Transfer the driver's share to their MoMo wallet via Paystack.

    Only releases the payout once BOTH conditions hold:
      * the customer has paid (Payment.SUCCEEDED)
      * the driver has marked the job COMPLETED
    Safe to call from either side — the second event triggers it.
    Idempotent: returns the existing Payout if one exists.
    """
    from requests_app.models import RequestStatus  # avoid circular import

    if hasattr(request, "payout"):
        return request.payout
    payment = getattr(request, "payment", None)
    if not payment or payment.status != PaymentStatus.SUCCEEDED:
        logger.info("Payout deferred for req %s: payment not succeeded yet", request.id)
        return None
    if request.status != RequestStatus.COMPLETED.value:
        logger.info(
            "Payout deferred for req %s: job not completed (status=%s)",
            request.id, request.status,
        )
        return None
    driver: Driver | None = request.driver
    if not driver:
        return None
    if not driver.momo_number:
        logger.warning("Driver %s has no MoMo number — payout skipped", driver.id)
        return None

    bank_code = paystack.momo_bank_code(driver.momo_provider or "mtn")
    recipient = paystack.create_transfer_recipient(
        name=driver.user.full_name or driver.user.phone,
        momo_number=driver.momo_number,
        bank_code=bank_code,
    )
    recipient_code = recipient["recipient_code"]

    payout_amount = (request.quote_total - request.commission_amount).quantize(
        request.quote_total
    )
    transfer = paystack.initiate_transfer(
        recipient_code=recipient_code,
        amount_ghs=payout_amount,
        reason=f"Biniman job #{request.id}",
    )

    payout = Payout.objects.create(
        request=request,
        driver=driver,
        amount=payout_amount,
        commission=request.commission_amount,
        paystack_recipient_code=recipient_code,
        paystack_transfer_code=transfer.get("transfer_code", ""),
        paystack_reference=transfer.get("reference", ""),
        status=PayoutStatus.SUCCEEDED if transfer.get("mocked") else PayoutStatus.PENDING,
    )
    if payout.status == PayoutStatus.SUCCEEDED:
        payout.transferred_at = timezone.now()
        payout.save(update_fields=["transferred_at", "updated_at"])
    logger.info("Payout %s queued for req %s", payout.id, request.id)
    return payout


def confirm_payout_success(payout: Payout) -> Payout:
    if payout.status == PayoutStatus.SUCCEEDED:
        return payout
    payout.status = PayoutStatus.SUCCEEDED
    payout.transferred_at = timezone.now()
    payout.save(update_fields=["status", "transferred_at", "updated_at"])
    return payout


def fail_payout(payout: Payout, reason: str) -> Payout:
    payout.status = PayoutStatus.FAILED
    payout.failure_reason = reason
    payout.save(update_fields=["status", "failure_reason", "updated_at"])
    return payout
