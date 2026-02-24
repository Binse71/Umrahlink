from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import BookingThreadViewSet, MessageViewSet

router = DefaultRouter()
router.register(r"threads", BookingThreadViewSet, basename="threads")
router.register(r"messages", MessageViewSet, basename="messages")

urlpatterns = [
    path("", include(router.urls)),
]
