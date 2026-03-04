from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models

from accounts.models import ProviderProfile, User
from bookings.models import Booking


class ProviderPayoutProfile(models.Model):
    class Method(models.TextChoices):
        SAUDI_BANK = "SAUDI_BANK", "Saudi Bank"
        MPESA = "MPESA", "M-Pesa"
        USDT = "USDT", "USDT"

    class UsdtNetwork(models.TextChoices):
        TRC20 = "TRC20", "TRC20"
        ERC20 = "ERC20", "ERC20"

    provider = models.OneToOneField(ProviderProfile, on_delete=models.CASCADE, related_name="payout_profile")
    method = models.CharField(max_length=20, choices=Method.choices)

    bank_account_name = models.CharField(max_length=160, blank=True)
    bank_name = models.CharField(max_length=160, blank=True)
    saudi_iban = models.CharField(max_length=34, blank=True)

    mpesa_full_name = models.CharField(max_length=160, blank=True)
    mpesa_phone = models.CharField(max_length=20, blank=True)

    usdt_network = models.CharField(max_length=10, choices=UsdtNetwork.choices, blank=True)
    usdt_wallet_address = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"ProviderPayoutProfile<{self.provider_id}:{self.method}>"

    def clean(self):
        method = (self.method or "").strip()

        if method == self.Method.SAUDI_BANK:
            if not self.bank_account_name.strip():
                raise ValidationError({"bank_account_name": "Bank account name is required."})
            if not self.bank_name.strip():
                raise ValidationError({"bank_name": "Bank name is required."})
            iban = (self.saudi_iban or "").replace(" ", "").upper()
            if not iban.startswith("SA"):
                raise ValidationError({"saudi_iban": "Saudi IBAN must start with SA."})
            if len(iban) < 15 or len(iban) > 34:
                raise ValidationError({"saudi_iban": "Saudi IBAN length is invalid."})

        elif method == self.Method.MPESA:
            if not self.mpesa_full_name.strip():
                raise ValidationError({"mpesa_full_name": "M-Pesa full name is required."})
            phone = (self.mpesa_phone or "").replace(" ", "")
            if not phone.startswith("+254") or len(phone) < 13:
                raise ValidationError({"mpesa_phone": "M-Pesa phone must be a Kenya number starting with +254."})

        elif method == self.Method.USDT:
            if self.usdt_network not in {self.UsdtNetwork.TRC20, self.UsdtNetwork.ERC20}:
                raise ValidationError({"usdt_network": "USDT network must be TRC20 or ERC20."})
            if not self.usdt_wallet_address.strip():
                raise ValidationError({"usdt_wallet_address": "USDT wallet address is required."})

        else:
            raise ValidationError({"method": "Unsupported payout method."})


class PayoutLedger(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        PAID = "PAID", "Paid"
        FAILED = "FAILED", "Failed"

    provider = models.ForeignKey(ProviderProfile, on_delete=models.CASCADE, related_name="payout_ledger")
    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name="payout_ledger")

    gross_amount = models.DecimalField(max_digits=10, decimal_places=2)
    platform_fee = models.DecimalField(max_digits=10, decimal_places=2)
    net_amount = models.DecimalField(max_digits=10, decimal_places=2)

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    payout_method = models.CharField(max_length=20, choices=ProviderPayoutProfile.Method.choices, blank=True)
    payout_details_snapshot = models.JSONField(default=dict, blank=True)

    payout_date = models.DateTimeField(null=True, blank=True)
    admin_note = models.TextField(blank=True)

    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payouts_approved",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payouts_paid",
    )
    paid_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"PayoutLedger<booking={self.booking_id}, status={self.status}>"

    def clean(self):
        if self.booking.provider_id != self.provider_id:
            raise ValidationError("Payout provider must match booking provider.")

        if self.net_amount != (Decimal(str(self.gross_amount or "0")) - Decimal(str(self.platform_fee or "0"))).quantize(
            Decimal("0.01")
        ):
            raise ValidationError("Net amount must equal gross amount minus platform fee.")
