from rest_framework.permissions import BasePermission

from accounts.models import User


class IsCustomerUser(BasePermission):
    message = "Only customers can perform this action."

    def has_permission(self, request, _view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == User.Role.CUSTOMER)


class IsBookingParticipantOrAdmin(BasePermission):
    message = "You are not allowed to access this booking."

    def has_object_permission(self, request, _view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.role == User.Role.ADMIN:
            return True
        return obj.customer_id == user.id or obj.provider.user_id == user.id
