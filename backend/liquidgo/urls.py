from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({"status": "ok", "service": "biniman-api"})


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
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
