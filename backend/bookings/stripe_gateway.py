from decimal import Decimal

import stripe
from django.conf import settings


class StripeConfigurationError(Exception):
    pass


class StripeAPIError(Exception):
    pass


class StripeSignatureError(Exception):
    pass


def _configure_stripe():
    if not settings.STRIPE_SECRET_KEY:
        raise StripeConfigurationError("Stripe is not configured.")
    stripe.api_key = settings.STRIPE_SECRET_KEY
    if settings.STRIPE_API_BASE_URL:
        stripe.api_base = settings.STRIPE_API_BASE_URL.rstrip("/")


def _as_dict(value):
    if hasattr(value, "to_dict_recursive"):
        return value.to_dict_recursive()
    return dict(value)


def create_checkout_session(
    *,
    booking_id,
    booking_reference,
    amount,
    currency,
    description,
    success_url,
    cancel_url,
    customer_email="",
    payment_method="CARD",
):
    _configure_stripe()
    unit_amount = int((Decimal(str(amount)) * 100).quantize(Decimal("1")))
    payment_method_types = ["card"]
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=payment_method_types,
            line_items=[
                {
                    "price_data": {
                        "currency": str(currency or "USD").lower(),
                        "product_data": {"name": description},
                        "unit_amount": unit_amount,
                    },
                    "quantity": 1,
                }
            ],
            success_url=success_url,
            cancel_url=cancel_url,
            customer_email=customer_email or None,
            client_reference_id=str(booking_reference),
            metadata={
                "booking_id": str(booking_id),
                "booking_reference": str(booking_reference),
                "requested_payment_method": str(payment_method),
            },
        )
    except stripe.StripeError as exc:
        raise StripeAPIError(str(exc)) from exc
    return _as_dict(session)


def retrieve_checkout_session(*, session_id):
    _configure_stripe()
    try:
        return _as_dict(stripe.checkout.Session.retrieve(session_id))
    except stripe.StripeError as exc:
        raise StripeAPIError(str(exc)) from exc


def construct_event(*, payload, signature):
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise StripeConfigurationError("Stripe webhook signing secret is not configured.")
    try:
        event = stripe.Webhook.construct_event(
            payload,
            signature,
            settings.STRIPE_WEBHOOK_SECRET,
            tolerance=settings.STRIPE_WEBHOOK_TOLERANCE,
        )
    except (ValueError, stripe.SignatureVerificationError) as exc:
        raise StripeSignatureError(str(exc)) from exc
    return _as_dict(event)
