from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AvailabilityViewSet, ProviderDirectoryViewSet, ReviewViewSet, ServiceViewSet

router = DefaultRouter()
router.register(r"providers", ProviderDirectoryViewSet, basename="provider-directory")
router.register(r"services", ServiceViewSet, basename="services")
router.register(r"reviews", ReviewViewSet, basename="reviews")
router.register(r"availability", AvailabilityViewSet, basename="availability")

urlpatterns = [
    path("", include(router.urls)),
]
