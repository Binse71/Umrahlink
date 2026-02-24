from django.contrib import admin

from .models import Notification, NotificationDelivery


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "event_type", "title", "is_read", "created_at")
    list_filter = ("event_type", "is_read")
    search_fields = ("user__username", "user__email", "title", "body")


@admin.register(NotificationDelivery)
class NotificationDeliveryAdmin(admin.ModelAdmin):
    list_display = ("id", "notification", "channel", "destination", "status", "created_at")
    list_filter = ("channel", "status")
    search_fields = ("destination", "notification__title")
