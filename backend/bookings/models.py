import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from accounts.models import ProviderProfile, User
from marketplace.models import Service


class Booking(models.Model):
    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    class EscrowStatus(models.TextChoices):
        UNPAID = "UNPAID", "Unpaid"
        PAID = "PAID", "Paid"
        HELD = "HELD", "Held"
        RELEASED = "RELEASED", "Released"
        FAILED = "FAILED", "Failed"
        REFUNDED = "REFUNDED", "Refunded"

    reference = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bookings")
    provider = models.ForeignKey(ProviderProfile, on_delete=models.CASCADE, related_name="bookings")
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="bookings")
    availability_slot = models.ForeignKey(
        "marketplace.ProviderAvailability",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bookings",
    )
    requested_language = models.CharField(max_length=64, blank=True)
    travel_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.REQUESTED)
    escrow_status = models.CharField(max_length=20, choices=EscrowStatus.choices, default=EscrowStatus.UNPAID)

    subtotal_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    platform_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    payment_reference = models.CharField(max_length=120, blank=True)
    cancellation_reason = models.TextField(blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bookings_cancelled",
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Booking<{self.reference}>"

    def clean(self):
        if self.customer.role != User.Role.CUSTOMER:
            raise ValidationError("Only customers can create bookings.")
        if self.provider.user.role != User.Role.PROVIDER:
            raise ValidationError("Booking provider must have provider role.")
        if self.service.provider_id != self.provider_id:
            raise ValidationError("Booking service must belong to selected provider.")
        if self.availability_slot_id:
            if self.availability_slot.provider_id != self.provider_id:
                raise ValidationError("Availability slot provider must match booking provider.")
            if self.availability_slot.service_type != self.service.service_type:
                raise ValidationError("Availability slot service type must match booking service.")

    def save(self, *args, **kwargs):
        if self.service_id and not self.provider_id:
            self.provider = self.service.provider

        if self.availability_slot_id and not self.travel_date:
            self.travel_date = self.availability_slot.start_at.date()

        if not self.subtotal_amount or self.subtotal_amount == Decimal("0"):
            self.subtotal_amount = self.service.price_amount
        if not self.platform_fee or self.platform_fee == Decimal("0"):
            self.platform_fee = (self.subtotal_amount * Decimal("0.08")).quantize(Decimal("0.01"))
        if not self.total_amount or self.total_amount == Decimal("0"):
            self.total_amount = (self.subtotal_amount + self.platform_fee).quantize(Decimal("0.01"))

        if self.status == self.Status.COMPLETED and not self.completed_at:
            self.completed_at = timezone.now()

        super().save(*args, **kwargs)

    def can_open_chat(self) -> bool:
        valid_escrow = self.escrow_status in {
            self.EscrowStatus.PAID,
            self.EscrowStatus.HELD,
            self.EscrowStatus.RELEASED,
        }
        not_cancelled = self.status not in {
            self.Status.REJECTED,
            self.Status.CANCELLED,
        }
        return valid_escrow and not_cancelled

    def reserve_availability_slot(self):
        if not self.availability_slot_id:
            return
        slot = self.availability_slot
        if slot.is_available and slot.booked_by_id in {None, self.id}:
            slot.is_available = False
            slot.booked_by = self
            slot.save(update_fields=["is_available", "booked_by", "updated_at"])

    def release_availability_slot(self):
        if not self.availability_slot_id:
            return
        slot = self.availability_slot
        if slot.booked_by_id == self.id:
            slot.is_available = True
            slot.booked_by = None
            slot.save(update_fields=["is_available", "booked_by", "updated_at"])


class BookingStatusEvent(models.Model):
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="status_events")
    from_status = models.CharField(max_length=20, choices=Booking.Status.choices)
    to_status = models.CharField(max_length=20, choices=Booking.Status.choices)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class PaymentWebhookEvent(models.Model):
    class EventType(models.TextChoices):
        PAYMENT_SUCCEEDED = "PAYMENT_SUCCEEDED", "Payment Succeeded"
        PAYMENT_FAILED = "PAYMENT_FAILED", "Payment Failed"
        PAYMENT_REFUNDED = "PAYMENT_REFUNDED", "Payment Refunded"

    booking = models.ForeignKey(Booking, on_delete=models.SET_NULL, null=True, blank=True, related_name="payment_events")
    external_reference = models.CharField(max_length=140, blank=True)
    event_type = models.CharField(max_length=30, choices=EventType.choices)
    payload = models.JSONField(default=dict, blank=True)
    processed = models.BooleanField(default=False)
    received_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-received_at"]
