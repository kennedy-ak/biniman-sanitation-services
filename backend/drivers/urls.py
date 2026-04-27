from django.urls import path

from drivers import views

app_name = "drivers"

urlpatterns = [
    path("onboard/", views.onboard, name="onboard"),
    path("me/", views.my_profile, name="me"),
    path("documents/", views.upload_doc, name="upload-doc"),
    path("admin/", views.admin_list, name="admin-list"),
    path("admin/<int:driver_id>/action/", views.admin_action, name="admin-action"),
]
