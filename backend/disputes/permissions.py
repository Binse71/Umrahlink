from rest_framework.permissions import BasePermission

from accounts.models import User


class IsDisputeParticipantOrAdmin(BasePermission):
    message = "You are not allowed to access this dispute."

    def has_object_permission(self, request, _view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.role == User.Role.ADMIN:
            return True

        booking = obj.booking
        return user.id in {booking.customer_id, booking.provider.user_id}
