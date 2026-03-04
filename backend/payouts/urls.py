from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AdminProviderPayoutProfilesViewSet, PayoutLedgerViewSet, ProviderPayoutProfileMeView

router = DefaultRouter()
router.register(r"ledger", PayoutLedgerViewSet, basename="payout-ledger")
router.register(r"admin/provider-profiles", AdminProviderPayoutProfilesViewSet, basename="admin-provider-payout-profiles")

urlpatterns = [
    path("profile/", ProviderPayoutProfileMeView.as_view(), name="payout-profile-me"),
    path("", include(router.urls)),
]
