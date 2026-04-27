from django.urls import path

from pricing import views

app_name = "pricing"

urlpatterns = [
    path("admin/configs/", views.list_configs, name="admin-configs"),
    path("admin/configs/<int:region_id>/", views.update_config, name="admin-config-update"),
]
