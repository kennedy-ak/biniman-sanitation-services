from django.urls import path

from ratings import views

app_name = "ratings"

urlpatterns = [
    path("", views.create_rating, name="create"),
    path("mine/", views.my_ratings, name="mine"),
    path("requests/<int:request_id>/", views.request_ratings, name="request"),
    path("users/<int:user_id>/", views.user_summary, name="user-summary"),
    path("admin/flagged/", views.admin_flagged, name="admin-flagged"),
]
