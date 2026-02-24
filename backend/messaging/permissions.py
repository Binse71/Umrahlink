from rest_framework.permissions import BasePermission

from accounts.models import User


class IsThreadParticipantOrAdmin(BasePermission):
    message = "You are not allowed to access this conversation."

    def has_object_permission(self, request, _view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.role == User.Role.ADMIN:
            return True

        if hasattr(obj, "booking"):
            thread = obj
        else:
            thread = obj.thread

        return user.id in {thread.customer_id, thread.provider.user_id}
