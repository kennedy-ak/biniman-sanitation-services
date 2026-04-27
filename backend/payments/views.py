import json
import logging

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role
from drivers.permissions import IsAdmin
from payments.models import Payment, PaymentStatus, Payout, WebhookEvent
from payments.serializers import (
    InitPaymentRequestSerializer,
    PaymentSerializer,
    PayoutSerializer,
)
from payments.services import paystack
from payments.services.orchestrator import (
    confirm_payment,
    confirm_payout_success,
    fail_payment,
    fail_payout,
    initialize_payment_for_request,
)
from requests_app.models import ServiceRequest

logger = logging.getLogger(__name__)


# ---------------- Customer-facing ----------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def init_payment(request):
    serializer = InitPaymentRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    sr = get_object_or_404(ServiceRequest, pk=serializer.validated_data["request_id"])

    if sr.customer_id != request.user.id:
        raise PermissionDenied()
    if sr.status not in {"pending"}:
        raise ValidationError({"detail": "Request is not in a payable state."})

    payment = initialize_payment_for_request(sr)

    # In mock mode (no Paystack key), Paystack adapter returns mocked=True and the
    # transaction never actually charges — so auto-confirm so cascade fires and dev
    # flow continues seamlessly without external dependencies.
    if not paystack._is_live():
        confirm_payment(payment, channel="mobile_money")

    return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_payment(request, reference: str):
    payment = get_object_or_404(Payment, paystack_reference=reference)
    if payment.customer_id != request.user.id and not request.user.is_staff:
        raise PermissionDenied()

    data = paystack.verify_transaction(reference)
    if data.get("status") == "success":
        confirm_payment(payment, channel=data.get("channel", "unknown"))
    elif data.get("status") in {"failed", "abandoned"}:
        fail_payment(payment, reason=data.get("gateway_response", ""))
    return Response(PaymentSerializer(payment).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_payments(request):
    qs = Payment.objects.filter(customer=request.user)
    return Response(PaymentSerializer(qs, many=True).data)


# ---------------- Webhook ----------------


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def webhook(request):
    raw = request.body
    sig = request.headers.get("x-paystack-signature")
    if not paystack.verify_signature(raw, sig):
        return Response({"detail": "invalid signature"}, status=400)

    try:
        event = json.loads(raw)
    except json.JSONDecodeError:
        return Response({"detail": "invalid json"}, status=400)

    event_id = str(event.get("id") or event.get("data", {}).get("reference") or "")
    event_type = event.get("event", "")
    if not event_id or not event_type:
        return Response({"detail": "missing event id/type"}, status=400)

    with transaction.atomic():
        existing = WebhookEvent.objects.filter(event_id=event_id).first()
        if existing:
            return Response({"ok": True, "duplicate": True})
        WebhookEvent.objects.create(
            event_id=event_id, event_type=event_type, payload=event
        )

    data = event.get("data", {})
    if event_type == "charge.success":
        ref = data.get("reference")
        try:
            payment = Payment.objects.get(paystack_reference=ref)
        except Payment.DoesNotExist:
            logger.warning("charge.success for unknown ref %s", ref)
            return Response({"ok": True})
        confirm_payment(payment, channel=data.get("channel", "unknown"))

    elif event_type in {"charge.failed", "transaction.failed"}:
        ref = data.get("reference")
        payment = Payment.objects.filter(paystack_reference=ref).first()
        if payment:
            fail_payment(payment, reason=data.get("gateway_response", ""))

    elif event_type == "transfer.success":
        ref = data.get("reference") or data.get("transfer_code")
        payout = Payout.objects.filter(paystack_reference=ref).first() or \
                 Payout.objects.filter(paystack_transfer_code=data.get("transfer_code", "")).first()
        if payout:
            confirm_payout_success(payout)

    elif event_type in {"transfer.failed", "transfer.reversed"}:
        ref = data.get("transfer_code")
        payout = Payout.objects.filter(paystack_transfer_code=ref).first()
        if payout:
            fail_payout(payout, reason=data.get("reason") or event_type)

    return Response({"ok": True})


# ---------------- Admin ----------------


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_payments(request):
    qs = Payment.objects.select_related("request", "customer").all()
    status_filter = request.query_params.get("status")
    if status_filter:
        qs = qs.filter(status=status_filter)
    return Response(PaymentSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def admin_payouts(request):
    qs = Payout.objects.select_related("request", "driver", "driver__user").all()
    status_filter = request.query_params.get("status")
    if status_filter:
        qs = qs.filter(status=status_filter)
    return Response(PayoutSerializer(qs, many=True).data)
