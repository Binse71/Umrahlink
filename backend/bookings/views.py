from typing import Any, Optional

from django.conf import settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from notifications.services import notify_booking_participants

from .models import Booking, BookingStatusEvent, PaymentWebhookEvent
from .permissions import IsBookingParticipantOrAdmin, IsCustomerUser
from .pesapal import (
    PesapalAPIError,
    PesapalConfigurationError,
    get_transaction_status,
    register_ipn,
    request_access_token,
    submit_order_request,
)
from .serializers import (
    BookingCancellationSerializer,
    BookingSerializer,
    BookingStatusEventSerializer,
    BookingStatusUpdateSerializer,
    PaymentWebhookSerializer,
)

ALLOWED_PAYMENT_METHODS = {"CARD", "APPLE_PAY", "MPESA"}


def normalize_payment_method(value: Any) -> str:
    method = str(value or "CARD").strip().upper()
    if method not in ALLOWED_PAYMENT_METHODS:
        raise ValidationError(
            {
                "payment_method": (
                    "Invalid payment method. Use CARD, APPLE_PAY, or MPESA."
                )
            }
        )
    return method


def map_pesapal_status_to_event(payment_status: str) -> Optional[str]:
    normalized = payment_status.strip().upper()
    if normalized in {"COMPLETED", "SUCCEEDED", "SUCCESS"}:
        return PaymentWebhookEvent.EventType.PAYMENT_SUCCEEDED
    if normalized in {"FAILED", "INVALID", "DECLINED"}:
        return PaymentWebhookEvent.EventType.PAYMENT_FAILED
    if normalized in {"REFUNDED", "REVERSED", "CANCELLED"}:
        return PaymentWebhookEvent.EventType.PAYMENT_REFUNDED
    return None


def resolve_booking_for_payment(*, merchant_reference: str = "", order_tracking_id: str = "") -> Optional[Booking]:
    booking = None
    if merchant_reference:
        booking = Booking.objects.filter(reference=merchant_reference).first()
    if not booking and order_tracking_id:
        booking = Booking.objects.filter(payment_reference=order_tracking_id).first()
    return booking


def apply_payment_event_to_booking(*, booking: Booking, event_type: str, payment_reference: str = "", actor=None):
    update_fields = ["updated_at"]

    if payment_reference and booking.payment_reference != payment_reference:
        booking.payment_reference = payment_reference
        update_fields.append("payment_reference")

    if event_type == PaymentWebhookEvent.EventType.PAYMENT_SUCCEEDED:
        if booking.escrow_status != Booking.EscrowStatus.HELD:
            booking.escrow_status = Booking.EscrowStatus.HELD
            update_fields.append("escrow_status")
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
        booking.release_availability_slot()
        notify_booking_participants(
            booking=booking,
            title="Payment refunded",
            body=f"Payment refunded for booking {booking.reference}.",
            actor=actor,
        )

    booking.save(update_fields=list(dict.fromkeys(update_fields)))


def process_pesapal_tracking(*, order_tracking_id: str, merchant_reference: str = "", actor=None):
    if not order_tracking_id:
        raise ValidationError("OrderTrackingId is required.")

    token = request_access_token()
    status_payload = get_transaction_status(token=token, order_tracking_id=order_tracking_id)
    payment_status = str(
        status_payload.get("payment_status_description")
        or status_payload.get("payment_status")
        or ""
    ).upper()
    event_type = map_pesapal_status_to_event(payment_status)

    booking = resolve_booking_for_payment(
        merchant_reference=merchant_reference,
        order_tracking_id=order_tracking_id,
    )

    if not booking:
        provider_reference = str(status_payload.get("merchant_reference") or "")
        if provider_reference:
            booking = resolve_booking_for_payment(
                merchant_reference=provider_reference,
                order_tracking_id=order_tracking_id,
            )

    if booking and booking.payment_reference != order_tracking_id:
        booking.payment_reference = order_tracking_id
        booking.save(update_fields=["payment_reference", "updated_at"])

    if booking and event_type:
        event = PaymentWebhookEvent.objects.create(
            booking=booking,
            external_reference=order_tracking_id,
            event_type=event_type,
            payload=status_payload,
            processed=False,
        )
        apply_payment_event_to_booking(
            booking=booking,
            event_type=event_type,
            payment_reference=order_tracking_id,
            actor=actor,
        )
        event.processed = True
        event.processed_at = timezone.now()
        event.save(update_fields=["processed", "processed_at"])

    return {
        "booking": booking,
        "payment_status": payment_status,
        "event_type": event_type,
        "payload": status_payload,
    }


class BookingViewSet(viewsets.ModelViewSet):
    serializer_class = BookingSerializer

    def get_permissions(self):
        if self.action == "create":
            return [IsAuthenticated(), IsCustomerUser()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        queryset = Booking.objects.select_related("customer", "provider", "provider__user", "service")

        if user.is_staff or user.role == User.Role.ADMIN:
            return queryset
        if user.role == User.Role.PROVIDER:
            return queryset.filter(provider__user=user)
        return queryset.filter(customer=user)

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
            body=f"Booking {booking.reference} has been created and is awaiting provider action.",
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
            Booking.Status.IN_PROGRESS: {Booking.Status.COMPLETED, Booking.Status.CANCELLED},
            Booking.Status.REJECTED: set(),
            Booking.Status.COMPLETED: set(),
            Booking.Status.CANCELLED: set(),
        }

        if new_status not in transitions[current_status]:
            raise ValidationError(f"Invalid transition from {current_status} to {new_status}.")

        booking.status = new_status
        booking.save(update_fields=["status", "completed_at", "updated_at"])

        if new_status in {Booking.Status.REJECTED, Booking.Status.CANCELLED}:
            booking.release_availability_slot()

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

        if booking.escrow_status in {Booking.EscrowStatus.PAID, Booking.EscrowStatus.HELD}:
            booking.escrow_status = Booking.EscrowStatus.REFUNDED

        booking.save(update_fields=["status", "cancellation_reason", "cancelled_by", "escrow_status", "updated_at"])
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
    def release_escrow(self, request, pk=None):
        booking = self.get_object()
        self._check_participant(booking)

        if not (request.user.is_staff or request.user.role == User.Role.ADMIN):
            raise PermissionDenied("Only platform admins can release escrow manually.")

        if booking.status != Booking.Status.COMPLETED:
            raise ValidationError("Escrow can only be released after booking completion.")
        if booking.escrow_status not in {Booking.EscrowStatus.PAID, Booking.EscrowStatus.HELD}:
            raise ValidationError("Booking is not in a releasable escrow state.")

        booking.escrow_status = Booking.EscrowStatus.RELEASED
        booking.save(update_fields=["escrow_status", "updated_at"])
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
        booking.save(update_fields=["escrow_status", "status", "updated_at"])
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
    def pesapal_initialize(self, request, pk=None):
        booking = self.get_object()
        self._check_participant(booking)

        if request.user.id != booking.customer_id and not (request.user.is_staff or request.user.role == User.Role.ADMIN):
            raise PermissionDenied("Only the booking customer can initialize payment.")
        if booking.status in {Booking.Status.CANCELLED, Booking.Status.REJECTED}:
            raise ValidationError("Cannot initialize payment for a cancelled or rejected booking.")
        if booking.escrow_status in {
            Booking.EscrowStatus.PAID,
            Booking.EscrowStatus.HELD,
            Booking.EscrowStatus.RELEASED,
        }:
            raise ValidationError("Booking is already paid.")

        payment_method = normalize_payment_method(request.data.get("payment_method"))
        webhook_url = settings.PESAPAL_IPN_URL or request.build_absolute_uri(reverse("payment-webhook"))
        if not settings.PESAPAL_IPN_ID and ("127.0.0.1" in webhook_url or "localhost" in webhook_url):
            raise ValidationError(
                "Pesapal IPN requires a public HTTPS callback URL. Set PESAPAL_IPN_ID or expose backend publicly."
            )
        requested_callback_url = str(
            request.data.get("callback_url")
            or settings.PESAPAL_CALLBACK_URL
            or f"{settings.FRONTEND_BASE_URL.rstrip('/')}/bookings/{booking.id}"
        )
        callback_url = requested_callback_url
        if "127.0.0.1" in callback_url or "localhost" in callback_url:
            callback_url = settings.PESAPAL_CALLBACK_URL or webhook_url
        if "127.0.0.1" in callback_url or "localhost" in callback_url or not callback_url.startswith("https://"):
            raise ValidationError(
                "Pesapal callback URL must be a public HTTPS URL. Set PESAPAL_CALLBACK_URL (or pass callback_url)."
            )

        try:
            token = request_access_token()
            notification_id = settings.PESAPAL_IPN_ID or register_ipn(token=token, ipn_url=webhook_url)
            response = submit_order_request(
                token=token,
                notification_id=notification_id,
                merchant_reference=str(booking.reference),
                amount=booking.total_amount,
                currency=(booking.service.currency if booking.service_id else "USD") or "USD",
                description=f"Umrah Link booking {booking.reference} ({payment_method})",
                callback_url=callback_url,
                customer_email=booking.customer.email,
                customer_phone=booking.customer.phone_number,
                customer_first_name=booking.customer.first_name,
                customer_last_name=booking.customer.last_name,
            )
        except PesapalConfigurationError as exc:
            raise ValidationError(str(exc))
        except PesapalAPIError as exc:
            raise ValidationError(f"Pesapal initialize failed: {exc}")

        order_tracking_id = str(response.get("order_tracking_id") or "")
        redirect_url = str(response.get("redirect_url") or "")
        merchant_reference = str(response.get("merchant_reference") or booking.reference)

        if not redirect_url:
            raise ValidationError("Pesapal did not return a redirect URL.")

        if order_tracking_id and booking.payment_reference != order_tracking_id:
            booking.payment_reference = order_tracking_id
            booking.save(update_fields=["payment_reference", "updated_at"])

        return Response(
            {
                "booking_id": booking.id,
                "merchant_reference": merchant_reference,
                "order_tracking_id": order_tracking_id,
                "redirect_url": redirect_url,
                "payment_method": payment_method,
                "provider": "PESAPAL",
                "webhook_url": webhook_url,
            }
        )

    @action(detail=True, methods=["post"])
    def pesapal_verify(self, request, pk=None):
        booking = self.get_object()
        self._check_participant(booking)

        order_tracking_id = str(request.data.get("order_tracking_id") or booking.payment_reference or "").strip()
        merchant_reference = str(request.data.get("merchant_reference") or booking.reference).strip()

        try:
            result = process_pesapal_tracking(
                order_tracking_id=order_tracking_id,
                merchant_reference=merchant_reference,
                actor=request.user,
            )
        except PesapalConfigurationError as exc:
            raise ValidationError(str(exc))
        except PesapalAPIError as exc:
            raise ValidationError(f"Pesapal verify failed: {exc}")

        resolved_booking = result["booking"]
        if resolved_booking and resolved_booking.id != booking.id:
            raise ValidationError("Payment reference does not match this booking.")

        booking.refresh_from_db()

        return Response(
            {
                "detail": "Payment verification completed.",
                "booking_id": booking.id,
                "merchant_reference": str(booking.reference),
                "order_tracking_id": order_tracking_id,
                "payment_status": result["payment_status"] or "UNKNOWN",
                "event_type": result["event_type"] or "PENDING",
                "escrow_status": booking.escrow_status,
                "booking_status": booking.status,
                "provider": "PESAPAL",
            }
        )


class PaymentWebhookView(APIView):
    permission_classes = [AllowAny]

    def _process_internal_event(self, data):
        booking = None
        if "booking_id" in data:
            booking = Booking.objects.filter(id=data["booking_id"]).first()
        elif "booking_reference" in data:
            booking = Booking.objects.filter(reference=data["booking_reference"]).first()

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

    def _extract_pesapal_fields(self, request):
        payload = request.data if hasattr(request, "data") else {}

        def from_payload(key: str) -> str:
            if hasattr(payload, "get"):
                value = payload.get(key, "")
                return str(value or "")
            return ""

        order_tracking_id = (
            str(request.query_params.get("OrderTrackingId", "")).strip()
            or from_payload("OrderTrackingId").strip()
            or from_payload("order_tracking_id").strip()
        )
        merchant_reference = (
            str(request.query_params.get("OrderMerchantReference", "")).strip()
            or from_payload("OrderMerchantReference").strip()
            or from_payload("merchant_reference").strip()
        )
        notification_type = (
            str(request.query_params.get("OrderNotificationType", "")).strip()
            or from_payload("OrderNotificationType").strip()
            or "IPNCHANGE"
        )

        return order_tracking_id, merchant_reference, notification_type

    def _process_pesapal_event(self, *, order_tracking_id: str, merchant_reference: str, notification_type: str):
        try:
            result = process_pesapal_tracking(
                order_tracking_id=order_tracking_id,
                merchant_reference=merchant_reference,
                actor=None,
            )
        except PesapalConfigurationError as exc:
            return Response({"detail": str(exc)}, status=503)
        except PesapalAPIError as exc:
            return Response({"detail": str(exc)}, status=400)
        except ValidationError as exc:
            return Response({"detail": str(exc.detail)}, status=400)

        return Response(
            {
                "orderNotificationType": notification_type,
                "orderTrackingId": order_tracking_id,
                "orderMerchantReference": merchant_reference,
                "status": 200,
                "provider": "PESAPAL",
                "payment_status": result["payment_status"] or "UNKNOWN",
                "event_type": result["event_type"] or "PENDING",
                "booking_found": bool(result["booking"]),
            }
        )

    def get(self, request):
        order_tracking_id, merchant_reference, notification_type = self._extract_pesapal_fields(request)
        if not order_tracking_id:
            raise ValidationError("OrderTrackingId is required for Pesapal callbacks.")
        return self._process_pesapal_event(
            order_tracking_id=order_tracking_id,
            merchant_reference=merchant_reference,
            notification_type=notification_type,
        )

    def post(self, request):
        event_type = request.data.get("event_type") if hasattr(request.data, "get") else None
        if event_type:
            serializer = PaymentWebhookSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
            return self._process_internal_event(data)

        order_tracking_id, merchant_reference, notification_type = self._extract_pesapal_fields(request)
        if order_tracking_id:
            return self._process_pesapal_event(
                order_tracking_id=order_tracking_id,
                merchant_reference=merchant_reference,
                notification_type=notification_type,
            )

        raise ValidationError("Unsupported webhook payload.")
