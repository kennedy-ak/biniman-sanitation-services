from django.contrib import admin

from .models import Rating


@admin.register(Rating)
class RatingAdmin(admin.ModelAdmin):
    list_display = ("id", "request", "rated_by", "rated_user", "score", "created_at")
    list_filter = ("score",)
    search_fields = ("rated_by__phone", "rated_user__phone", "comment")
    readonly_fields = ("request", "rated_by", "rated_user", "created_at")
