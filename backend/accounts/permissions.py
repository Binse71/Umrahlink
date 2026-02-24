from rest_framework.permissions import BasePermission

from .models import User


class IsPlatformAdmin(BasePermission):
    message = "Only platform admins can perform this action."

    def has_permission(self, request, _view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_staff or user.role == User.Role.ADMIN))
