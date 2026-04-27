from rest_framework import serializers

from payments.models import Payment, Payout


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = (
            "id", "request", "amount", "currency", "status", "method",
            "paystack_reference", "paystack_authorization_url",
            "paid_at", "refunded_at", "refund_amount", "created_at",
        )
        read_only_fields = fields


class PayoutSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payout
        fields = (
            "id", "request", "driver", "amount", "commission",
            "paystack_transfer_code", "status", "failure_reason",
            "transferred_at", "created_at",
        )
        read_only_fields = fields


class InitPaymentRequestSerializer(serializers.Serializer):
    request_id = serializers.IntegerField()
