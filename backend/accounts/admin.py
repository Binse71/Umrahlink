from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone

from .models import CustomerProfile, ProviderProfile, User


def is_platform_admin_user(user) -> bool:
    return bool(
        user.is_authenticated
        and user.is_active
        and user.is_staff
        and (user.is_superuser or getattr(user, "role", None) == User.Role.ADMIN)
    )


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("id", "username", "email", "role", "is_banned", "is_active")
    list_display_links = ("id", "username", "email")
    list_filter = ("role", "is_banned", "is_active")
    search_fields = ("username", "email")
    readonly_fields = ("date_joined", "last_login", "created_at", "updated_at")
    fields = (
        "username",
        "email",
        "first_name",
        "last_name",
        "phone_number",
        "role",
        "is_active",
        "is_staff",
        "is_superuser",
        "is_banned",
        "groups",
        "user_permissions",
        "last_login",
        "date_joined",
        "created_at",
        "updated_at",
    )
    actions = ("ban_selected_users", "unban_selected_users")

    def has_module_permission(self, request):
        return is_platform_admin_user(request.user)

    def has_view_permission(self, request, obj=None):
        return is_platform_admin_user(request.user)

    def has_change_permission(self, request, obj=None):
        return is_platform_admin_user(request.user)

    def has_add_permission(self, request):
        return is_platform_admin_user(request.user)

    def has_delete_permission(self, request, obj=None):
        return is_platform_admin_user(request.user)

    @admin.action(description="Ban selected users")
    def ban_selected_users(self, request, queryset):
        updated = queryset.filter(is_superuser=False).update(is_banned=True, is_active=False)
        self.message_user(request, f"{updated} user(s) banned.")

    @admin.action(description="Unban selected users")
    def unban_selected_users(self, request, queryset):
        updated = queryset.update(is_banned=False, is_active=True)
        self.message_user(request, f"{updated} user(s) unbanned.")


@admin.register(CustomerProfile)
class CustomerProfileAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "country", "city")
    search_fields = ("user__username", "user__email")

    def has_module_permission(self, request):
        return is_platform_admin_user(request.user)

    def has_view_permission(self, request, obj=None):
        return is_platform_admin_user(request.user)

    def has_change_permission(self, request, obj=None):
        return is_platform_admin_user(request.user)

    def has_add_permission(self, request):
        return is_platform_admin_user(request.user)

    def has_delete_permission(self, request, obj=None):
        return is_platform_admin_user(request.user)


@admin.register(ProviderProfile)
class ProviderProfileAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "photo_thumb",
        "professional_name",
        "user",
        "verification_status",
        "is_accepting_bookings",
        "rating_average",
    )
    list_filter = ("verification_status", "is_accepting_bookings")
    search_fields = ("professional_name", "user__username", "user__email")
    list_select_related = ("user", "approved_by")
    readonly_fields = ("photo_preview",)
    actions = (
        "approve_selected_providers",
        "reject_selected_providers",
        "suspend_selected_providers",
        "ban_selected_provider_users",
    )
    fields = (
        "user",
        "professional_name",
        "bio",
        "city",
        "base_locations",
        "supported_languages",
        "profile_photo",
        "photo_preview",
        "years_experience",
        "credentials_summary",
        "verification_status",
        "is_accepting_bookings",
        "rating_average",
        "total_reviews",
        "approved_at",
        "approved_by",
        "rejected_reason",
    )

    def has_module_permission(self, request):
        return is_platform_admin_user(request.user)

    def has_view_permission(self, request, obj=None):
        return is_platform_admin_user(request.user)

    def has_change_permission(self, request, obj=None):
        return is_platform_admin_user(request.user)

    def has_add_permission(self, request):
        return is_platform_admin_user(request.user)

    def has_delete_permission(self, request, obj=None):
        return is_platform_admin_user(request.user)

    @admin.display(description="Photo")
    def photo_thumb(self, obj):
        if obj.profile_photo:
            return format_html(
                '<img src="{}" alt="Profile photo" style="width:44px;height:44px;'
                'object-fit:cover;border-radius:10px;border:1px solid #d0d7d4;" />',
                obj.profile_photo.url,
            )
        return "—"

    @admin.display(description="Profile photo preview")
    def photo_preview(self, obj):
        if obj and obj.profile_photo:
            return format_html(
                '<a href="{0}" target="_blank" rel="noopener">'
                '<img src="{0}" alt="Profile photo" style="max-width:220px;max-height:220px;'
                "object-fit:cover;border-radius:12px;border:1px solid #d0d7d4;\" />"
                "</a>",
                obj.profile_photo.url,
            )
        return "No photo uploaded."

    @admin.action(description="Approve selected providers")
    def approve_selected_providers(self, request, queryset):
        updated = queryset.update(
            verification_status=ProviderProfile.VerificationStatus.APPROVED,
            is_accepting_bookings=True,
            approved_at=timezone.now(),
            approved_by=request.user,
            rejected_reason="",
        )
        self.message_user(request, f"{updated} provider profile(s) approved.")

    @admin.action(description="Reject selected providers")
    def reject_selected_providers(self, request, queryset):
        updated = queryset.update(
            verification_status=ProviderProfile.VerificationStatus.REJECTED,
            is_accepting_bookings=False,
        )
        self.message_user(request, f"{updated} provider profile(s) rejected.")

    @admin.action(description="Suspend selected providers")
    def suspend_selected_providers(self, request, queryset):
        updated = queryset.update(
            verification_status=ProviderProfile.VerificationStatus.SUSPENDED,
            is_accepting_bookings=False,
        )
        self.message_user(request, f"{updated} provider profile(s) suspended.")

    @admin.action(description="Ban selected provider user accounts")
    def ban_selected_provider_users(self, request, queryset):
        user_ids = queryset.values_list("user_id", flat=True)
        updated = User.objects.filter(id__in=user_ids, is_superuser=False).update(is_banned=True, is_active=False)
        queryset.update(
            verification_status=ProviderProfile.VerificationStatus.SUSPENDED,
            is_accepting_bookings=False,
        )
        self.message_user(request, f"{updated} provider user account(s) banned.")
