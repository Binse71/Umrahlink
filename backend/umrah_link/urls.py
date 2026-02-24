from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static


def api_root(_request):
    return JsonResponse(
        {
            "name": "Umrah Link API",
            "status": "ok",
            "health": "/api/health/",
            "endpoints": {
                "auth": "/api/auth/",
                "marketplace": "/api/marketplace/",
                "bookings": "/api/bookings/",
                "messaging": "/api/messaging/",
                "disputes": "/api/disputes/",
                "notifications": "/api/notifications/",
            },
        }
    )


def health_check(_request):
    return JsonResponse({"status": "ok", "service": "umrah-link-backend"})


urlpatterns = [
    path("", api_root),
    path("admin/", admin.site.urls),
    path("api/health/", health_check),
    path("api/auth/", include("accounts.urls")),
    path("api/marketplace/", include("marketplace.urls")),
    path("api/bookings/", include("bookings.urls")),
    path("api/messaging/", include("messaging.urls")),
    path("api/disputes/", include("disputes.urls")),
    path("api/notifications/", include("notifications.urls")),
]

# Media uploads (provider photos, dispute evidence). For larger production workloads,
# replace this with dedicated object storage/CDN.
if settings.MEDIA_URL:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
