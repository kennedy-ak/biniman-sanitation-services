from django.urls import path

from fleets import views

app_name = "fleets"

urlpatterns = [
    path("signup/", views.signup, name="signup"),
    path("me/", views.my_fleet, name="me"),
    # Roster
    path("drivers/", views.list_drivers, name="drivers-list"),
    path("drivers/invite/", views.invite_driver, name="drivers-invite"),
    path("drivers/<int:driver_id>/", views.remove_driver, name="drivers-remove"),
    # Jobs + earnings
    path("jobs/", views.list_jobs, name="jobs"),
    path("payouts/", views.list_payouts, name="payouts"),
    path("earnings/", views.weekly_earnings, name="earnings"),
    # Admin
    path("admin/", views.admin_list, name="admin-list"),
    path("admin/<int:fleet_id>/action/", views.admin_action, name="admin-action"),
]
