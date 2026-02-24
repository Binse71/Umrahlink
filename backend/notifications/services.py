from __future__ import annotations

from django.conf import settings
from django.core.mail import send_mail

from bookings.models import Booking

from .models import Notification, NotificationDelivery


def _map_event_type(event_type: str) -> str:
    valid_values = {choice[0] for choice in Notification.EventType.choices}
    if event_type in valid_values:
        return event_type
    return Notification.EventType.SYSTEM


def notify_user(*, user, title: str, body: str = "", event_type: str = Notification.EventType.SYSTEM, actor=None, metadata=None):
    notification = Notification.objects.create(
        user=user,
        actor=actor,
        event_type=_map_event_type(event_type),
        title=title,
        body=body,
        metadata=metadata or {},
    )

    if user.email:
        delivery = NotificationDelivery.objects.create(
            notification=notification,
            channel=NotificationDelivery.Channel.EMAIL,
            destination=user.email,
            status=NotificationDelivery.Status.PENDING,
        )
        try:
            send_mail(
                subject=title,
                message=body,
                from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@umrahlink.com"),
                recipient_list=[user.email],
                fail_silently=True,
            )
            delivery.status = NotificationDelivery.Status.SENT
            delivery.response_payload = {"provider": "django-send-mail", "simulated": False}
        except Exception as exc:  # pragma: no cover
            delivery.status = NotificationDelivery.Status.FAILED
            delivery.response_payload = {"error": str(exc)}
        delivery.save(update_fields=["status", "response_payload", "updated_at"])

    if user.phone_number:
        NotificationDelivery.objects.create(
            notification=notification,
            channel=NotificationDelivery.Channel.SMS,
            destination=user.phone_number,
            status=NotificationDelivery.Status.SENT,
            response_payload={
                "provider": "sms-simulated",
                "simulated": True,
                "message": f"SMS placeholder: {title}",
            },
        )

    return notification


def notify_booking_participants(*, booking: Booking, title: str, body: str, actor=None, metadata=None):
    event_type = Notification.EventType.BOOKING

    if "dispute" in title.lower() or "dispute" in body.lower():
        event_type = Notification.EventType.DISPUTE
    elif "message" in title.lower() or "chat" in title.lower():
        event_type = Notification.EventType.MESSAGE

    targets = [booking.customer, booking.provider.user]
    for user in targets:
        if actor and user.id == actor.id:
            continue
        notify_user(
            user=user,
            title=title,
            body=body,
            event_type=event_type,
            actor=actor,
            metadata=metadata or {"booking_id": booking.id, "booking_reference": str(booking.reference)},
        )
