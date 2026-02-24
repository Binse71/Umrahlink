from rest_framework import serializers

from .models import BookingThread, Message


class BookingThreadSerializer(serializers.ModelSerializer):
    booking_reference = serializers.UUIDField(source="booking.reference", read_only=True)
    provider_name = serializers.CharField(source="provider.professional_name", read_only=True)

    class Meta:
        model = BookingThread
        fields = (
            "id",
            "booking",
            "booking_reference",
            "customer",
            "provider",
            "provider_name",
            "is_closed",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "booking_reference",
            "customer",
            "provider",
            "provider_name",
            "created_at",
            "updated_at",
        )


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.get_full_name", read_only=True)

    class Meta:
        model = Message
        fields = ("id", "thread", "sender", "sender_name", "body", "read_at", "created_at")
        read_only_fields = ("id", "sender", "sender_name", "read_at", "created_at")
