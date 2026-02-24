from django.conf import settings
from django.db import models


class Notification(models.Model):
    class EventType(models.TextChoices):
        BOOKING = "BOOKING", "Booking"
        DISPUTE = "DISPUTE", "Dispute"
        MESSAGE = "MESSAGE", "Message"
        SYSTEM = "SYSTEM", "System"
        ADMIN_APPROVAL = "ADMIN_APPROVAL", "Admin Approval"
        ADMIN_REJECTION = "ADMIN_REJECTION", "Admin Rejection"
        ADMIN_BAN = "ADMIN_BAN", "Admin Ban"
        ADMIN_UNBAN = "ADMIN_UNBAN", "Admin Unban"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications_triggered",
    )
    event_type = models.CharField(max_length=40, choices=EventType.choices, default=EventType.SYSTEM)
    title = models.CharField(max_length=180)
    body = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Notification<{self.user_id}:{self.title}>"


class NotificationDelivery(models.Model):
    class Channel(models.TextChoices):
        EMAIL = "EMAIL", "Email"
        SMS = "SMS", "SMS"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SENT = "SENT", "Sent"
        FAILED = "FAILED", "Failed"

    notification = models.ForeignKey(Notification, on_delete=models.CASCADE, related_name="deliveries")
    channel = models.CharField(max_length=10, choices=Channel.choices)
    destination = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    provider_reference = models.CharField(max_length=120, blank=True)
    response_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"NotificationDelivery<{self.notification_id}:{self.channel}:{self.status}>"
