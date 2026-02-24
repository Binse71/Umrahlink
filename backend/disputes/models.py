from django.conf import settings
from django.db import models
from django.utils import timezone

from bookings.models import Booking


class Dispute(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
        RESOLVED = "RESOLVED", "Resolved"
        REJECTED = "REJECTED", "Rejected"

    class RequestedResolution(models.TextChoices):
        REFUND = "REFUND", "Refund"
        RELEASE = "RELEASE", "Release"
        PARTIAL = "PARTIAL", "Partial"
        OTHER = "OTHER", "Other"

    class AdminDecision(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVE_REFUND = "APPROVE_REFUND", "Approve Refund"
        APPROVE_RELEASE = "APPROVE_RELEASE", "Approve Release"
        PARTIAL_REMEDY = "PARTIAL_REMEDY", "Partial Remedy"
        REJECT_CLAIM = "REJECT_CLAIM", "Reject Claim"

    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name="dispute")
    opened_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="disputes_opened")
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.OPEN)
    requested_resolution = models.CharField(max_length=20, choices=RequestedResolution.choices)
    reason = models.TextField()

    admin_decision = models.CharField(max_length=24, choices=AdminDecision.choices, default=AdminDecision.PENDING)
    admin_note = models.TextField(blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="disputes_resolved",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Dispute<{self.booking.reference}>"

    def mark_resolved(self, decision: str, admin_user, note: str = ""):
        self.admin_decision = decision
        self.admin_note = note
        self.status = self.Status.RESOLVED if decision != self.AdminDecision.REJECT_CLAIM else self.Status.REJECTED
        self.resolved_by = admin_user
        self.resolved_at = timezone.now()
        self.save(update_fields=[
            "admin_decision",
            "admin_note",
            "status",
            "resolved_by",
            "resolved_at",
            "updated_at",
        ])


class DisputeEvidence(models.Model):
    dispute = models.ForeignKey(Dispute, on_delete=models.CASCADE, related_name="evidence_items")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="dispute_evidence")
    file_url = models.URLField(max_length=500, blank=True)
    file_upload = models.FileField(upload_to="disputes/evidence/%Y/%m/%d", blank=True, null=True)
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"DisputeEvidence<{self.dispute_id}>"
