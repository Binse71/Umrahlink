from django.contrib.auth import get_user_model
from django.contrib.auth import authenticate, login, logout
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from notifications.services import notify_user

from .models import ProviderProfile
from .permissions import IsPlatformAdmin
from .serializers import (
    CustomerRegisterSerializer,
    LoginSerializer,
    ProviderProfileSerializer,
    ProviderRegisterSerializer,
    UserSerializer,
)

User = get_user_model()


def auth_payload(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {
        "token": token.key,
        "user": UserSerializer(user).data,
    }


class RegisterCustomerView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = CustomerRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(auth_payload(user), status=status.HTTP_201_CREATED)


class RegisterProviderView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ProviderRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(auth_payload(user), status=status.HTTP_201_CREATED)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class ProviderProfileMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.PROVIDER:
            return Response({"detail": "Only providers can access this endpoint."}, status=status.HTTP_403_FORBIDDEN)
        profile = getattr(request.user, "provider_profile", None)
        if profile is None:
            return Response({"detail": "Provider profile not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ProviderProfileSerializer(profile, context={"request": request}).data)

    def patch(self, request):
        if request.user.role != User.Role.PROVIDER:
            return Response({"detail": "Only providers can access this endpoint."}, status=status.HTTP_403_FORBIDDEN)
        profile = getattr(request.user, "provider_profile", None)
        if profile is None:
            return Response({"detail": "Provider profile not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ProviderProfileSerializer(profile, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class LoginView(APIView):
    permission_classes = [AllowAny]
    expected_role = None

    def validate_role(self, authenticated_user):
        if self.expected_role and authenticated_user.role != self.expected_role:
            role_name = self.expected_role.lower()
            return Response(
                {"detail": f"This account is not a {role_name} account."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return None

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        credential = serializer.validated_data["username_or_email"]
        password = serializer.validated_data["password"]

        user = User.objects.filter(email__iexact=credential).first()
        username = user.username if user else credential
        authenticated_user = authenticate(request, username=username, password=password)

        if not authenticated_user:
            return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)
        if authenticated_user.is_banned or not authenticated_user.is_active:
            return Response({"detail": "Account is blocked."}, status=status.HTTP_403_FORBIDDEN)
        role_error = self.validate_role(authenticated_user)
        if role_error:
            return role_error

        login(request, authenticated_user)
        return Response(auth_payload(authenticated_user))


class CustomerLoginView(LoginView):
    expected_role = User.Role.CUSTOMER


class ProviderLoginView(LoginView):
    expected_role = User.Role.PROVIDER


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        logout(request)
        return Response({"detail": "Signed out successfully."}, status=status.HTTP_200_OK)


class ProviderModerationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]
    serializer_class = ProviderProfileSerializer

    def get_queryset(self):
        queryset = ProviderProfile.objects.select_related("user").all()
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(verification_status=status_filter.upper())
        return queryset.order_by("-created_at")

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        profile = self.get_object()
        profile.verification_status = ProviderProfile.VerificationStatus.APPROVED
        profile.is_accepting_bookings = True
        profile.approved_at = timezone.now()
        profile.approved_by = request.user
        profile.rejected_reason = ""
        profile.save(update_fields=[
            "verification_status",
            "is_accepting_bookings",
            "approved_at",
            "approved_by",
            "rejected_reason",
            "updated_at",
        ])
        notify_user(
            user=profile.user,
            title="Provider profile approved",
            body="Your provider account is approved. You can now receive bookings.",
            event_type="ADMIN_APPROVAL",
            actor=request.user,
        )
        return Response(self.get_serializer(profile).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        profile = self.get_object()
        reason = request.data.get("reason", "")
        profile.verification_status = ProviderProfile.VerificationStatus.REJECTED
        profile.is_accepting_bookings = False
        profile.rejected_reason = reason
        profile.save(update_fields=["verification_status", "is_accepting_bookings", "rejected_reason", "updated_at"])
        notify_user(
            user=profile.user,
            title="Provider profile rejected",
            body=f"Your provider profile was rejected. {reason}".strip(),
            event_type="ADMIN_REJECTION",
            actor=request.user,
        )
        return Response(self.get_serializer(profile).data)

    @action(detail=True, methods=["post"])
    def ban_user(self, request, pk=None):
        profile = self.get_object()
        profile.user.is_banned = True
        profile.user.is_active = False
        profile.user.save(update_fields=["is_banned", "is_active", "updated_at"])
        notify_user(
            user=profile.user,
            title="Account banned",
            body="Your account has been banned by platform administration.",
            event_type="ADMIN_BAN",
            actor=request.user,
        )
        return Response({"detail": "Provider account banned."})


class UserModerationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]
    serializer_class = UserSerializer

    def get_queryset(self):
        queryset = User.objects.all()
        role_filter = self.request.query_params.get("role")
        banned_filter = self.request.query_params.get("banned")

        if role_filter:
            queryset = queryset.filter(role=role_filter.upper())
        if banned_filter == "1":
            queryset = queryset.filter(is_banned=True)
        if banned_filter == "0":
            queryset = queryset.filter(is_banned=False)
        return queryset.order_by("-date_joined")

    @action(detail=True, methods=["post"])
    def ban(self, request, pk=None):
        user = self.get_object()
        if user.is_superuser:
            return Response({"detail": "Cannot ban a superuser."}, status=status.HTTP_400_BAD_REQUEST)
        user.is_banned = True
        user.is_active = False
        user.save(update_fields=["is_banned", "is_active", "updated_at"])
        notify_user(
            user=user,
            title="Account banned",
            body="Your account has been banned by platform administration.",
            event_type="ADMIN_BAN",
            actor=request.user,
        )
        return Response(self.get_serializer(user).data)

    @action(detail=True, methods=["post"])
    def unban(self, request, pk=None):
        user = self.get_object()
        user.is_banned = False
        user.is_active = True
        user.save(update_fields=["is_banned", "is_active", "updated_at"])
        notify_user(
            user=user,
            title="Account reactivated",
            body="Your account has been reactivated by platform administration.",
            event_type="ADMIN_UNBAN",
            actor=request.user,
        )
        return Response(self.get_serializer(user).data)
