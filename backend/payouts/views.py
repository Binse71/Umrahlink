from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import ProviderProfile, User
from bookings.models import Booking

from .models import PayoutLedger, ProviderPayoutProfile
from .permissions import IsPlatformAdmin
from .serializers import PayoutActionSerializer, PayoutLedgerSerializer, ProviderPayoutProfileSerializer
from .services import sync_payout_ledger_for_booking


class ProviderPayoutProfileMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != User.Role.PROVIDER:
            return Response({"detail": "Only providers can access this endpoint."}, status=status.HTTP_403_FORBIDDEN)

        profile = getattr(request.user, "provider_profile", None)
        if profile is None:
            return Response({"detail": "Provider profile not found."}, status=status.HTTP_404_NOT_FOUND)

        payout_profile = ProviderPayoutProfile.objects.filter(provider=profile).first()
        if payout_profile is None:
            return Response({"detail": "Payout profile not configured yet."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ProviderPayoutProfileSerializer(payout_profile).data)

    def patch(self, request):
        if request.user.role != User.Role.PROVIDER:
            return Response({"detail": "Only providers can access this endpoint."}, status=status.HTTP_403_FORBIDDEN)

        provider = getattr(request.user, "provider_profile", None)
        if provider is None:
            return Response({"detail": "Provider profile not found."}, status=status.HTTP_404_NOT_FOUND)

        payout_profile, _ = ProviderPayoutProfile.objects.get_or_create(
            provider=provider,
            defaults={"method": ProviderPayoutProfile.Method.SAUDI_BANK},
        )
        serializer = ProviderPayoutProfileSerializer(payout_profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(provider=provider)
        return Response(serializer.data)


class PayoutLedgerViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = PayoutLedgerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = PayoutLedger.objects.select_related(
            "provider",
            "provider__user",
            "booking",
            "approved_by",
            "paid_by",
        )
        user = self.request.user

        if user.is_staff or user.role == User.Role.ADMIN:
            scoped = queryset
        elif user.role == User.Role.PROVIDER:
            scoped = queryset.filter(provider__user=user)
        else:
            scoped = queryset.none()

        status_filter = self.request.query_params.get("status")
        if status_filter:
            scoped = scoped.filter(status=status_filter.upper())

        provider_id = self.request.query_params.get("provider")
        if provider_id and (user.is_staff or user.role == User.Role.ADMIN):
            scoped = scoped.filter(provider_id=provider_id)

        return scoped.order_by("-created_at")

    @action(detail=False, methods=["post"], permission_classes=[IsAuthenticated, IsPlatformAdmin])
    def sync_from_bookings(self, request):
        booking_ids = request.data.get("booking_ids") or []
        if not isinstance(booking_ids, list) or not booking_ids:
            raise ValidationError("Provide non-empty booking_ids array.")

        synced = 0
        for booking in Booking.objects.select_related("provider", "provider__user").filter(id__in=booking_ids):
            sync_payout_ledger_for_booking(booking=booking, actor=request.user)
            synced += 1

        return Response({"detail": "Payout sync completed.", "synced": synced})

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsPlatformAdmin])
    def approve(self, request, pk=None):
        payout = self.get_object()
        serializer = PayoutActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = serializer.validated_data.get("admin_note", "")

        if payout.status not in {PayoutLedger.Status.PENDING, PayoutLedger.Status.FAILED}:
            raise ValidationError("Only pending or failed payouts can be approved.")

        payout.status = PayoutLedger.Status.APPROVED
        payout.admin_note = note
        payout.approved_by = request.user
        payout.approved_at = timezone.now()
        payout.save(update_fields=["status", "admin_note", "approved_by", "approved_at", "updated_at"])
        return Response(self.get_serializer(payout).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsPlatformAdmin])
    def mark_paid(self, request, pk=None):
        payout = self.get_object()
        serializer = PayoutActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = serializer.validated_data.get("admin_note", "")

        if payout.status != PayoutLedger.Status.APPROVED:
            raise ValidationError("Only approved payouts can be marked as paid.")

        payout.status = PayoutLedger.Status.PAID
        payout.admin_note = note
        payout.payout_date = timezone.now()
        payout.paid_by = request.user
        payout.paid_at = timezone.now()
        payout.save(update_fields=["status", "admin_note", "payout_date", "paid_by", "paid_at", "updated_at"])
        return Response(self.get_serializer(payout).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsPlatformAdmin])
    def mark_failed(self, request, pk=None):
        payout = self.get_object()
        serializer = PayoutActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = serializer.validated_data.get("admin_note", "")

        if payout.status == PayoutLedger.Status.PAID:
            raise ValidationError("Paid payouts cannot be marked as failed.")

        payout.status = PayoutLedger.Status.FAILED
        payout.admin_note = note
        payout.save(update_fields=["status", "admin_note", "updated_at"])
        return Response(self.get_serializer(payout).data)


class AdminProviderPayoutProfilesViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]
    serializer_class = ProviderPayoutProfileSerializer

    def get_queryset(self):
        queryset = ProviderPayoutProfile.objects.select_related("provider", "provider__user")
        method = self.request.query_params.get("method")
        if method:
            queryset = queryset.filter(method=method.upper())

        query = self.request.query_params.get("query")
        if query:
            queryset = queryset.filter(
                Q(provider__professional_name__icontains=query)
                | Q(provider__user__username__icontains=query)
                | Q(provider__user__email__icontains=query)
            )
        return queryset.order_by("-updated_at")
