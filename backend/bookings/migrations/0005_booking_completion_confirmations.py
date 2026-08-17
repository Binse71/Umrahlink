from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("bookings", "0004_booking_acceptance_deadline_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="booking",
            name="customer_completed_confirmed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="booking",
            name="provider_completed_confirmed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
