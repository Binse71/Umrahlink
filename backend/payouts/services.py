from decimal import Decimal
from typing import Optional

from django.utils import timezone

from accounts.models import ProviderProfile, User
from bookings.models import Booking

from .models import PayoutLedger, ProviderPayoutProfile


def _build_snapshot(profile: Optional[ProviderPayoutProfile]) -> tuple[str, dict]:
    if not profile:
        return "", {}

    if profile.method == ProviderPayoutProfile.Method.SAUDI_BANK:
        return profile.method, {
            "bank_account_name": profile.bank_account_name,
            "bank_name": profile.bank_name,
            "saudi_iban": profile.saudi_iban,
        }

    if profile.method == ProviderPayoutProfile.Method.MPESA:
        return profile.method, {
            "mpesa_full_name": profile.mpesa_full_name,
            "mpesa_phone": profile.mpesa_phone,
        }

    return profile.method, {
        "usdt_network": profile.usdt_network,
        "usdt_wallet_address": profile.usdt_wallet_address,
    }


def sync_payout_ledger_for_booking(*, booking: Booking, actor: Optional[User] = None):
    provider: ProviderProfile = booking.provider
    gross_amount = Decimal(str(booking.subtotal_amount or "0.00")).quantize(Decimal("0.01"))
    platform_fee = Decimal(str(booking.platform_fee or "0.00")).quantize(Decimal("0.01"))
    net_amount = (gross_amount - platform_fee).quantize(Decimal("0.01"))
    try:
        payout_profile = provider.payout_profile
    except Exception:
        payout_profile = None
    payout_method, payout_snapshot = _build_snapshot(payout_profile)

    payout = PayoutLedger.objects.filter(booking=booking).first()

    should_create_or_update = booking.status == Booking.Status.COMPLETED and booking.escrow_status in {
        Booking.EscrowStatus.PAID,
        Booking.EscrowStatus.HELD,
        Booking.EscrowStatus.RELEASED,
    }

    if should_create_or_update:
        target_status = PayoutLedger.Status.APPROVED if booking.escrow_status == Booking.EscrowStatus.RELEASED else PayoutLedger.Status.PENDING

        if payout is None:
            payout = PayoutLedger.objects.create(
                provider=provider,
                booking=booking,
                gross_amount=gross_amount,
                platform_fee=platform_fee,
                net_amount=net_amount,
                status=target_status,
                payout_method=payout_method,
                payout_details_snapshot=payout_snapshot,
                approved_by=actor if target_status == PayoutLedger.Status.APPROVED else None,
                approved_at=timezone.now() if target_status == PayoutLedger.Status.APPROVED else None,
            )
            return payout

        update_fields = ["gross_amount", "platform_fee", "net_amount", "payout_method", "payout_details_snapshot", "updated_at"]
        payout.gross_amount = gross_amount
        payout.platform_fee = platform_fee
        payout.net_amount = net_amount
        payout.payout_method = payout_method
        payout.payout_details_snapshot = payout_snapshot

        if payout.status in {PayoutLedger.Status.PENDING, PayoutLedger.Status.APPROVED} and payout.status != target_status:
            payout.status = target_status
            update_fields.append("status")
            if target_status == PayoutLedger.Status.APPROVED:
                payout.approved_by = actor
                payout.approved_at = timezone.now()
                update_fields.extend(["approved_by", "approved_at"])

        payout.save(update_fields=list(dict.fromkeys(update_fields)))
        return payout

    if payout and payout.status != PayoutLedger.Status.PAID and (
        booking.escrow_status == Booking.EscrowStatus.REFUNDED or booking.status in {Booking.Status.CANCELLED, Booking.Status.REJECTED}
    ):
        payout.status = PayoutLedger.Status.FAILED
        payout.save(update_fields=["status", "updated_at"])

    return payout
