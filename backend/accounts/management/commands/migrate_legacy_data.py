import json
import tempfile

from django.apps import apps
from django.core.management import BaseCommand, CommandError, call_command
from django.db import transaction


MODEL_LABELS = (
    "accounts.User",
    "accounts.CustomerProfile",
    "accounts.ProviderProfile",
    "accounts.ProviderPhoto",
    "marketplace.Service",
    "marketplace.ProviderAvailability",
    "marketplace.Review",
    "bookings.Booking",
    "bookings.BookingStatusEvent",
    "bookings.PaymentWebhookEvent",
    "messaging.BookingThread",
    "messaging.Message",
    "disputes.Dispute",
    "disputes.DisputeEvidence",
    "notifications.Notification",
    "notifications.NotificationDelivery",
    "payouts.ProviderPayoutProfile",
    "payouts.PayoutLedger",
    "authtoken.Token",
)


class Command(BaseCommand):
    help = "Copy the legacy production database into an empty default database once."

    def handle(self, *args, **options):
        from django.db import connections

        if "legacy" not in connections:
            raise CommandError("LEGACY_DATABASE_URL is not configured.")

        user_model = apps.get_model("accounts", "User")
        legacy_users = user_model.objects.using("legacy").count()
        if legacy_users == 0:
            raise CommandError("Legacy database is empty; refusing to import.")

        if user_model.objects.using("default").exists():
            self.stdout.write(self.style.WARNING("Target already contains users; migration skipped."))
            return

        legacy_counts = {
            label: apps.get_model(label).objects.using("legacy").count()
            for label in MODEL_LABELS
        }

        with tempfile.NamedTemporaryFile(suffix=".json") as fixture:
            call_command(
                "dumpdata",
                database="legacy",
                natural_foreign=True,
                natural_primary=True,
                exclude=(
                    "contenttypes",
                    "auth.permission",
                    "admin.logentry",
                    "sessions.session",
                ),
                indent=2,
                output=fixture.name,
                verbosity=1,
            )
            fixture.seek(0)
            payload = json.load(fixture)
            if not payload or not any(row.get("model") == "accounts.user" for row in payload):
                raise CommandError("Legacy fixture validation failed; target was not changed.")

            with transaction.atomic(using="default"):
                call_command("loaddata", fixture.name, database="default", verbosity=1)
                target_counts = {
                    label: apps.get_model(label).objects.using("default").count()
                    for label in MODEL_LABELS
                }
                mismatches = {
                    label: (legacy_counts[label], target_counts[label])
                    for label in MODEL_LABELS
                    if legacy_counts[label] != target_counts[label]
                }
                if mismatches:
                    raise CommandError(f"Imported record counts do not match: {mismatches}")

        self.stdout.write(self.style.SUCCESS(f"Migrated {legacy_users} users with verified record counts."))
