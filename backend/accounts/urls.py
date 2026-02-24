from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CustomerLoginView,
    LoginView,
    LogoutView,
    MeView,
    ProviderProfileMeView,
    ProviderModerationViewSet,
    ProviderLoginView,
    RegisterCustomerView,
    RegisterProviderView,
    UserModerationViewSet,
)

router = DefaultRouter()
router.register(r"admin/providers", ProviderModerationViewSet, basename="admin-providers")
router.register(r"admin/users", UserModerationViewSet, basename="admin-users")

urlpatterns = [
    path("register/customer/", RegisterCustomerView.as_view(), name="register-customer"),
    path("register/provider/", RegisterProviderView.as_view(), name="register-provider"),
    path("login/", LoginView.as_view(), name="login"),
    path("login/customer/", CustomerLoginView.as_view(), name="login-customer"),
    path("login/provider/", ProviderLoginView.as_view(), name="login-provider"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("provider/profile/", ProviderProfileMeView.as_view(), name="provider-profile-me"),
    path("", include(router.urls)),
]
