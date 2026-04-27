from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from accounts import views

app_name = "accounts"

urlpatterns = [
    path("otp/request/", views.otp_request, name="otp-request"),
    path("otp/verify/", views.otp_verify, name="otp-verify"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", views.me, name="me"),
    path("me/update/", views.update_profile, name="me-update"),
    path("regions/", views.regions, name="regions"),
]
