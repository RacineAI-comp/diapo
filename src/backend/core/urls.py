"""URL routing for the core API (mounted under /api/v1.0/)."""

from django.urls import path

from rest_framework.routers import DefaultRouter

from core.views import (
    CollabStateView,
    ImportView,
    MediaUploadView,
    PresentationViewSet,
    UserInfoView,
)

router = DefaultRouter()
router.register(r"presentations", PresentationViewSet, basename="presentation")

urlpatterns = router.urls + [
    path("upload/", MediaUploadView.as_view(), name="upload"),
    path("import/", ImportView.as_view(), name="import"),
    path("users/me/", UserInfoView.as_view(), name="user-me"),
    # Server-to-server Yjs persistence (collab server ⇆ Postgres). Shared-secret auth.
    path("collab/<uuid:pk>/", CollabStateView.as_view(), name="collab-state"),
]
