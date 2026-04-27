from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import PhoneOTP, Region, User


@admin.register(Region)
class RegionAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "code")


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("-created_at",)
    list_display = ("phone", "full_name", "role", "region", "is_phone_verified", "is_active")
    list_filter = ("role", "is_phone_verified", "is_active", "region")
    search_fields = ("phone", "email", "full_name")
    readonly_fields = ("last_login", "created_at", "updated_at")
    fieldsets = (
        (None, {"fields": ("phone", "password")}),
        ("Profile", {"fields": ("full_name", "email", "role", "region")}),
        ("Status", {"fields": ("is_phone_verified", "is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Timestamps", {"fields": ("last_login", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("phone", "password1", "password2", "role")}),
    )


@admin.register(PhoneOTP)
class PhoneOTPAdmin(admin.ModelAdmin):
    list_display = ("phone", "purpose", "attempts", "consumed_at", "created_at")
    list_filter = ("purpose",)
    search_fields = ("phone",)
    readonly_fields = ("phone", "code", "purpose", "attempts", "consumed_at", "created_at")
