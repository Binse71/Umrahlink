from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Avg, Count
from django.utils import timezone

from accounts.models import ProviderProfile


class Service(models.Model):
    class ServiceType(models.TextChoices):
        UMRAH_BADAL = "UMRAH_BADAL", "Umrah Badal"
        ZIYARAH_GUIDE = "ZIYARAH_GUIDE", "Ziyarah Guide"
        UMRAH_ASSISTANT = "UMRAH_ASSISTANT", "Umrah Assistant"

    class CityScope(models.TextChoices):
        MAKKAH = "MAKKAH", "Makkah"
        MADINAH = "MADINAH", "Madinah"

    provider = models.ForeignKey(ProviderProfile, on_delete=models.CASCADE, related_name="services")
    service_type = models.CharField(max_length=24, choices=ServiceType.choices)
    title = models.CharField(max_length=160)
    description = models.TextField()
    city_scope = models.CharField(max_length=16, choices=CityScope.choices)
    languages = models.JSONField(default=list, blank=True)
    price_amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=8, default="USD", choices=[("USD", "USD")])
    duration_hours = models.PositiveIntegerField(default=2)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.title} ({self.service_type})"

    def save(self, *args, **kwargs):
        # Currency is platform-wide and fixed to USD.
        self.currency = "USD"
        super().save(*args, **kwargs)


class Review(models.Model):
    booking = models.OneToOneField(
        "bookings.Booking",
        on_delete=models.CASCADE,
        related_name="review",
        null=True,
        blank=True,
    )
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="reviews")
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews_written")
    provider = models.ForeignKey(ProviderProfile, on_delete=models.CASCADE, related_name="reviews")
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(blank=True)
    is_public = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Review<{self.provider_id}:{self.rating}>"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.refresh_provider_metrics(self.provider_id)

    def delete(self, *args, **kwargs):
        provider_id = self.provider_id
        super().delete(*args, **kwargs)
        self.refresh_provider_metrics(provider_id)

    @staticmethod
    def refresh_provider_metrics(provider_id=None):
        target_provider_id = provider_id
        if target_provider_id is None:
            return

        aggregate = Review.objects.filter(provider_id=target_provider_id).aggregate(avg_rating=Avg("rating"), count=Count("id"))
        avg_rating = Decimal(str(aggregate["avg_rating"] or 0)).quantize(Decimal("0.01"))
        count = aggregate["count"] or 0
        ProviderProfile.objects.filter(id=target_provider_id).update(rating_average=avg_rating, total_reviews=count)


class ProviderAvailability(models.Model):
    provider = models.ForeignKey(ProviderProfile, on_delete=models.CASCADE, related_name="availability_slots")
    service_type = models.CharField(max_length=24, choices=Service.ServiceType.choices)
    city_scope = models.CharField(max_length=16, choices=Service.CityScope.choices)
    languages = models.JSONField(default=list, blank=True)
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    is_available = models.BooleanField(default=True)
    booked_by = models.OneToOneField(
        "bookings.Booking",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reserved_availability_slot",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start_at"]

    def __str__(self) -> str:
        return f"Availability<{self.provider_id}:{self.start_at.isoformat()}>"

    def clean(self):
        if self.end_at <= self.start_at:
            raise ValidationError("End time must be after start time.")
        if self.start_at < timezone.now():
            raise ValidationError("Availability start time must be in the future.")
