from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User
from bookings.models import Booking
from notifications.services import notify_booking_participants

from .models import Dispute, DisputeEvidence
from .permissions import IsDisputeParticipantOrAdmin
from .serializers import AdminDecisionSerializer, DisputeSerializer, DisputeEvidenceSerializer, EvidenceCreateSerializer


class DisputeViewSet(viewsets.ModelViewSet):
    serializer_class = DisputeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = Dispute.objects.select_related("booking", "booking__provider", "booking__provider__user", "opened_by")

        if user.is_staff or user.role == User.Role.ADMIN:
            return queryset
        if user.role == User.Role.PROVIDER:
            return queryset.filter(booking__provider__user=user)
        return queryset.filter(booking__customer=user)

    def perform_create(self, serializer):
        booking = serializer.validated_data["booking"]
        user = self.request.user

        if user.id not in {booking.customer_id, booking.provider.user_id}:
            raise PermissionDenied("Only booking participants can open a dispute.")
        if booking.status == Booking.Status.REQUESTED:
            raise ValidationError("Dispute cannot be opened before the booking is accepted.")
        if hasattr(booking, "dispute"):
            raise ValidationError("A dispute is already open for this booking.")

        dispute = serializer.save(opened_by=user)
        notify_booking_participants(
            booking=booking,
            title="Dispute opened",
            body=f"A dispute was opened for booking {booking.reference}.",
            actor=user,
        )
        return dispute

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser, JSONParser])
    def add_evidence(self, request, pk=None):
        dispute = self.get_object()
        permission = IsDisputeParticipantOrAdmin()
        if not permission.has_object_permission(request, self, dispute):
            raise PermissionDenied(permission.message)

        serializer = EvidenceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        evidence = DisputeEvidence.objects.create(
            dispute=dispute,
            uploaded_by=request.user,
            file_url=serializer.validated_data.get("file_url", ""),
            file_upload=serializer.validated_data.get("file_upload"),
            note=serializer.validated_data.get("note", ""),
        )

        notify_booking_participants(
            booking=dispute.booking,
            title="Dispute evidence added",
            body=f"New evidence was added to dispute #{dispute.id}.",
            actor=request.user,
        )
        return Response(DisputeEvidenceSerializer(evidence, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def move_to_review(self, request, pk=None):
        dispute = self.get_object()

        if not (request.user.is_staff or request.user.role == User.Role.ADMIN):
            raise PermissionDenied("Only platform admins can review disputes.")

        dispute.status = Dispute.Status.UNDER_REVIEW
        dispute.save(update_fields=["status", "updated_at"])
        notify_booking_participants(
            booking=dispute.booking,
            title="Dispute under review",
            body=f"Dispute #{dispute.id} is now under admin review.",
            actor=request.user,
        )
        return Response(self.get_serializer(dispute).data)

    @action(detail=True, methods=["post"])
    def admin_decision(self, request, pk=None):
        dispute = self.get_object()
        booking = dispute.booking

        if not (request.user.is_staff or request.user.role == User.Role.ADMIN):
            raise PermissionDenied("Only platform admins can decide disputes.")

        serializer = AdminDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        decision = serializer.validated_data["decision"]
        note = serializer.validated_data.get("note", "")

        if decision == Dispute.AdminDecision.APPROVE_REFUND:
            booking.escrow_status = Booking.EscrowStatus.REFUNDED
            if booking.status != Booking.Status.COMPLETED:
                booking.status = Booking.Status.CANCELLED
            booking.save(update_fields=["escrow_status", "status", "updated_at"])

        if decision == Dispute.AdminDecision.APPROVE_RELEASE:
            booking.escrow_status = Booking.EscrowStatus.RELEASED
            booking.save(update_fields=["escrow_status", "updated_at"])

        dispute.mark_resolved(decision=decision, admin_user=request.user, note=note)
        notify_booking_participants(
            booking=booking,
            title="Dispute resolved",
            body=f"Dispute #{dispute.id} has been resolved with decision {decision}.",
            actor=request.user,
        )

        return Response(self.get_serializer(dispute).data)
