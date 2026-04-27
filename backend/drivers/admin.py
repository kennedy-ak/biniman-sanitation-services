from django.contrib import admin

from .models import Driver, DriverDocument


class DriverDocumentInline(admin.TabularInline):
    model = DriverDocument
    extra = 0
    readonly_fields = ("doc_type", "file_url", "public_id", "uploaded_at")
    can_delete = False


@admin.register(Driver)
class DriverAdmin(admin.ModelAdmin):
    list_display = ("user", "vehicle_reg", "vehicle_type", "status", "is_online", "fleet")
    list_filter = ("status", "vehicle_type", "is_online", "fleet")
    search_fields = ("user__phone", "vehicle_reg", "license_number")
    readonly_fields = ("created_at", "updated_at", "approved_at", "approved_by", "last_seen_at")
    inlines = [DriverDocumentInline]
