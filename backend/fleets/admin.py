from django.contrib import admin

from .models import FleetCompany


@admin.register(FleetCompany)
class FleetCompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "registration_number", "owner", "region", "status")
    list_filter = ("status", "region")
    search_fields = ("name", "registration_number", "owner__phone")
    readonly_fields = ("created_at", "updated_at", "approved_at", "approved_by")
