from django.urls import path

from payments import views

app_name = "payments"

urlpatterns = [
    path("init/", views.init_payment, name="init"),
    path("verify/<str:reference>/", views.verify_payment, name="verify"),
    path("mine/", views.my_payments, name="mine"),
    path("webhook/", views.webhook, name="webhook"),
    path("admin/payments/", views.admin_payments, name="admin-payments"),
    path("admin/payouts/", views.admin_payouts, name="admin-payouts"),
]
