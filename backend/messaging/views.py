from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User
from notifications.services import notify_booking_participants

from .models import BookingThread, Message
from .permissions import IsThreadParticipantOrAdmin
from .serializers import BookingThreadSerializer, MessageSerializer


class BookingThreadViewSet(viewsets.ModelViewSet):
    serializer_class = BookingThreadSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = BookingThread.objects.select_related("booking", "provider", "provider__user", "customer")

        if user.is_staff or user.role == User.Role.ADMIN:
            return queryset
        if user.role == User.Role.PROVIDER:
            return queryset.filter(provider__user=user)
        return queryset.filter(customer=user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking = serializer.validated_data["booking"]

        user = request.user
        is_admin = user.is_staff or user.role == User.Role.ADMIN
        is_participant = user.id in {booking.customer_id, booking.provider.user_id}

        if not is_admin and not is_participant:
            raise PermissionDenied("You can only open thread for your own booking.")
        if not booking.can_open_chat():
            raise ValidationError("Messaging unlocks only after payment.")

        thread, created = BookingThread.objects.get_or_create(
            booking=booking,
            defaults={"customer": booking.customer, "provider": booking.provider},
        )

        response_serializer = self.get_serializer(thread)
        status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(response_serializer.data, status=status_code)

    def update(self, request, *args, **kwargs):
        thread = self.get_object()
        permission = IsThreadParticipantOrAdmin()
        if not permission.has_object_permission(request, self, thread):
            raise PermissionDenied(permission.message)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)


class MessageViewSet(viewsets.ModelViewSet):
    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = Message.objects.select_related("thread", "thread__provider", "thread__provider__user", "sender")

        if user.is_staff or user.role == User.Role.ADMIN:
            filtered = queryset
        elif user.role == User.Role.PROVIDER:
            filtered = queryset.filter(thread__provider__user=user)
        else:
            filtered = queryset.filter(thread__customer=user)

        thread_id = self.request.query_params.get("thread")
        if thread_id:
            filtered = filtered.filter(thread_id=thread_id)

        return filtered

    def perform_create(self, serializer):
        thread = serializer.validated_data["thread"]
        user = self.request.user

        is_admin = user.is_staff or user.role == User.Role.ADMIN
        is_participant = user.id in {thread.customer_id, thread.provider.user_id}

        if not is_admin and not is_participant:
            raise PermissionDenied("Only booking participants can send messages.")
        if thread.is_closed:
            raise ValidationError("Thread is closed.")
        if not thread.booking.can_open_chat():
            raise ValidationError("Messaging unlocks only after payment.")

        message = serializer.save(sender=user)
        notify_booking_participants(
            booking=thread.booking,
            title="New message",
            body=f"A new message was sent in booking {thread.booking.reference}.",
            actor=user,
            metadata={"thread_id": thread.id, "message_id": message.id},
        )

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        message = self.get_object()
        permission = IsThreadParticipantOrAdmin()
        if not permission.has_object_permission(request, self, message):
            raise PermissionDenied(permission.message)

        if message.sender_id != request.user.id and message.read_at is None:
            message.read_at = timezone.now()
            message.save(update_fields=["read_at"])

        return Response(self.get_serializer(message).data)
