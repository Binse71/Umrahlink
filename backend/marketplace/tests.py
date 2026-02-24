from datetime import timedelta

from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from accounts.models import ProviderProfile, User


class ProviderLocationScopeValidationTests(APITestCase):
    services_url = "/api/marketplace/services/"
    availability_url = "/api/marketplace/availability/"

    def setUp(self):
        self.user = User.objects.create_user(
            username="approved_provider",
            email="approved-provider@example.com",
            password="StrongPass123!",
            role=User.Role.PROVIDER,
        )
        self.profile = ProviderProfile.objects.create(
            user=self.user,
            professional_name="Approved Provider",
            city="Makkah",
            base_locations=["Makkah"],
            supported_languages=["Arabic"],
            years_experience=3,
            verification_status=ProviderProfile.VerificationStatus.APPROVED,
            is_accepting_bookings=True,
        )
        token, _ = Token.objects.get_or_create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    def test_create_service_rejects_remote_city_scope(self):
        response = self.client.post(
            self.services_url,
            data={
                "service_type": "UMRAH_BADAL",
                "title": "Remote Support",
                "description": "Not allowed anymore",
                "city_scope": "REMOTE",
                "languages": ["Arabic"],
                "price_amount": "120.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("city_scope", response.data)

    def test_create_service_accepts_single_city_scope(self):
        response = self.client.post(
            self.services_url,
            data={
                "service_type": "UMRAH_BADAL",
                "title": "Makkah Service",
                "description": "Allowed scope",
                "city_scope": "MAKKAH",
                "languages": ["Arabic"],
                "price_amount": "150.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["city_scope"], "MAKKAH")

    def test_create_availability_rejects_both_city_scope(self):
        start_at = timezone.now() + timedelta(days=1)
        end_at = start_at + timedelta(hours=2)
        response = self.client.post(
            self.availability_url,
            data={
                "service_type": "UMRAH_BADAL",
                "city_scope": "BOTH",
                "languages": ["Arabic"],
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "is_available": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("city_scope", response.data)

