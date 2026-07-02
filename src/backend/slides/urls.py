"""Root URL configuration for the Slides backend."""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from core.views import HealthView, ReadyView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1.0/", include("core.urls")),
    # k8s probes (unauthenticated, no /api prefix).
    path("healthz", HealthView.as_view(), name="healthz"),
    path("readyz", ReadyView.as_view(), name="readyz"),
]

# OIDC login/callback/logout routes (authenticate/, callback/, logout/, …) live in django-lasuite
# and are mounted under the same API base. The module only imports when the optional `oidc` extra
# is installed, so the include is guarded by OIDC_ENABLED (which itself requires that import).
# In local AllowAny mode these routes are absent, the frontend hides the login button accordingly.
if getattr(settings, "OIDC_ENABLED", False):
    urlpatterns += [path("api/v1.0/", include("lasuite.oidc_login.urls"))]

# Prometheus /metrics endpoint (only when METRICS_ENABLED + django-prometheus installed).
if getattr(settings, "METRICS_ENABLED", False):
    urlpatterns += [path("", include("django_prometheus.urls"))]

# Serve uploaded media in local/dev mode (production fronts MEDIA via the object store / nginx).
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
