from typing import Any, Optional
from decimal import Decimal
from datetime import timedelta

from django.conf import settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from notifications.services import notify_booking_participants
from payouts.services import sync_payout_ledger_for_booking

from .models import PLATFORM_FEE_RATE, Booking, BookingStatusEvent, PaymentWebhookEvent
from .permissions import IsBookingParticipantOrAdmin, IsCustomerUser
from .serializers import (
    BookingCancellationSerializer,
    BookingSerializer,
    BookingStatusEventSerializer,
    BookingStatusUpdateSerializer,
    PaymentWebhookEventSerializer,
    PaymentWebhookSerializer,
)
from .stripe_gateway import (
    StripeAPIError,
    StripeConfigurationError,
    StripeSignatureError,
    construct_event,
    create_checkout_session,
    retrieve_checkout_session,
)

ALLOWED_PAYMENT_METHODS = {"CARD", "APPLE_PAY"}
AUTO_CANCELLATION_NOTE = "Provider did not accept within 24 hours."


def expire_requested_bookings(queryset=None):
    now = timezone.now()
    base_queryset = queryset if queryset is not None else Booking.objects.all()
    expired = (
        base_queryset.filter(
            status=Booking.Status.REQUESTED,
            acceptance_deadline_at__isnull=False,
            acceptance_deadline_at__lte=now,
        )
        .select_related("customer", "provider", "provider__user", "service")
    )

    for booking in expired:
        update_fields = ["status", "cancellation_reason", "cancelled_by", "updated_at"]
        booking.status = Booking.Status.CANCELLED
        booking.cancellation_reason = AUTO_CANCELLATION_NOTE
        booking.cancelled_by = None
        if booking.acceptance_deadline_at is not None:
            booking.acceptance_deadline_at = None
            update_fields.append("acceptance_deadline_at")
        if booking.provider_completed_confirmed_at is not None:
            booking.provider_completed_confirmed_at = None
            update_fields.append("provider_completed_confirmed_at")
        if booking.customer_completed_confirmed_at is not None:
            booking.customer_completed_confirmed_at = None
            update_fields.append("customer_completed_confirmed_at")
        if booking.escrow_status in {Booking.EscrowStatus.PAID, Booking.EscrowStatus.HELD}:
            booking.escrow_status = Booking.EscrowStatus.REFUNDED
            update_fields.append("escrow_status")
        booking.save(update_fields=list(dict.fromkeys(update_fields)))
        booking.release_availability_slot()

        BookingStatusEvent.objects.create(
            booking=booking,
            from_status=Booking.Status.REQUESTED,
            to_status=Booking.Status.CANCELLED,
            changed_by=None,
            note=AUTO_CANCELLATION_NOTE,
        )
        notify_booking_participants(
            booking=booking,
            title="Booking auto-cancelled",
            body=f"Booking {booking.reference} was auto-cancelled because the provider did not accept in 24 hours.",
            actor=None,
        )


def normalize_payment_method(value: Any) -> str:
    method = str(value or "CARD").strip().upper()
    if method not in ALLOWED_PAYMENT_METHODS:
        raise ValidationError(
            {
                "payment_method": (
                    "Invalid payment method. Use CARD or APPLE_PAY."
                )
            }
        )
    return method


def map_stripe_session_to_event(*, payment_status: str, session_status: str) -> Optional[str]:
    normalized_payment = payment_status.strip().upper()
    normalized_session = session_status.strip().upper()

    if normalized_payment in {"PAID", "NO_PAYMENT_REQUIRED"}:
        return PaymentWebhookEvent.EventType.PAYMENT_SUCCEEDED
    if normalized_session == "EXPIRED":
        return PaymentWebhookEvent.EventType.PAYMENT_FAILED
    return None


def map_stripe_webhook_type_to_event(event_type: str) -> Optional[str]:
    normalized = str(event_type or "").strip().lower()
    if normalized in {"checkout.session.completed", "checkout.session.async_payment_succeeded"}:
        return PaymentWebhookEvent.EventType.PAYMENT_SUCCEEDED
    if normalized in {"checkout.session.async_payment_failed", "payment_intent.payment_failed"}:
        return PaymentWebhookEvent.EventType.PAYMENT_FAILED
    if normalized in {"charge.refunded", "charge.refund.updated"}:
        return PaymentWebhookEvent.EventType.PAYMENT_REFUNDED
    return None


def resolve_booking_for_payment(*, booking_reference: str = "", external_reference: str = "") -> Optional[Booking]:
    booking = None
    if booking_reference:
        booking = Booking.objects.filter(reference=booking_reference).first()
    if not booking and external_reference:
        booking = Booking.objects.filter(payment_reference=external_reference).first()
    return booking


def resolve_booking_from_stripe_object(stripe_object: dict[str, Any]) -> Optional[Booking]:
    metadata = stripe_object.get("metadata") if isinstance(stripe_object.get("metadata"), dict) else {}
    booking_id = str(metadata.get("booking_id") or "").strip()
    if booking_id.isdigit():
        booking = Booking.objects.filter(id=int(booking_id)).first()
        if booking:
            return booking

    booking_reference = str(
        metadata.get("booking_reference")
        or stripe_object.get("client_reference_id")
        or ""
    ).strip()
    if booking_reference:
        booking = Booking.objects.filter(reference=booking_reference).first()
        if booking:
            return booking

    external_candidates = [
        stripe_object.get("id"),
        stripe_object.get("checkout_session"),
        stripe_object.get("payment_intent"),
        stripe_object.get("latest_charge"),
    ]
    for candidate in external_candidates:
        external_reference = str(candidate or "").strip()
        if not external_reference:
            continue
        booking = Booking.objects.filter(payment_reference=external_reference).first()
        if booking:
            return booking
    return None


def apply_payment_event_to_booking(*, booking: Booking, event_type: str, payment_reference: str = "", actor=None):
    update_fields = ["updated_at"]

    if (
        payment_reference
        and event_type != PaymentWebhookEvent.EventType.PAYMENT_REFUNDED
        and booking.payment_reference != payment_reference
    ):
        booking.payment_reference = payment_reference
        update_fields.append("payment_reference")

    if event_type == PaymentWebhookEvent.EventType.PAYMENT_SUCCEEDED:
        if booking.status in {Booking.Status.CANCELLED, Booking.Status.REJECTED}:
            if booking.escrow_status != Booking.EscrowStatus.REFUNDED:
                booking.escrow_status = Booking.EscrowStatus.REFUNDED
                update_fields.append("escrow_status")
            notify_booking_participants(
                booking=booking,
                title="Payment captured on closed booking",
                body=f"Payment was received for closed booking {booking.reference} and marked for refund.",
                actor=actor,
            )
            booking.save(update_fields=list(dict.fromkeys(update_fields)))
            return
        if booking.escrow_status != Booking.EscrowStatus.HELD:
            booking.escrow_status = Booking.EscrowStatus.HELD
            update_fields.append("escrow_status")
        if booking.status == Booking.Status.REQUESTED and not booking.acceptance_deadline_at:
            booking.acceptance_deadline_at = timezone.now() + timedelta(hours=24)
            update_fields.append("acceptance_deadline_at")
        notify_booking_participants(
            booking=booking,
            title="Payment succeeded",
            body=f"Payment received for booking {booking.reference}.",
            actor=actor,
        )

    elif event_type == PaymentWebhookEvent.EventType.PAYMENT_FAILED:
        if booking.escrow_status not in {
            Booking.EscrowStatus.HELD,
            Booking.EscrowStatus.RELEASED,
            Booking.EscrowStatus.REFUNDED,
        }:
            booking.escrow_status = Booking.EscrowStatus.FAILED
            update_fields.append("escrow_status")
        notify_booking_participants(
            booking=booking,
            title="Payment failed",
            body=f"Payment failed for booking {booking.reference}.",
            actor=actor,
        )

    elif event_type == PaymentWebhookEvent.EventType.PAYMENT_REFUNDED:
        if booking.escrow_status != Booking.EscrowStatus.REFUNDED:
            booking.escrow_status = Booking.EscrowStatus.REFUNDED
            update_fields.append("escrow_status")
        if booking.status not in {Booking.Status.COMPLETED, Booking.Status.CANCELLED}:
            booking.status = Booking.Status.CANCELLED
            update_fields.append("status")
        if booking.acceptance_deadline_at is not None:
            booking.acceptance_deadline_at = None
            update_fields.append("acceptance_deadline_at")
        if booking.provider_completed_confirmed_at is not None:
            booking.provider_completed_confirmed_at = None
            update_fields.append("provider_completed_confirmed_at")
        if booking.customer_completed_confirmed_at is not None:
            booking.customer_completed_confirmed_at = None
            update_fields.append("customer_completed_confirmed_at")
        if booking.cancellation_reason != "Payment refunded":
            booking.cancellation_reason = "Payment refunded"
            update_fields.append("cancellation_reason")
        booking.release_availability_slot()
        notify_booking_participants(
            booking=booking,
            title="Payment refunded",
            body=f"Payment refunded for booking {booking.reference}.",
            actor=actor,
        )

    booking.save(update_fields=list(dict.fromkeys(update_fields)))
    sync_payout_ledger_for_booking(booking=booking, actor=actor)


def process_stripe_session(*, session_id: str, booking_reference: str = "", actor=None):
    if not session_id:
        raise ValidationError("Stripe session id is required.")

    session_payload = retrieve_checkout_session(session_id=session_id)
    payment_status = str(session_payload.get("payment_status") or "").upper()
    session_status = str(session_payload.get("status") or "").upper()
    event_type = map_stripe_session_to_event(payment_status=payment_status, session_status=session_status)

    booking = resolve_booking_for_payment(
        booking_reference=booking_reference,
        external_reference=session_id,
    )

    if not booking:
        booking = resolve_booking_from_stripe_object(session_payload)

    if booking and booking.payment_reference != session_id:
        booking.payment_reference = session_id
        booking.save(update_fields=["payment_reference", "updated_at"])

    if booking:
        expire_requested_bookings(Booking.objects.filter(id=booking.id))
        booking.refresh_from_db()

    if booking and event_type:
        event = PaymentWebhookEvent.objects.create(
            booking=booking,
            external_reference=session_id,
            event_type=event_type,
            payload=session_payload,
            processed=False,
        )
        apply_payment_event_to_booking(
            booking=booking,
            event_type=event_type,
            payment_reference=session_id,
            actor=actor,
        )
        event.processed = True
        event.processed_at = timezone.now()
        event.save(update_fields=["processed", "processed_at"])

    return {
        "booking": booking,
        "payment_status": payment_status or "UNKNOWN",
        "session_status": session_status or "UNKNOWN",
        "event_type": event_type,
        "payload": session_payload,
    }


class BookingViewSet(viewsets.ModelViewSet):
    serializer_class = BookingSerializer

    def get_permissions(self):
        if self.action == "create":
            return [IsAuthenticated(), IsCustomerUser()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        queryset = Booking.objects.select_related("customer", "provider", "provider__user", "service", "availability_slot")

        if user.is_staff or user.role == User.Role.ADMIN:
            scoped_queryset = queryset
        elif user.role == User.Role.PROVIDER:
            scoped_queryset = queryset.filter(provider__user=user)
        else:
            scoped_queryset = queryset.filter(customer=user)

        expire_requested_bookings(scoped_queryset)
        return scoped_queryset

    def perform_create(self, serializer):
        service = serializer.validated_data["service"]
        availability_slot = serializer.validated_data.get("availability_slot")

        if not service.is_active:
            raise ValidationError("Service is inactive.")
        if service.provider.verification_status != service.provider.VerificationStatus.APPROVED:
            raise ValidationError("Provider is not approved.")
        if not service.provider.is_accepting_bookings:
            raise ValidationError("Provider is not accepting bookings right now.")
        if availability_slot:
            if availability_slot.provider_id != service.provider_id:
                raise ValidationError("Availability slot does not belong to this provider.")
            if availability_slot.service_type != service.service_type:
                raise ValidationError("Availability slot service type does not match selected service.")
            if not availability_slot.is_available:
                raise ValidationError("Availability slot is already booked.")
            if availability_slot.start_at.date() < timezone.now().date():
                raise ValidationError("Availability slot must be in the future.")

        booking = serializer.save(customer=self.request.user, provider=service.provider, notes="")
        booking.reserve_availability_slot()
        notify_booking_participants(
            booking=booking,
            title="Booking created",
            body=f"Booking {booking.reference} has been created. Provider must accept within 24 hours.",
            actor=self.request.user,
        )

    def _check_participant(self, booking):
        permission = IsBookingParticipantOrAdmin()
        if not permission.has_object_permission(self.request, self, booking):
            raise PermissionDenied(permission.message)

    @action(detail=True, methods=["get"])
    def events(self, request, pk=None):
        booking = self.get_object()
        self._check_participant(booking)
        events = booking.status_events.select_related("changed_by")
        return Response(BookingStatusEventSerializer(events, many=True).data)

    @action(detail=True, methods=["get"], url_path="payment-events")
    def payment_events(self, request, pk=None):
        booking = self.get_object()
        self._check_participant(booking)
        events = booking.payment_events.all()
        return Response(PaymentWebhookEventSerializer(events, many=True).data)

    @action(detail=True, methods=["post"])
    def update_status(self, request, pk=None):
        booking = self.get_object()
        self._check_participant(booking)

        if request.user.role == User.Role.CUSTOMER and not request.user.is_staff:
            raise PermissionDenied("Customers cannot set operational booking statuses.")

        serializer = BookingStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["status"]
        note = serializer.validated_data.get("note", "")
        current_status = booking.status

        transitions = {
            Booking.Status.REQUESTED: {Booking.Status.ACCEPTED, Booking.Status.REJECTED, Booking.Status.CANCELLED},
            Booking.Status.ACCEPTED: {Booking.Status.IN_PROGRESS, Booking.Status.CANCELLED},
            Booking.Status.IN_PROGRESS: {Booking.Status.CANCELLED},
            Booking.Status.REJECTED: set(),
            Booking.Status.COMPLETED: set(),
            Booking.Status.CANCELLED: set(),
        }

        if new_status not in transitions[current_status]:
            raise ValidationError(f"Invalid transition from {current_status} to {new_status}.")

        update_fields = ["status", "updated_at"]
        booking.status = new_status
        if new_status != Booking.Status.REQUESTED and booking.acceptance_deadline_at is not None:
            booking.acceptance_deadline_at = None
            update_fields.append("acceptance_deadline_at")
        if new_status in {Booking.Status.REJECTED, Booking.Status.CANCELLED}:
            if booking.escrow_status in {Booking.EscrowStatus.PAID, Booking.EscrowStatus.HELD}:
                booking.escrow_status = Booking.EscrowStatus.REFUNDED
                update_fields.append("escrow_status")
            if booking.provider_completed_confirmed_at is not None:
                booking.provider_completed_confirmed_at = None
                update_fields.append("provider_completed_confirmed_at")
            if booking.customer_completed_confirmed_at is not None:
                booking.customer_completed_confirmed_at = None
                update_fields.append("customer_completed_confirmed_at")
        booking.save(update_fields=list(dict.fromkeys(update_fields)))

        if new_status in {Booking.Status.REJECTED, Booking.Status.CANCELLED}:
            booking.release_availability_slot()
            sync_payout_ledger_for_booking(booking=booking, actor=request.user)

        BookingStatusEvent.objects.create(
            booking=booking,
            from_status=current_status,
            to_status=new_status,
            changed_by=request.user,
            note=note,
        )

        notify_booking_participants(
            booking=booking,
            title="Booking status updated",
            body=f"Booking {booking.reference} status changed from {current_status} to {new_status}.",
            actor=request.user,
        )

        return Response(self.get_serializer(booking).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        booking = self.get_object()
        self._check_participant(booking)

        if booking.status in {Booking.Status.COMPLETED, Booking.Status.CANCELLED, Booking.Status.REJECTED}:
            raise ValidationError("Booking cannot be cancelled in its current state.")

        serializer = BookingCancellationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reason = serializer.validated_data.get("reason", "")
        previous_status = booking.status

        booking.status = Booking.Status.CANCELLED
        booking.cancellation_reason = reason
        booking.cancelled_by = request.user
        booking.acceptance_deadline_at = None
        booking.provider_completed_confirmed_at = None
        booking.customer_completed_confirmed_at = None

        if booking.escrow_status in {Booking.EscrowStatus.PAID, Booking.EscrowStatus.HELD}:
            booking.escrow_status = Booking.EscrowStatus.REFUNDED

        booking.save(
            update_fields=[
                "status",
                "cancellation_reason",
                "cancelled_by",
                "acceptance_deadline_at",
                "provider_completed_confirmed_at",
                "customer_completed_confirmed_at",
                "escrow_status",
                "updated_at",
            ]
        )
        sync_payout_ledger_for_booking(booking=booking, actor=request.user)
        booking.release_availability_slot()

        BookingStatusEvent.objects.create(
            booking=booking,
            from_status=previous_status,
            to_status=Booking.Status.CANCELLED,
            changed_by=request.user,
            note=reason,
        )

        notify_booking_participants(
            booking=booking,
            title="Booking cancelled",
            body=f"Booking {booking.reference} has been cancelled.",
            actor=request.user,
        )

        return Response(self.get_serializer(booking).data)

    @action(detail=True, methods=["post"])
    def confirm_completion(self, request, pk=None):
        booking = self.get_object()
        self._check_participant(booking)

        is_provider = request.user.id == booking.provider.user_id
        is_customer = request.user.id == booking.customer_id
        if not (is_provider or is_customer):
            raise PermissionDenied("Only the booking customer or provider can confirm completion.")

        if booking.status in {Booking.Status.CANCELLED, Booking.Status.REJECTED}:
            raise ValidationError("Cannot confirm completion for cancelled or rejected bookings.")
        if booking.status == Booking.Status.REQUESTED:
            raise ValidationError("Provider must accept booking before completion confirmation.")
        if booking.escrow_status not in {
            Booking.EscrowStatus.PAID,
            Booking.EscrowStatus.HELD,
            Booking.EscrowStatus.RELEASED,
        }:
            raise ValidationError("Completion confirmation is available only after payment.")

        update_fields = ["updated_at"]
        now = timezone.now()

        if is_provider:
            if booking.provider_completed_confirmed_at:
                raise ValidationError("Provider has already confirmed completion.")
            booking.provider_completed_confirmed_at = now
            update_fields.append("provider_completed_confirmed_at")

        if is_customer:
            if booking.customer_completed_confirmed_at:
                raise ValidationError("Customer has already confirmed completion.")
            booking.customer_completed_confirmed_at = now
            update_fields.append("customer_completed_confirmed_at")

        completion_status_changed = False
        previous_status = booking.status
        if booking.has_both_completion_confirmations and booking.status != Booking.Status.COMPLETED:
            booking.status = Booking.Status.COMPLETED
            update_fields.append("status")
            if not booking.completed_at:
                booking.completed_at = now
                update_fields.append("completed_at")
            completion_status_changed = True

        booking.save(update_fields=list(dict.fromkeys(update_fields)))

        if completion_status_changed:
            BookingStatusEvent.objects.create(
                booking=booking,
                from_status=previous_status,
                to_status=Booking.Status.COMPLETED,
                changed_by=request.user,
                note="Completion confirmed by both provider and customer.",
            )
            notify_booking_participants(
                booking=booking,
                title="Booking completed",
                body=f"Booking {booking.reference} marked completed after both confirmations.",
                actor=request.user,
            )
            sync_payout_ledger_for_booking(booking=booking, actor=request.user)
        else:
            notify_booking_participants(
                booking=booking,
                title="Completion confirmation received",
                body=f"A completion confirmation was recorded for booking {booking.reference}.",
                actor=request.user,
            )

        return Response(self.get_serializer(booking).data)

    @action(detail=True, methods=["post"])
    def release_escrow(self, request, pk=None):
        booking = self.get_object()
        self._check_participant(booking)

        if not (request.user.is_staff or request.user.role == User.Role.ADMIN):
            raise PermissionDenied("Only platform admins can release escrow manually.")

        if booking.status != Booking.Status.COMPLETED:
            raise ValidationError("Escrow can only be released after booking completion.")
        if not booking.has_both_completion_confirmations:
            raise ValidationError(
                "Escrow release requires both provider and customer completion confirmations."
            )
        if booking.escrow_status not in {Booking.EscrowStatus.PAID, Booking.EscrowStatus.HELD}:
            raise ValidationError("Booking is not in a releasable escrow state.")

        booking.escrow_status = Booking.EscrowStatus.RELEASED
        booking.save(update_fields=["escrow_status", "updated_at"])
        sync_payout_ledger_for_booking(booking=booking, actor=request.user)
        notify_booking_participants(
            booking=booking,
            title="Escrow released",
            body=f"Escrow for booking {booking.reference} was manually released by admin.",
            actor=request.user,
        )
        return Response(self.get_serializer(booking).data)

    @action(detail=True, methods=["post"])
    def admin_refund(self, request, pk=None):
        booking = self.get_object()
        self._check_participant(booking)

        if not (request.user.is_staff or request.user.role == User.Role.ADMIN):
            raise PermissionDenied("Only platform admins can issue manual refunds.")

        previous_status = booking.status
        booking.escrow_status = Booking.EscrowStatus.REFUNDED
        if booking.status not in {Booking.Status.COMPLETED, Booking.Status.CANCELLED}:
            booking.status = Booking.Status.CANCELLED
        booking.acceptance_deadline_at = None
        booking.provider_completed_confirmed_at = None
        booking.customer_completed_confirmed_at = None
        booking.save(
            update_fields=[
                "escrow_status",
                "status",
                "acceptance_deadline_at",
                "provider_completed_confirmed_at",
                "customer_completed_confirmed_at",
                "updated_at",
            ]
        )
        sync_payout_ledger_for_booking(booking=booking, actor=request.user)
        booking.release_availability_slot()

        BookingStatusEvent.objects.create(
            booking=booking,
            from_status=previous_status,
            to_status=booking.status,
            changed_by=request.user,
            note="Manual admin refund",
        )

        notify_booking_participants(
            booking=booking,
            title="Refund issued",
            body=f"Admin issued a manual refund for booking {booking.reference}.",
            actor=request.user,
        )
        return Response(self.get_serializer(booking).data)

    @action(detail=True, methods=["post"])
    def stripe_initialize(self, request, pk=None):
        booking = self.get_object()
        self._check_participant(booking)

        if request.user.id != booking.customer_id and not (request.user.is_staff or request.user.role == User.Role.ADMIN):
            raise PermissionDenied("Only the booking customer can initialize payment.")
        if booking.status in {Booking.Status.CANCELLED, Booking.Status.REJECTED, Booking.Status.COMPLETED}:
            raise ValidationError("Cannot initialize payment for this booking status.")
        if booking.escrow_status in {
            Booking.EscrowStatus.PAID,
            Booking.EscrowStatus.HELD,
            Booking.EscrowStatus.RELEASED,
        }:
            raise ValidationError("Booking is already paid.")

        try:
            subtotal_amount = Decimal(str(booking.subtotal_amount or "0.00"))
        except Exception:
            subtotal_amount = Decimal("0.00")
        expected_platform_fee = (subtotal_amount * PLATFORM_FEE_RATE).quantize(Decimal("0.01"))
        expected_total_amount = (subtotal_amount + expected_platform_fee).quantize(Decimal("0.01"))
        if (
            booking.escrow_status in {Booking.EscrowStatus.UNPAID, Booking.EscrowStatus.FAILED}
            and (booking.platform_fee != expected_platform_fee or booking.total_amount != expected_total_amount)
        ):
            booking.platform_fee = expected_platform_fee
            booking.total_amount = expected_total_amount
            booking.save(update_fields=["platform_fee", "total_amount", "updated_at"])
        if booking.status == Booking.Status.REQUESTED and not booking.acceptance_deadline_at:
            booking.acceptance_deadline_at = timezone.now() + timedelta(hours=24)
            booking.save(update_fields=["acceptance_deadline_at", "updated_at"])

        payment_method = normalize_payment_method(request.data.get("payment_method"))
        base_return_url = str(
            request.data.get("callback_url")
            or settings.STRIPE_SUCCESS_URL
            or f"{settings.FRONTEND_BASE_URL.rstrip('/')}/bookings/{booking.id}"
        ).strip()
        if not base_return_url:
            base_return_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/bookings/{booking.id}"

        if "{CHECKOUT_SESSION_ID}" in base_return_url:
            success_url = base_return_url
        else:
            separator = "&" if "?" in base_return_url else "?"
            success_url = f"{base_return_url}{separator}session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = str(settings.STRIPE_CANCEL_URL or base_return_url)

        if not success_url.startswith("https://"):
            raise ValidationError("Stripe success URL must be a public HTTPS URL.")
        if not cancel_url.startswith("https://"):
            raise ValidationError("Stripe cancel URL must be a public HTTPS URL.")

        try:
            response = create_checkout_session(
                booking_id=booking.id,
                booking_reference=str(booking.reference),
                amount=booking.total_amount,
                currency=(booking.service.currency if booking.service_id else "USD") or "USD",
                description=f"Umrah Link booking {booking.reference} ({payment_method})",
                success_url=success_url,
                cancel_url=cancel_url,
                customer_email=booking.customer.email or "",
                payment_method=payment_method,
            )
        except StripeConfigurationError as exc:
            raise ValidationError(str(exc))
        except StripeAPIError as exc:
            raise ValidationError(f"Stripe initialize failed: {exc}")

        checkout_session_id = str(response.get("id") or "")
        redirect_url = str(response.get("url") or "")

        if not redirect_url:
            raise ValidationError("Stripe did not return a checkout URL.")

        if checkout_session_id and booking.payment_reference != checkout_session_id:
            booking.payment_reference = checkout_session_id
            booking.save(update_fields=["payment_reference", "updated_at"])

        webhook_url = settings.STRIPE_WEBHOOK_URL or request.build_absolute_uri(reverse("payment-webhook"))

        return Response(
            {
                "booking_id": booking.id,
                "merchant_reference": str(booking.reference),
                "order_tracking_id": checkout_session_id,
                "checkout_session_id": checkout_session_id,
                "redirect_url": redirect_url,
                "payment_method": payment_method,
                "provider": "STRIPE",
                "webhook_url": webhook_url,
            }
        )

    @action(detail=True, methods=["post"])
    def stripe_verify(self, request, pk=None):
        booking = self.get_object()
        self._check_participant(booking)

        session_id = str(
            request.data.get("checkout_session_id")
            or request.data.get("order_tracking_id")
            or booking.payment_reference
            or ""
        ).strip()
        booking_reference = str(
            request.data.get("booking_reference")
            or request.data.get("merchant_reference")
            or booking.reference
        ).strip()

        try:
            result = process_stripe_session(
                session_id=session_id,
                booking_reference=booking_reference,
                actor=request.user,
            )
        except StripeConfigurationError as exc:
            raise ValidationError(str(exc))
        except StripeAPIError as exc:
            raise ValidationError(f"Stripe verify failed: {exc}")

        resolved_booking = result["booking"]
        if resolved_booking and resolved_booking.id != booking.id:
            raise ValidationError("Payment reference does not match this booking.")

        booking.refresh_from_db()

        return Response(
            {
                "detail": "Payment verification completed.",
                "booking_id": booking.id,
                "merchant_reference": str(booking.reference),
                "order_tracking_id": session_id,
                "checkout_session_id": session_id,
                "payment_status": result["payment_status"],
                "session_status": result["session_status"],
                "event_type": result["event_type"] or "PENDING",
                "escrow_status": booking.escrow_status,
                "booking_status": booking.status,
                "provider": "STRIPE",
            }
        )

    # Backward-compatible aliases for older frontend bundles still calling Pesapal paths.
    @action(detail=True, methods=["post"])
    def pesapal_initialize(self, request, pk=None):  # pragma: no cover
        return self.stripe_initialize(request, pk=pk)

    @action(detail=True, methods=["post"])
    def pesapal_verify(self, request, pk=None):  # pragma: no cover
        return self.stripe_verify(request, pk=pk)


class PaymentWebhookView(APIView):
    permission_classes = [AllowAny]

    def _process_internal_event(self, data):
        booking = None
        if "booking_id" in data:
            booking = Booking.objects.filter(id=data["booking_id"]).first()
        elif "booking_reference" in data:
            booking = Booking.objects.filter(reference=data["booking_reference"]).first()

        if booking:
            expire_requested_bookings(Booking.objects.filter(id=booking.id))
            booking.refresh_from_db()

        event = PaymentWebhookEvent.objects.create(
            booking=booking,
            external_reference=data.get("payment_reference", ""),
            event_type=data["event_type"],
            payload=data.get("payload", {}),
            processed=False,
        )

        if booking:
            apply_payment_event_to_booking(
                booking=booking,
                event_type=data["event_type"],
                payment_reference=data.get("payment_reference", ""),
                actor=None,
            )

        event.processed = True
        event.processed_at = timezone.now()
        event.save(update_fields=["processed", "processed_at"])

        return Response({"detail": "Webhook processed.", "booking_found": bool(booking)})

    def get(self, request):
        return Response({"detail": "Stripe webhook endpoint. Send POST requests from Stripe."})

    def post(self, request):
        event_type = request.data.get("event_type") if hasattr(request.data, "get") else None
        if event_type:
            serializer = PaymentWebhookSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
            return self._process_internal_event(data)

        try:
            stripe_event = construct_event(
                payload=request.body,
                signature_header=request.headers.get("Stripe-Signature", ""),
            )
        except StripeSignatureError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except StripeConfigurationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        stripe_event_type = str(stripe_event.get("type") or "")
        mapped_event_type = map_stripe_webhook_type_to_event(stripe_event_type)
        if not mapped_event_type:
            return Response(
                {"detail": "Stripe event ignored.", "provider_event_type": stripe_event_type},
                status=status.HTTP_200_OK,
            )

        payload_data = stripe_event.get("data") if isinstance(stripe_event.get("data"), dict) else {}
        stripe_object = payload_data.get("object") if isinstance(payload_data.get("object"), dict) else {}

        booking = resolve_booking_from_stripe_object(stripe_object)
        if booking:
            expire_requested_bookings(Booking.objects.filter(id=booking.id))
            booking.refresh_from_db()
        external_reference = str(
            stripe_object.get("id")
            or stripe_object.get("payment_intent")
            or stripe_event.get("id")
            or ""
        ).strip()
        payment_reference = ""
        if stripe_event_type.startswith("checkout.session."):
            payment_reference = external_reference

        event = PaymentWebhookEvent.objects.create(
            booking=booking,
            external_reference=external_reference,
            event_type=mapped_event_type,
            payload=stripe_event,
            processed=False,
        )

        if booking:
            try:
                apply_payment_event_to_booking(
                    booking=booking,
                    event_type=mapped_event_type,
                    payment_reference=payment_reference,
                    actor=None,
                )
            except Exception as exc:  # pragma: no cover
                return Response({"detail": f"Payment event apply failed: {exc}"}, status=status.HTTP_400_BAD_REQUEST)

        event.processed = True
        event.processed_at = timezone.now()
        event.save(update_fields=["processed", "processed_at"])

        return Response(
            {
                "detail": "Stripe webhook processed.",
                "provider": "STRIPE",
                "provider_event_type": stripe_event_type,
                "event_type": mapped_event_type,
                "booking_found": bool(booking),
            },
            status=status.HTTP_200_OK,
        )
