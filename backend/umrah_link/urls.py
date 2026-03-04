from django.contrib import admin
from django.contrib.staticfiles.views import serve as staticfiles_serve
from django.http import JsonResponse
from django.urls import include, path, re_path
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
    re_path(r"^static/(?P<path>.*)$", staticfiles_serve, {"insecure": True}),
    path("api/health/", health_check),
    path("api/auth/", include("accounts.urls")),
    path("api/marketplace/", include("marketplace.urls")),
    path("api/bookings/", include("bookings.urls")),
    path("api/messaging/", include("messaging.urls")),
    path("api/disputes/", include("disputes.urls")),
    path("api/notifications/", include("notifications.urls")),
    path("api/payouts/", include("payouts.urls")),
]

# Media uploads (provider photos, dispute evidence). For larger production workloads,
# replace this with dedicated object storage/CDN.
if settings.MEDIA_URL:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
