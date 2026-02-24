from django.contrib import admin

from .models import BookingThread, Message


@admin.register(BookingThread)
class BookingThreadAdmin(admin.ModelAdmin):
    list_display = ("id", "booking", "customer", "provider", "is_closed", "updated_at")
    list_filter = ("is_closed",)


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "thread", "sender", "created_at", "read_at")
    search_fields = ("body", "sender__email")
