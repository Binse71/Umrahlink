from django.db.models import Q
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.models import ProviderProfile, User
from bookings.models import Booking

from .models import ProviderAvailability, Review, Service
from .permissions import CanManageOwnService, IsProviderUser
from .serializers import ProviderAvailabilitySerializer, ProviderDirectorySerializer, ReviewSerializer, ServiceSerializer


class ProviderDirectoryViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [permissions.AllowAny]
    serializer_class = ProviderDirectorySerializer

    def get_queryset(self):
        queryset = ProviderProfile.objects.select_related("user").filter(
            verification_status=ProviderProfile.VerificationStatus.APPROVED,
            is_accepting_bookings=True,
            user__is_active=True,
            user__is_banned=False,
        )

        language = self.request.query_params.get("language")
        city = self.request.query_params.get("city")
        service_type = self.request.query_params.get("service_type")

        if language:
            queryset = queryset.filter(Q(supported_languages__icontains=language))
        if city:
            queryset = queryset.filter(Q(city__icontains=city) | Q(base_locations__icontains=city))
        if service_type:
            queryset = queryset.filter(services__service_type=service_type.upper(), services__is_active=True)

        return queryset.distinct().order_by("-rating_average", "-total_reviews")


class ServiceViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceSerializer

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [permissions.AllowAny()]
        if self.action == "create":
            return [permissions.IsAuthenticated(), IsProviderUser()]
        return [permissions.IsAuthenticated(), CanManageOwnService()]

    def get_queryset(self):
        queryset = Service.objects.select_related("provider", "provider__user")
        user = self.request.user

        if self.action == "list":
            queryset = queryset.filter(
                is_active=True,
                provider__verification_status=ProviderProfile.VerificationStatus.APPROVED,
                provider__user__is_active=True,
                provider__user__is_banned=False,
            )

        if user.is_authenticated and user.role == User.Role.PROVIDER and self.request.query_params.get("mine") == "1":
            queryset = queryset.filter(provider__user=user)

        service_type = self.request.query_params.get("service_type")
        city_scope = self.request.query_params.get("city_scope")
        language = self.request.query_params.get("language")
        max_price = self.request.query_params.get("max_price")
        provider_id = self.request.query_params.get("provider")

        if service_type:
            queryset = queryset.filter(service_type=service_type.upper())
        if city_scope:
            queryset = queryset.filter(city_scope=city_scope.upper())
        if language:
            queryset = queryset.filter(languages__icontains=language)
        if max_price:
            queryset = queryset.filter(price_amount__lte=max_price)
        if provider_id:
            queryset = queryset.filter(provider_id=provider_id)

        return queryset.order_by("price_amount")

    def perform_create(self, serializer):
        user = self.request.user
        try:
            provider_profile = user.provider_profile
        except ProviderProfile.DoesNotExist as exc:
            raise ValidationError("Provider profile not found.") from exc

        if provider_profile.verification_status != ProviderProfile.VerificationStatus.APPROVED:
            raise ValidationError("Provider must be approved before listing services.")

        serializer.save(provider=provider_profile)


class AvailabilityViewSet(viewsets.ModelViewSet):
    serializer_class = ProviderAvailabilitySerializer

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [permissions.AllowAny()]
        if self.action == "create":
            return [permissions.IsAuthenticated(), IsProviderUser()]
        return [permissions.IsAuthenticated(), CanManageOwnService()]

    def get_queryset(self):
        queryset = ProviderAvailability.objects.select_related("provider", "provider__user")
        user = self.request.user

        if self.action == "list":
            queryset = queryset.filter(
                provider__verification_status=ProviderProfile.VerificationStatus.APPROVED,
                provider__user__is_active=True,
                provider__user__is_banned=False,
            )

        if user.is_authenticated and user.role == User.Role.PROVIDER and self.request.query_params.get("mine") == "1":
            queryset = queryset.filter(provider__user=user)

        provider_id = self.request.query_params.get("provider")
        service_type = self.request.query_params.get("service_type")
        city_scope = self.request.query_params.get("city_scope")
        language = self.request.query_params.get("language")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        available_only = self.request.query_params.get("available")

        if provider_id:
            queryset = queryset.filter(provider_id=provider_id)
        if service_type:
            queryset = queryset.filter(service_type=service_type.upper())
        if city_scope:
            queryset = queryset.filter(city_scope=city_scope.upper())
        if language:
            queryset = queryset.filter(languages__icontains=language)
        if date_from:
            queryset = queryset.filter(start_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(start_at__date__lte=date_to)
        if available_only == "1":
            queryset = queryset.filter(is_available=True)

        return queryset.order_by("start_at")

    def perform_create(self, serializer):
        user = self.request.user
        try:
            provider_profile = user.provider_profile
        except ProviderProfile.DoesNotExist as exc:
            raise ValidationError("Provider profile not found.") from exc

        if provider_profile.verification_status != ProviderProfile.VerificationStatus.APPROVED:
            raise ValidationError("Provider must be approved before publishing availability.")

        serializer.save(provider=provider_profile)


class ReviewViewSet(viewsets.ModelViewSet):
    serializer_class = ReviewSerializer

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        queryset = Review.objects.select_related("customer", "provider", "service")
        user = self.request.user

        if not user.is_authenticated or (not user.is_staff and user.role != User.Role.ADMIN):
            queryset = queryset.filter(is_public=True)

        provider_id = self.request.query_params.get("provider")
        service_id = self.request.query_params.get("service")
        booking_id = self.request.query_params.get("booking")

        if provider_id:
            queryset = queryset.filter(provider_id=provider_id)
        if service_id:
            queryset = queryset.filter(service_id=service_id)
        if booking_id:
            queryset = queryset.filter(booking_id=booking_id)

        return queryset.order_by("-created_at")

    def create(self, request, *args, **kwargs):
        if request.user.role != User.Role.CUSTOMER:
            return Response({"detail": "Only customers can submit reviews."}, status=status.HTTP_403_FORBIDDEN)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        booking = serializer.validated_data.get("booking")
        service = serializer.validated_data.get("service")

        if booking is None:
            raise ValidationError("A completed booking is required to submit a review.")
        if booking.customer_id != self.request.user.id:
            raise ValidationError("You can only review your own booking.")
        if booking.status != Booking.Status.COMPLETED:
            raise ValidationError("Booking must be completed before review.")
        if booking.service_id != service.id:
            raise ValidationError("Review service must match booking service.")
        if hasattr(booking, "review"):
            raise ValidationError("A review already exists for this booking.")

        serializer.save(customer=self.request.user, provider=service.provider)
