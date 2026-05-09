from django.urls import path

from analytics import views

app_name = "analytics"

urlpatterns = [
    path("overview/", views.overview, name="overview"),
    path("daily/", views.daily_jobs, name="daily"),
    path("top-drivers/", views.top_drivers, name="top-drivers"),
    path("users/", views.list_users, name="list-users"),
    path("users/create/", views.user_create, name="user-create"),
    path("users/bulk-delete/", views.user_bulk_delete, name="user-bulk-delete"),
    path("users/<int:user_id>/", views.user_detail, name="user-detail"),
    path("users/<int:user_id>/update/", views.user_update, name="user-update"),
    path("users/<int:user_id>/active/", views.user_set_active, name="user-active"),
    path("users/<int:user_id>/delete/", views.user_delete, name="user-delete"),
    path("disputes/", views.disputes, name="disputes"),
    path("requests/<int:request_id>/refund/", views.force_refund, name="force-refund"),
    path("requests/<int:request_id>/payout/", views.force_payout, name="force-payout"),
    path("requests/<int:request_id>/force-complete/", views.admin_force_complete, name="force-complete"),
    path("payouts/<int:payout_id>/mark-succeeded/", views.mark_payout_succeeded, name="payout-succeeded"),
]
