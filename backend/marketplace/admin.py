from django.contrib import admin

from .models import ProviderAvailability, Review, Service


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "service_type", "provider", "price_amount", "currency", "is_active")
    list_filter = ("service_type", "city_scope", "is_active")
    search_fields = ("title", "provider__professional_name")


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("id", "service", "provider", "customer", "rating", "is_public")
    list_filter = ("rating", "is_public")
    search_fields = ("service__title", "provider__professional_name", "customer__email")


@admin.register(ProviderAvailability)
class ProviderAvailabilityAdmin(admin.ModelAdmin):
    list_display = ("id", "provider", "service_type", "city_scope", "start_at", "end_at", "is_available", "booked_by")
    list_filter = ("service_type", "city_scope", "is_available")
    search_fields = ("provider__professional_name",)
