from rest_framework import serializers

from .models import PayoutLedger, ProviderPayoutProfile


class ProviderPayoutProfileSerializer(serializers.ModelSerializer):
    provider_id = serializers.IntegerField(source="provider.id", read_only=True)
    provider_name = serializers.CharField(source="provider.professional_name", read_only=True)

    class Meta:
        model = ProviderPayoutProfile
        fields = (
            "id",
            "provider_id",
            "provider_name",
            "method",
            "bank_account_name",
            "bank_name",
            "saudi_iban",
            "mpesa_full_name",
            "mpesa_phone",
            "usdt_network",
            "usdt_wallet_address",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "provider_id", "provider_name", "created_at", "updated_at")

    def validate(self, attrs):
        method = attrs.get("method", getattr(self.instance, "method", "")).strip()

        if method == ProviderPayoutProfile.Method.SAUDI_BANK:
            account_name = str(attrs.get("bank_account_name", getattr(self.instance, "bank_account_name", ""))).strip()
            bank_name = str(attrs.get("bank_name", getattr(self.instance, "bank_name", ""))).strip()
            iban = str(attrs.get("saudi_iban", getattr(self.instance, "saudi_iban", ""))).replace(" ", "").upper()
            if not account_name:
                raise serializers.ValidationError({"bank_account_name": "Bank account name is required."})
            if not bank_name:
                raise serializers.ValidationError({"bank_name": "Bank name is required."})
            if not iban.startswith("SA"):
                raise serializers.ValidationError({"saudi_iban": "Saudi IBAN must start with SA."})
            attrs["saudi_iban"] = iban

        elif method == ProviderPayoutProfile.Method.MPESA:
            full_name = str(attrs.get("mpesa_full_name", getattr(self.instance, "mpesa_full_name", ""))).strip()
            phone = str(attrs.get("mpesa_phone", getattr(self.instance, "mpesa_phone", ""))).replace(" ", "")
            if not full_name:
                raise serializers.ValidationError({"mpesa_full_name": "M-Pesa full name is required."})
            if not phone.startswith("+254"):
                raise serializers.ValidationError({"mpesa_phone": "M-Pesa phone must start with +254."})
            attrs["mpesa_phone"] = phone

        elif method == ProviderPayoutProfile.Method.USDT:
            network = attrs.get("usdt_network", getattr(self.instance, "usdt_network", ""))
            wallet_address = str(
                attrs.get("usdt_wallet_address", getattr(self.instance, "usdt_wallet_address", ""))
            ).strip()
            if network not in {ProviderPayoutProfile.UsdtNetwork.TRC20, ProviderPayoutProfile.UsdtNetwork.ERC20}:
                raise serializers.ValidationError({"usdt_network": "USDT network must be TRC20 or ERC20."})
            if not wallet_address:
                raise serializers.ValidationError({"usdt_wallet_address": "USDT wallet address is required."})
        else:
            raise serializers.ValidationError({"method": "Unsupported payout method."})

        return attrs


class PayoutLedgerSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source="provider.professional_name", read_only=True)
    booking_reference = serializers.UUIDField(source="booking.reference", read_only=True)
    approved_by_name = serializers.CharField(source="approved_by.get_full_name", read_only=True)
    paid_by_name = serializers.CharField(source="paid_by.get_full_name", read_only=True)

    class Meta:
        model = PayoutLedger
        fields = (
            "id",
            "provider",
            "provider_name",
            "booking",
            "booking_reference",
            "gross_amount",
            "platform_fee",
            "net_amount",
            "status",
            "payout_method",
            "payout_details_snapshot",
            "payout_date",
            "admin_note",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "paid_by",
            "paid_by_name",
            "paid_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "provider",
            "provider_name",
            "booking",
            "booking_reference",
            "gross_amount",
            "platform_fee",
            "net_amount",
            "payout_method",
            "payout_details_snapshot",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "paid_by",
            "paid_by_name",
            "paid_at",
            "created_at",
            "updated_at",
        )


class PayoutActionSerializer(serializers.Serializer):
    admin_note = serializers.CharField(required=False, allow_blank=True, max_length=1000)
