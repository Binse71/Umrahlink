from rest_framework import serializers

from .models import Booking, BookingStatusEvent, PaymentWebhookEvent


class BookingSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source="provider.professional_name", read_only=True)
    service_title = serializers.CharField(source="service.title", read_only=True)
    service_currency = serializers.CharField(source="service.currency", read_only=True)
    customer_name = serializers.CharField(source="customer.get_full_name", read_only=True)
    availability_start_at = serializers.DateTimeField(source="availability_slot.start_at", read_only=True)
    availability_end_at = serializers.DateTimeField(source="availability_slot.end_at", read_only=True)

    class Meta:
        model = Booking
        fields = (
            "id",
            "reference",
            "customer",
            "customer_name",
            "provider",
            "provider_name",
            "service",
            "service_title",
            "service_currency",
            "availability_slot",
            "availability_start_at",
            "availability_end_at",
            "requested_language",
            "travel_date",
            "notes",
            "status",
            "escrow_status",
            "subtotal_amount",
            "platform_fee",
            "total_amount",
            "payment_reference",
            "cancellation_reason",
            "completed_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "reference",
            "customer",
            "customer_name",
            "provider",
            "provider_name",
            "service_title",
            "status",
            "escrow_status",
            "subtotal_amount",
            "platform_fee",
            "total_amount",
            "completed_at",
            "created_at",
            "updated_at",
        )


class BookingStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Booking.Status.choices)
    note = serializers.CharField(max_length=255, allow_blank=True, required=False)


class BookingCancellationSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500, allow_blank=True, required=False)


class BookingStatusEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = BookingStatusEvent
        fields = ("id", "from_status", "to_status", "note", "changed_by", "created_at")


class PaymentWebhookSerializer(serializers.Serializer):
    event_type = serializers.ChoiceField(choices=PaymentWebhookEvent.EventType.choices)
    booking_id = serializers.IntegerField(required=False)
    booking_reference = serializers.UUIDField(required=False)
    payment_reference = serializers.CharField(max_length=140, required=False, allow_blank=True)
    payload = serializers.JSONField(required=False)

    def validate(self, attrs):
        if "booking_id" not in attrs and "booking_reference" not in attrs:
            raise serializers.ValidationError("Provide booking_id or booking_reference.")
        return attrs
