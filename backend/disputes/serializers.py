from rest_framework import serializers

from .models import Dispute, DisputeEvidence


class DisputeEvidenceSerializer(serializers.ModelSerializer):
    uploader_name = serializers.CharField(source="uploaded_by.get_full_name", read_only=True)
    resolved_file_url = serializers.SerializerMethodField()

    def get_resolved_file_url(self, obj):
        request = self.context.get("request")
        if obj.file_upload:
            if request:
                return request.build_absolute_uri(obj.file_upload.url)
            return obj.file_upload.url
        return obj.file_url

    class Meta:
        model = DisputeEvidence
        fields = ("id", "file_url", "file_upload", "resolved_file_url", "note", "uploaded_by", "uploader_name", "created_at")
        read_only_fields = ("id", "uploaded_by", "uploader_name", "created_at")


class DisputeSerializer(serializers.ModelSerializer):
    booking_reference = serializers.UUIDField(source="booking.reference", read_only=True)
    opened_by_name = serializers.CharField(source="opened_by.get_full_name", read_only=True)
    evidence_items = DisputeEvidenceSerializer(many=True, read_only=True)

    class Meta:
        model = Dispute
        fields = (
            "id",
            "booking",
            "booking_reference",
            "opened_by",
            "opened_by_name",
            "status",
            "requested_resolution",
            "reason",
            "admin_decision",
            "admin_note",
            "resolved_by",
            "resolved_at",
            "evidence_items",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "opened_by",
            "opened_by_name",
            "status",
            "admin_decision",
            "admin_note",
            "resolved_by",
            "resolved_at",
            "evidence_items",
            "created_at",
            "updated_at",
        )


class AdminDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=Dispute.AdminDecision.choices)
    note = serializers.CharField(required=False, allow_blank=True)


class EvidenceCreateSerializer(serializers.Serializer):
    file_url = serializers.URLField(max_length=500, required=False, allow_blank=True)
    file_upload = serializers.FileField(required=False)
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate(self, attrs):
        if not attrs.get("file_url") and not attrs.get("file_upload"):
            raise serializers.ValidationError("Provide file_url or file_upload.")
        return attrs
