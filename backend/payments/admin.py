from django.contrib import admin

from .models import Payment, Payout, WebhookEvent


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("paystack_reference", "request", "amount", "status", "method", "paid_at")
    list_filter = ("status", "method")
    search_fields = ("paystack_reference", "customer__phone")
    readonly_fields = (
        "paystack_reference", "paystack_authorization_url", "paystack_access_code",
        "created_at", "updated_at", "paid_at", "refunded_at",
    )


@admin.register(Payout)
class PayoutAdmin(admin.ModelAdmin):
    list_display = ("request", "driver", "amount", "status", "transferred_at")
    list_filter = ("status",)
    search_fields = ("paystack_transfer_code", "driver__user__phone")
    readonly_fields = (
        "paystack_recipient_code", "paystack_transfer_code", "paystack_reference",
        "created_at", "updated_at", "transferred_at",
    )


@admin.register(WebhookEvent)
class WebhookEventAdmin(admin.ModelAdmin):
    list_display = ("event_type", "event_id", "processed_at")
    search_fields = ("event_id", "event_type")
    readonly_fields = ("event_id", "event_type", "payload", "processed_at")
