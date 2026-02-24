from django.contrib import admin

from .models import Booking, BookingStatusEvent, PaymentWebhookEvent


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "reference",
        "customer",
        "provider",
        "service",
        "status",
        "escrow_status",
        "total_amount",
    )
    list_filter = ("status", "escrow_status")
    search_fields = ("reference", "customer__email", "provider__professional_name")


@admin.register(BookingStatusEvent)
class BookingStatusEventAdmin(admin.ModelAdmin):
    list_display = ("id", "booking", "from_status", "to_status", "changed_by", "created_at")
    list_filter = ("from_status", "to_status")


@admin.register(PaymentWebhookEvent)
class PaymentWebhookEventAdmin(admin.ModelAdmin):
    list_display = ("id", "booking", "event_type", "processed", "received_at")
    list_filter = ("event_type", "processed")
    search_fields = ("external_reference",)
