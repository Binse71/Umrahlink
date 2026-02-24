from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from accounts.models import ProviderProfile
from bookings.models import Booking


class BookingThread(models.Model):
    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name="thread")
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="threads_as_customer")
    provider = models.ForeignKey(ProviderProfile, on_delete=models.CASCADE, related_name="threads_as_provider")
    is_closed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def clean(self):
        if self.booking.customer_id != self.customer_id:
            raise ValidationError("Thread customer must match booking customer.")
        if self.booking.provider_id != self.provider_id:
            raise ValidationError("Thread provider must match booking provider.")
        if not self.booking.can_open_chat():
            raise ValidationError("Messaging unlocks only after payment.")

    def __str__(self):
        return f"Thread<{self.booking.reference}>"


class Message(models.Model):
    thread = models.ForeignKey(BookingThread, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="messages_sent")
    body = models.TextField()
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def clean(self):
        participants = {self.thread.customer_id, self.thread.provider.user_id}
        if self.sender_id not in participants:
            raise ValidationError("Only booking participants can send messages.")
        if self.thread.is_closed:
            raise ValidationError("Thread is closed.")
        if not self.thread.booking.can_open_chat():
            raise ValidationError("Messaging is not available for this booking.")

    def __str__(self):
        return f"Message<{self.thread_id}:{self.sender_id}>"
