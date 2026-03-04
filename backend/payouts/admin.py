from django.contrib import admin

from .models import PayoutLedger, ProviderPayoutProfile


@admin.register(ProviderPayoutProfile)
class ProviderPayoutProfileAdmin(admin.ModelAdmin):
    list_display = ("id", "provider", "method", "updated_at")
    list_filter = ("method",)
    search_fields = ("provider__professional_name", "provider__user__username", "provider__user__email")


@admin.register(PayoutLedger)
class PayoutLedgerAdmin(admin.ModelAdmin):
    list_display = ("id", "booking", "provider", "status", "net_amount", "payout_method", "updated_at")
    list_filter = ("status", "payout_method")
    search_fields = ("booking__reference", "provider__professional_name", "provider__user__username")
