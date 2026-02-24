from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import BookingViewSet, PaymentWebhookView

router = DefaultRouter()
router.register(r"", BookingViewSet, basename="bookings")

urlpatterns = [
    path("webhook/", PaymentWebhookView.as_view(), name="payment-webhook"),
    path("", include(router.urls)),
]
