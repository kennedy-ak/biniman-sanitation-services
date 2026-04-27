from django.contrib import admin

from .models import RequestAssignment, ServiceRequest


class RequestAssignmentInline(admin.TabularInline):
    model = RequestAssignment
    extra = 0
    readonly_fields = ("driver", "distance_km", "expires_at", "outcome", "decided_at", "created_at")
    can_delete = False


@admin.register(ServiceRequest)
class ServiceRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "customer", "driver", "status", "waste_type", "volume_tier", "quote_total", "created_at")
    list_filter = ("status", "waste_type", "volume_tier", "region")
    search_fields = ("customer__phone", "driver__user__phone", "pickup_address")
    readonly_fields = (
        "created_at", "accepted_at", "en_route_at", "arrived_at",
        "completed_at", "cancelled_at",
    )
    inlines = [RequestAssignmentInline]


@admin.register(RequestAssignment)
class RequestAssignmentAdmin(admin.ModelAdmin):
    list_display = ("id", "request", "driver", "distance_km", "outcome", "expires_at", "created_at")
    list_filter = ("outcome",)
    readonly_fields = ("request", "driver", "distance_km", "expires_at", "outcome", "decided_at", "created_at")
