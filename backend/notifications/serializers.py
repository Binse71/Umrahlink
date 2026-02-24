from django.utils import timezone
from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.get_full_name", read_only=True)

    class Meta:
        model = Notification
        fields = (
            "id",
            "event_type",
            "title",
            "body",
            "metadata",
            "is_read",
            "read_at",
            "actor",
            "actor_name",
            "created_at",
        )
        read_only_fields = fields


class NotificationReadSerializer(serializers.Serializer):
    mark_read = serializers.BooleanField(default=True)

    def update(self, instance, validated_data):
        mark_read = validated_data.get("mark_read", True)
        instance.is_read = mark_read
        instance.read_at = timezone.now() if mark_read else None
        instance.save(update_fields=["is_read", "read_at"])
        return instance
