from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase


class ProviderRegistrationValidationTests(APITestCase):
    register_url = "/api/auth/register/provider/"

    def _payload(self, **overrides):
        payload = {
            "username": "provider_user",
            "email": "provider@example.com",
            "password": "StrongPass123!",
            "first_name": "Provider",
            "last_name": "User",
            "phone_number": "",
            "professional_name": "Trusted Provider",
            "base_locations": ["Makkah"],
            "supported_languages": ["Arabic"],
            "years_experience": "2",
            "bio": "Guided step-by-step Umrah support.",
            "credentials_summary": "UMRAH_BADAL_SUPPORT",
            "profile_photo": SimpleUploadedFile("profile.jpg", b"fake-image-bytes", content_type="image/jpeg"),
        }
        payload.update(overrides)
        return payload

    def test_register_provider_rejects_bio_with_numbers(self):
        response = self.client.post(
            self.register_url,
            data=self._payload(bio="I can help 24/7"),
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("bio", response.data)

    def test_register_provider_rejects_private_contact_phrase(self):
        response = self.client.post(
            self.register_url,
            data=self._payload(bio="Please contact me privately for details."),
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("bio", response.data)

    def test_register_provider_rejects_free_text_bio(self):
        response = self.client.post(
            self.register_url,
            data=self._payload(bio="Trusted provider with calm support."),
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("bio", response.data)

    def test_register_provider_rejects_multiple_locations(self):
        response = self.client.post(
            self.register_url,
            data=self._payload(base_locations=["Makkah", "Madinah"]),
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("base_locations", response.data)

    def test_register_provider_rejects_free_text_credentials(self):
        response = self.client.post(
            self.register_url,
            data=self._payload(credentials_summary="Call me for details"),
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("credentials_summary", response.data)

    def test_register_provider_accepts_checklist_payload(self):
        response = self.client.post(
            self.register_url,
            data=self._payload(
                base_locations=["Madinah"],
                credentials_summary="UMRAH_BADAL_SUPPORT,ON_TIME_UPDATES",
            ),
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn("token", response.data)
        self.assertEqual(response.data["user"]["role"], "PROVIDER")

    def test_provider_profile_patch_rejects_private_contact_bio(self):
        register_response = self.client.post(
            self.register_url,
            data=self._payload(),
            format="multipart",
        )
        self.assertEqual(register_response.status_code, 201)
        token = register_response.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")

        patch_response = self.client.patch(
            "/api/auth/provider/profile/",
            data={"bio": "DM me privately please"},
            format="json",
        )

        self.assertEqual(patch_response.status_code, 400)
        self.assertIn("bio", patch_response.data)
