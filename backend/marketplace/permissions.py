from rest_framework.permissions import BasePermission

from accounts.models import User


class IsProviderUser(BasePermission):
    message = "Only providers can perform this action."

    def has_permission(self, request, _view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == User.Role.PROVIDER)


class CanManageOwnService(BasePermission):
    message = "You can only manage your own services."

    def has_object_permission(self, request, _view, obj):
        user = request.user
        if user.is_staff or user.role == User.Role.ADMIN:
            return True
        return obj.provider.user_id == user.id
