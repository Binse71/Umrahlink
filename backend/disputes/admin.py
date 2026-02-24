from django.contrib import admin

from .models import Dispute, DisputeEvidence


@admin.register(Dispute)
class DisputeAdmin(admin.ModelAdmin):
    list_display = ("id", "booking", "opened_by", "status", "requested_resolution", "admin_decision")
    list_filter = ("status", "requested_resolution", "admin_decision")
    search_fields = ("booking__reference", "opened_by__email")


@admin.register(DisputeEvidence)
class DisputeEvidenceAdmin(admin.ModelAdmin):
    list_display = ("id", "dispute", "uploaded_by", "file_url", "file_upload", "created_at")
