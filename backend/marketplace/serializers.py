from rest_framework import serializers

from accounts.models import ProviderProfile

from .models import ProviderAvailability, Review, Service

ALLOWED_SERVICE_CITY_SCOPES = {"MAKKAH", "MADINAH"}


class ProviderDirectorySerializer(serializers.ModelSerializer):
    languages = serializers.ListField(source="supported_languages", read_only=True)
    services_count = serializers.SerializerMethodField()
    profile_photo_url = serializers.SerializerMethodField()

    def get_services_count(self, obj):
        return obj.services.filter(is_active=True).count()

    def get_profile_photo_url(self, obj):
        request = self.context.get("request")
        if not obj.profile_photo:
            return ""
        try:
            url = obj.profile_photo.url
        except ValueError:
            return ""
        if request:
            return request.build_absolute_uri(url)
        return url

    class Meta:
        model = ProviderProfile
        fields = (
            "id",
            "professional_name",
            "bio",
            "city",
            "languages",
            "profile_photo_url",
            "years_experience",
            "rating_average",
            "total_reviews",
            "is_accepting_bookings",
            "verification_status",
            "services_count",
        )


class ServiceSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source="provider.professional_name", read_only=True)
    provider_rating = serializers.DecimalField(
        source="provider.rating_average", max_digits=3, decimal_places=2, read_only=True
    )
    provider_photo_url = serializers.SerializerMethodField()

    def get_provider_photo_url(self, obj):
        request = self.context.get("request")
        profile_photo = getattr(obj.provider, "profile_photo", None)
        if not profile_photo:
            return ""
        try:
            url = profile_photo.url
        except ValueError:
            return ""
        if request:
            return request.build_absolute_uri(url)
        return url

    def validate(self, attrs):
        attrs["currency"] = "USD"
        return attrs

    def validate_city_scope(self, value):
        scope = str(value or "").upper()
        if scope not in ALLOWED_SERVICE_CITY_SCOPES:
            raise serializers.ValidationError("Service location must be either MAKKAH or MADINAH.")
        return scope

    class Meta:
        model = Service
        fields = (
            "id",
            "provider",
            "provider_name",
            "provider_rating",
            "provider_photo_url",
            "service_type",
            "title",
            "description",
            "city_scope",
            "languages",
            "price_amount",
            "currency",
            "duration_hours",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "provider",
            "provider_name",
            "provider_rating",
            "provider_photo_url",
            "created_at",
            "updated_at",
        )


class ReviewSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.get_full_name", read_only=True)
    provider_name = serializers.CharField(source="provider.professional_name", read_only=True)

    class Meta:
        model = Review
        fields = (
            "id",
            "booking",
            "service",
            "provider",
            "provider_name",
            "customer",
            "customer_name",
            "rating",
            "comment",
            "is_public",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "provider", "provider_name", "customer", "customer_name", "created_at", "updated_at")


class ProviderAvailabilitySerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source="provider.professional_name", read_only=True)

    def validate_city_scope(self, value):
        scope = str(value or "").upper()
        if scope not in ALLOWED_SERVICE_CITY_SCOPES:
            raise serializers.ValidationError("Availability location must be either MAKKAH or MADINAH.")
        return scope

    class Meta:
        model = ProviderAvailability
        fields = (
            "id",
            "provider",
            "provider_name",
            "service_type",
            "city_scope",
            "languages",
            "start_at",
            "end_at",
            "is_available",
            "booked_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "provider", "provider_name", "booked_by", "created_at", "updated_at")
