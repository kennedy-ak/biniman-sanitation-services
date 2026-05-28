from django.urls import path

from requests_app import views

app_name = "requests_app"

urlpatterns = [
    # Customer
    path("quote/", views.quote_preview, name="quote"),
    path("", views.create_request, name="create"),
    path("mine/", views.my_requests, name="mine"),
    path("<int:request_id>/", views.request_detail, name="detail"),
    path("<int:request_id>/cancel/", views.cancel_request, name="cancel"),
    path("<int:request_id>/retry/", views.retry_request, name="retry"),
    path("<int:request_id>/receipt/", views.serve_receipt, name="receipt-serve"),
    path("<int:request_id>/dispute-thread/", views.dispute_thread, name="dispute-thread"),
    path("<int:request_id>/dispute-reply/", views.dispute_reply, name="dispute-reply"),
    path("<int:request_id>/cancel-reason/", views.submit_cancel_reason, name="cancel-reason"),
    # Driver
    path("driver/stats/", views.driver_stats, name="driver-stats"),
    path("driver/online/", views.driver_online, name="driver-online"),
    path("driver/ping/", views.driver_ping, name="driver-ping"),
    path("driver/offer/", views.driver_current_offer, name="driver-offer"),
    path("driver/active/", views.driver_active_request, name="driver-active"),
    path("driver/pending-rating/", views.driver_pending_rating, name="driver-pending-rating"),
    path("driver/history/", views.driver_job_history, name="driver-history"),
    path("driver/<int:assignment_id>/accept/", views.driver_accept, name="driver-accept"),
    path("driver/<int:assignment_id>/decline/", views.driver_decline, name="driver-decline"),
    path("driver/<int:request_id>/status/", views.driver_status, name="driver-status"),
]
