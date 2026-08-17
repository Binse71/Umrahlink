from .models import ProviderPhoto


def get_provider_photo(*, provider_profile_id: int):
    return ProviderPhoto.objects.filter(provider_profile_id=provider_profile_id).first()


def upsert_provider_photo(*, provider_profile_id: int, content: bytes, content_type: str):
    photo, _ = ProviderPhoto.objects.update_or_create(
        provider_profile_id=provider_profile_id,
        defaults={
            "content": content,
            "content_type": content_type or "application/octet-stream",
        },
    )
    return photo


def delete_provider_photo(*, provider_profile_id: int):
    ProviderPhoto.objects.filter(provider_profile_id=provider_profile_id).delete()
