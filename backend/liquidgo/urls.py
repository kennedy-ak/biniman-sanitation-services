from django.conf import settings
from django.contrib import admin
from django.http import HttpResponseForbidden, JsonResponse
from django.urls import include, path, re_path
from django.views.static import serve as _serve


def health(_request):
    return JsonResponse({"status": "ok", "service": "biniman-api"})


def protected_media(request, path):
    """Serve MEDIA_ROOT files only to authenticated users."""
    if not request.user.is_authenticated:
        return HttpResponseForbidden()
    return _serve(request, path, document_root=settings.MEDIA_ROOT)


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", health, name="health"),
    path("api/v1/auth/", include("accounts.urls")),
    path("api/v1/drivers/", include("drivers.urls")),
    path("api/v1/fleets/", include("fleets.urls")),
    path("api/v1/requests/", include("requests_app.urls")),
    path("api/v1/pricing/", include("pricing.urls")),
    path("api/v1/payments/", include("payments.urls")),
    path("api/v1/ratings/", include("ratings.urls")),
    path("api/v1/analytics/", include("analytics.urls")),
    re_path(r"^media/(?P<path>.*)$", protected_media),
]
