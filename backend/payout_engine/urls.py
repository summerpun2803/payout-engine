from django.contrib import admin
from django.urls import path
from merchants import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/merchant/balance', views.get_balance),
    path('api/v1/payouts', views.create_payout),
    path('api/v1/payouts/history', views.get_payout_history),
]
