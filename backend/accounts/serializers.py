import re

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from .models import CustomerProfile, ProviderProfile

User = get_user_model()

LOCATION_LABELS = {
    "makkah": "Makkah",
    "mecca": "Makkah",
    "madinah": "Madinah",
    "madina": "Madinah",
    "medina": "Madinah",
}
BLOCKED_BIO_TERMS = (
    "contact me privately",
    "contact me private",
    "contact me",
    "private contact",
    "call me",
    "dm me",
    "direct message",
    "whatsapp",
    "telegram",
    "snapchat",
    "email me",
    "outside the platform",
)
ALLOWED_CREDENTIAL_SUMMARY_FLAGS = {
    "UMRAH_BADAL_SUPPORT",
    "ZIYARAH_GUIDE_SUPPORT",
    "ELDERLY_FAMILY_SUPPORT",
    "MULTILINGUAL_ASSISTANCE",
    "ON_TIME_UPDATES",
}
ALLOWED_PROVIDER_BIO_LINES = {
    "Guided step-by-step Umrah support.",
    "Comfortable assisting families and elderly pilgrims.",
    "Committed to respectful and reliable service.",
    "Provides clear updates through Umrah Link.",
}


def validate_image_upload(file_obj):
    if not file_obj:
        return file_obj
    content_type = getattr(file_obj, "content_type", "")
    if content_type and not content_type.startswith("image/"):
        raise serializers.ValidationError("Upload a valid image file.")
    return file_obj


def resolve_file_url(request, file_field):
    if not file_field:
        return ""
    try:
        url = file_field.url
    except ValueError:
        return ""
    if request:
        return request.build_absolute_uri(url)
    return url


def normalize_provider_location(value):
    text = str(value or "").strip()
    if not text:
        return ""
    normalized = LOCATION_LABELS.get(text.lower())
    if normalized:
        return normalized
    raise serializers.ValidationError("Location must be either Makkah or Madinah.")


def normalize_base_locations(value):
    cleaned = [str(item).strip() for item in (value or []) if str(item).strip()]
    if len(cleaned) != 1:
        raise serializers.ValidationError("Choose exactly one service location: Makkah or Madinah.")
    return [normalize_provider_location(cleaned[0])]


def validate_provider_bio(value):
    text = str(value or "").strip()
    if not text:
        return ""

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return ""

    invalid_lines = [line for line in lines if line not in ALLOWED_PROVIDER_BIO_LINES]
    if invalid_lines:
        raise serializers.ValidationError("Bio must use predefined checklist options only.")

    unique_lines = list(dict.fromkeys(lines))
    normalized_text = "\n".join(unique_lines)

    if re.search(r"\d", normalized_text):
        raise serializers.ValidationError("Bio cannot include numbers.")
    lowered = normalized_text.lower()
    if any(term in lowered for term in BLOCKED_BIO_TERMS):
        raise serializers.ValidationError("Bio cannot include private-contact requests.")
    if "@" in normalized_text or "http://" in lowered or "https://" in lowered:
        raise serializers.ValidationError("Bio cannot include contact handles or links.")
    return normalized_text


def normalize_credentials_summary(value):
    text = str(value or "").strip()
    if not text:
        return ""
    flags = [item.strip() for item in text.split(",") if item.strip()]
    if not flags:
        return ""
    invalid = [flag for flag in flags if flag not in ALLOWED_CREDENTIAL_SUMMARY_FLAGS]
    if invalid:
        raise serializers.ValidationError("Credentials must use predefined checklist options only.")
    unique_flags = list(dict.fromkeys(flags))
    return ",".join(unique_flags)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "phone_number",
            "role",
            "is_banned",
            "is_active",
            "is_staff",
            "is_superuser",
        )
        read_only_fields = ("id", "role", "is_banned", "is_active", "is_staff", "is_superuser")


class ProviderProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    profile_photo = serializers.FileField(required=False, allow_null=True, write_only=True)
    profile_photo_url = serializers.SerializerMethodField()
    remove_profile_photo = serializers.BooleanField(required=False, default=False, write_only=True)

    def get_profile_photo_url(self, obj):
        request = self.context.get("request")
        return resolve_file_url(request, obj.profile_photo)

    def validate_profile_photo(self, value):
        return validate_image_upload(value)

    def validate_bio(self, value):
        return validate_provider_bio(value)

    def validate_city(self, value):
        return normalize_provider_location(value) if str(value or "").strip() else ""

    def validate_base_locations(self, value):
        return normalize_base_locations(value)

    def validate_credentials_summary(self, value):
        return normalize_credentials_summary(value)

    def validate(self, attrs):
        if attrs.get("remove_profile_photo") and attrs.get("profile_photo"):
            raise serializers.ValidationError("Use profile_photo or remove_profile_photo, not both.")
        city_provided = "city" in attrs
        locations_provided = "base_locations" in attrs
        city = attrs.get("city", "")
        locations = attrs.get("base_locations", [])

        if city and locations and city != locations[0]:
            raise serializers.ValidationError("City and base location must match.")
        if city and not locations_provided:
            attrs["base_locations"] = [city]
        if locations and (not city_provided or not city):
            attrs["city"] = locations[0]
        return attrs

    def update(self, instance, validated_data):
        remove_profile_photo = validated_data.pop("remove_profile_photo", False)
        new_profile_photo = validated_data.get("profile_photo")

        if remove_profile_photo and instance.profile_photo:
            instance.profile_photo.delete(save=False)
            instance.profile_photo = None
        elif new_profile_photo and instance.profile_photo and instance.profile_photo.name != new_profile_photo.name:
            instance.profile_photo.delete(save=False)

        return super().update(instance, validated_data)

    class Meta:
        model = ProviderProfile
        fields = (
            "id",
            "user",
            "professional_name",
            "bio",
            "city",
            "base_locations",
            "supported_languages",
            "profile_photo",
            "profile_photo_url",
            "remove_profile_photo",
            "years_experience",
            "credentials_summary",
            "is_accepting_bookings",
            "verification_status",
            "rating_average",
            "total_reviews",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "verification_status",
            "rating_average",
            "total_reviews",
            "created_at",
            "updated_at",
        )


class CustomerProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = CustomerProfile
        fields = ("id", "user", "preferred_languages", "country", "city", "created_at", "updated_at")


class BaseRegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(max_length=100, allow_blank=True, required=False)
    last_name = serializers.CharField(max_length=100, allow_blank=True, required=False)
    phone_number = serializers.CharField(max_length=30, allow_blank=True, required=False)


class CustomerRegisterSerializer(BaseRegisterSerializer):
    preferred_languages = serializers.ListField(child=serializers.CharField(max_length=64), required=False)
    country = serializers.CharField(max_length=80, allow_blank=True, required=False)
    city = serializers.CharField(max_length=80, allow_blank=True, required=False)

    @transaction.atomic
    def create(self, validated_data):
        preferred_languages = validated_data.pop("preferred_languages", [])
        country = validated_data.pop("country", "")
        city = validated_data.pop("city", "")

        user = User.objects.create_user(role=User.Role.CUSTOMER, **validated_data)
        CustomerProfile.objects.create(
            user=user,
            preferred_languages=preferred_languages,
            country=country,
            city=city,
        )
        return user


class ProviderRegisterSerializer(BaseRegisterSerializer):
    professional_name = serializers.CharField(max_length=140)
    bio = serializers.CharField(required=False, allow_blank=True)
    city = serializers.CharField(max_length=80, required=False, allow_blank=True)
    base_locations = serializers.ListField(
        child=serializers.CharField(max_length=80),
        required=True,
        allow_empty=False,
        min_length=1,
        max_length=1,
    )
    supported_languages = serializers.ListField(child=serializers.CharField(max_length=64), required=False)
    profile_photo = serializers.FileField(required=True, allow_null=False, write_only=True)
    years_experience = serializers.IntegerField(required=False, min_value=0)
    credentials_summary = serializers.CharField(required=False, allow_blank=True)

    def validate_profile_photo(self, value):
        return validate_image_upload(value)

    def validate_bio(self, value):
        return validate_provider_bio(value)

    def validate_city(self, value):
        return normalize_provider_location(value) if str(value or "").strip() else ""

    def validate_base_locations(self, value):
        return normalize_base_locations(value)

    def validate_credentials_summary(self, value):
        return normalize_credentials_summary(value)

    def validate(self, attrs):
        city = attrs.get("city", "")
        base_locations = attrs.get("base_locations", [])
        if city and base_locations and city != base_locations[0]:
            raise serializers.ValidationError("City and base location must match.")
        if not city and base_locations:
            attrs["city"] = base_locations[0]
        if city and not base_locations:
            attrs["base_locations"] = [city]
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        professional_name = validated_data.pop("professional_name")
        bio = validated_data.pop("bio", "")
        city = validated_data.pop("city", "")
        base_locations = validated_data.pop("base_locations", [])
        supported_languages = validated_data.pop("supported_languages", [])
        profile_photo = validated_data.pop("profile_photo")
        years_experience = validated_data.pop("years_experience", 0)
        credentials_summary = validated_data.pop("credentials_summary", "")

        user = User.objects.create_user(role=User.Role.PROVIDER, **validated_data)
        ProviderProfile.objects.create(
            user=user,
            professional_name=professional_name,
            bio=bio,
            city=city,
            base_locations=base_locations,
            supported_languages=supported_languages,
            profile_photo=profile_photo,
            years_experience=years_experience,
            credentials_summary=credentials_summary,
        )
        return user


class LoginSerializer(serializers.Serializer):
    username_or_email = serializers.CharField(max_length=254)
    password = serializers.CharField(write_only=True, trim_whitespace=False)
