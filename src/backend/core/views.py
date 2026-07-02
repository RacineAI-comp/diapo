"""DRF views for the Diapo API."""

import base64
import hmac
import logging
import os
import tempfile
import zipfile

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import connection
from django.db.models import Q
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie

from rest_framework import exceptions, mixins, status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from core.models import Presentation
from core.permissions import AbilitiesPermission
from core.render import ConversionFailed, ToolMissing, render_to_pages
from core.serializers import PresentationListSerializer, PresentationSerializer


class PresentationViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,  # update (PUT) + partial_update (PATCH)
    mixins.DestroyModelMixin,  # delete (dashboard "remove deck")
    viewsets.GenericViewSet,
):
    """CRUD endpoint for presentations at /api/v1.0/presentations/.

    Exposes list / create / retrieve / update / partial_update / destroy (the dashboard's
    "remove deck" action).

    Base permission classes come from settings (AllowAny in local mode, IsAuthenticated when
    OIDC is enabled); `AbilitiesPermission` then enforces `Presentation.get_abilities` per
    object, the same map the collab server consults over HTTP.
    """

    queryset = Presentation.objects.all()
    lookup_field = "pk"
    permission_classes = [*api_settings.DEFAULT_PERMISSION_CLASSES, AbilitiesPermission]

    def get_queryset(self):
        """Scope the list: own decks plus ownerless demo decks. Link-shared decks stay
        retrievable by UUID (abilities govern the detail routes) but never appear in
        someone else's list."""
        queryset = super().get_queryset()
        if self.action != "list":
            return queryset
        user = self.request.user
        if getattr(user, "is_authenticated", False):
            return queryset.filter(Q(owner=user) | Q(owner__isnull=True))
        return queryset.filter(owner__isnull=True)

    def get_serializer_class(self):
        if self.action == "list":
            return PresentationListSerializer
        return PresentationSerializer

    def perform_create(self, serializer):
        """Stamp the owner from the authenticated user, if any (anonymous -> ownerless)."""
        user = self.request.user
        owner = user if getattr(user, "is_authenticated", False) else None
        serializer.save(owner=owner)

    def perform_update(self, serializer):
        """Only the owner may change `link_role` on an owned deck (ownerless demo decks keep
        their world-editable behaviour). Explicit 403, never a silent ignore."""
        instance = serializer.instance
        new_role = serializer.validated_data.get("link_role")
        if (
            new_role is not None
            and new_role != instance.link_role
            and instance.owner_id is not None
            and instance.owner_id != getattr(self.request.user, "pk", None)
        ):
            raise exceptions.PermissionDenied(
                "Seul le propriétaire peut modifier le rôle du lien."
            )
        serializer.save()


class MediaUploadView(APIView):
    """Store an uploaded image/video/audio file and return its URL, the sovereign
    object-storage seam.

    Writes through Django's default storage. Locally that's the filesystem (MEDIA_ROOT); in
    production set STORAGES['default'] to a django-storages S3/MinIO backend (sovereign cloud)
    and the returned URL becomes the object-store URL, no code change. This replaces inlining
    images as data-URLs in the Yjs doc.

    Images are verified with Pillow; video/audio payloads are magic-byte sniffed so a renamed
    payload cannot pass on extension + content type alone.
    """

    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "upload"

    MAX_SIZE = 25 * 1024 * 1024  # images
    MAX_VIDEO_SIZE = 100 * 1024 * 1024
    MAX_AUDIO_SIZE = 25 * 1024 * 1024
    # No SVG: it can embed scripts and is served from the app origin.
    ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
    ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
    ALLOWED_PIL_FORMATS = {"PNG", "JPEG", "GIF", "WEBP"}
    VIDEO_EXTENSIONS = {".mp4", ".webm"}
    VIDEO_CONTENT_TYPES = {"video/mp4", "video/webm"}
    AUDIO_EXTENSIONS = {".mp3", ".ogg", ".wav", ".m4a"}
    AUDIO_CONTENT_TYPES = {
        "audio/mpeg",
        "audio/mp3",
        "audio/ogg",
        "audio/wav",
        "audio/x-wav",
        "audio/wave",
        "audio/mp4",
        "audio/x-m4a",
    }

    @staticmethod
    def _sniff_media(head, ext):
        """True if the first bytes match the container the extension claims."""
        if ext in (".mp4", ".m4a"):  # ISO BMFF: 'ftyp' box at offset 4
            return len(head) >= 8 and head[4:8] == b"ftyp"
        if ext == ".webm":  # EBML header (webm/mkv)
            return head.startswith(b"\x1a\x45\xdf\xa3")
        if ext == ".mp3":  # ID3 tag or bare MPEG frame sync (0xFFEx)
            return head.startswith(b"ID3") or (
                len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0
            )
        if ext == ".ogg":
            return head.startswith(b"OggS")
        if ext == ".wav":
            return (
                len(head) >= 12 and head.startswith(b"RIFF") and head[8:12] == b"WAVE"
            )
        return False

    def post(self, request):
        f = request.FILES.get("file")
        if not f:
            return Response(
                {"detail": "Aucun fichier."}, status=status.HTTP_400_BAD_REQUEST
            )
        ext = os.path.splitext(f.name)[1].lower()
        if ext in self.VIDEO_EXTENSIONS or ext in self.AUDIO_EXTENSIONS:
            error = self._validate_av(f, ext)
        else:
            error = self._validate_image(f, ext)
        if error is not None:
            return error
        f.seek(0)
        return self._store(request, f)

    def _validate_av(self, f, ext):
        """Video/audio path: allowlisted content type, per-kind cap, magic-byte sniff."""
        is_video = ext in self.VIDEO_EXTENSIONS
        allowed_ct = self.VIDEO_CONTENT_TYPES if is_video else self.AUDIO_CONTENT_TYPES
        if f.content_type not in allowed_ct:
            return Response(
                {
                    "detail": "Type de fichier non autorisé (mp4, webm, mp3, ogg, wav, m4a)."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        max_size = self.MAX_VIDEO_SIZE if is_video else self.MAX_AUDIO_SIZE
        if f.size > max_size:
            return Response(
                {
                    "detail": f"Fichier trop volumineux (max {max_size // (1024 * 1024)} Mo)."
                },
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        head = f.read(16)
        f.seek(0)
        if not self._sniff_media(head, ext):
            return Response(
                {"detail": "Le fichier n'est pas un média valide."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None

    def _validate_image(self, f, ext):
        """Image path: allowlist, 25 MB cap, Pillow verification (unchanged behaviour)."""
        if f.size > self.MAX_SIZE:
            return Response(
                {"detail": "Fichier trop volumineux (max 25 Mo)."},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        if (
            ext not in self.ALLOWED_EXTENSIONS
            or f.content_type not in self.ALLOWED_CONTENT_TYPES
        ):
            return Response(
                {"detail": "Type de fichier non autorisé (png, jpg, gif, webp)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Check the payload really is an image of an allowed format, not just named like one.
        try:
            from PIL import Image

            with Image.open(f) as img:
                image_format = img.format
                img.verify()
        # Pillow signals malformed input with many exception types (OSError, ValueError,
        # SyntaxError, DecompressionBombError, ...); any failure means "not a safe image".
        except Exception:  # noqa: BLE001
            return Response(
                {"detail": "Le fichier n'est pas une image valide."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if image_format not in self.ALLOWED_PIL_FORMATS:
            return Response(
                {"detail": "Format d'image non autorisé (png, jpg, gif, webp)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None

    @staticmethod
    def _store(request, f):
        name = default_storage.save(f"uploads/{f.name}", ContentFile(f.read()))
        url = default_storage.url(name)
        if url.startswith("/"):
            url = request.build_absolute_uri(url)
        return Response({"url": url})


logger = logging.getLogger(__name__)


class ImportView(APIView):
    """Import an uploaded presentation. Two paths, in order of fidelity:

    1. NATIVE (preferred, .pptx only): parse with `python-pptx` (MIT, local) into editable scene
       objects, text boxes with rich runs, shapes, pictures, tables, lines. Returns
       `{mode:"objects", slideSize, slides:[...]}`. The frontend rebuilds real objects you can edit.

    2. IMAGE FALLBACK (.odp/.pdf, or any .pptx that fails to parse, or if python-pptx is missing):
       render one PNG per page via LibreOffice (headless) + poppler. Returns `{mode:"image", pages}`.

    Both paths are fully sovereign, no Microsoft Graph, no cloud. Returns 501 if NO path can run.
    """

    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "import"

    MAX_SIZE = 50 * 1024 * 1024
    # What the pipeline actually handles: parse_pptx (.pptx) and the LibreOffice->PDF->PNG
    # fallback (.ppt/.odp, .pdf goes straight to poppler). Images never reach this endpoint
    # (the frontend inlines them client-side).
    ALLOWED_EXTENSIONS = {".pptx", ".ppt", ".odp", ".pdf"}
    ALLOWED_CONTENT_TYPES = {
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint",
        "application/vnd.oasis.opendocument.presentation",
        "application/pdf",
        # Browsers/proxies frequently send this for anything; the extension check still applies.
        "application/octet-stream",
    }
    # Zip-bomb guard for .pptx (a zip): declared uncompressed budget + entry count.
    MAX_ZIP_UNCOMPRESSED = 500 * 1024 * 1024
    MAX_ZIP_ENTRIES = 10_000

    def post(self, request):
        f = request.FILES.get("file")
        if not f:
            return Response(
                {"detail": "Aucun fichier."}, status=status.HTTP_400_BAD_REQUEST
            )
        if f.size > self.MAX_SIZE:
            return Response(
                {"detail": "Fichier trop volumineux (max 50 Mo)."},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        ext = os.path.splitext(f.name)[1].lower()
        if (
            ext not in self.ALLOWED_EXTENSIONS
            or f.content_type not in self.ALLOWED_CONTENT_TYPES
        ):
            return Response(
                {"detail": "Type de fichier non autorisé (.pptx, .ppt, .odp, .pdf)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, os.path.basename(f.name))
            with open(src, "wb") as out:
                for chunk in f.chunks():
                    out.write(chunk)

            # .pptx and .odp are zip containers: budget-check them before any decompression.
            if ext in {".pptx", ".odp"}:
                denied = self._check_zip_budget(src)
                if denied:
                    return denied

            # 1) Native .pptx parse → editable objects. Any failure falls through to the PNG path.
            if f.name.lower().endswith(".pptx"):
                try:
                    from core.pptx_import import parse_pptx

                    result = parse_pptx(src)
                    if result.get("skipped"):
                        logger.info("pptx import skipped shapes: %s", result["skipped"])
                    return Response(result)
                except ImportError:
                    logger.warning(
                        "python-pptx unavailable, falling back to PNG import."
                    )
                except Exception:
                    logger.exception(
                        "Native .pptx parse failed, falling back to PNG import."
                    )

            # 2) Image fallback, read the bytes, then render (offloaded to a Celery worker when a
            #    broker is configured, so LibreOffice never runs in the web process).
            with open(src, "rb") as fh:
                file_bytes = fh.read()

        return self._render_pages_response(file_bytes, f.name)

    @classmethod
    def _check_zip_budget(cls, path):
        """Return an error Response if the zip declares a decompression bomb, else None."""
        try:
            with zipfile.ZipFile(path) as zf:
                infos = zf.infolist()
                if len(infos) > cls.MAX_ZIP_ENTRIES:
                    return Response(
                        {"detail": "Archive invalide (trop d'entrées)."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if sum(i.file_size for i in infos) > cls.MAX_ZIP_UNCOMPRESSED:
                    return Response(
                        {"detail": "Archive invalide (taille décompressée excessive)."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
        except zipfile.BadZipFile:
            return Response(
                {"detail": "Fichier corrompu (archive illisible)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None

    @staticmethod
    def _render_pages_response(file_bytes, name):
        """Render to PNGs via the pure helper, on a Celery worker if a broker is set, else inline.

        The worker keeps the heavy LibreOffice subprocess out of the web tier; on any worker/broker
        error we fall back to inline rendering so import still works. Maps the helper's errors to
        the same HTTP codes the synchronous path used (501 tool missing, 422 conversion failed).
        """
        use_worker = bool(getattr(settings, "CELERY_BROKER_URL", "")) and not getattr(
            settings, "CELERY_TASK_ALWAYS_EAGER", True
        )
        try:
            if use_worker:
                from core.tasks import render_import_pages

                payload = base64.b64encode(file_bytes).decode()
                try:
                    result = render_import_pages.delay(payload, name).get(
                        timeout=getattr(settings, "CELERY_TASK_TIME_LIMIT", 300)
                    )
                except (ToolMissing, ConversionFailed):
                    raise  # deterministic, don't retry inline
                except Exception:
                    logger.exception("Celery render failed, running inline.")
                    result = render_to_pages(file_bytes, name)
            else:
                result = render_to_pages(file_bytes, name)
        except ToolMissing as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_501_NOT_IMPLEMENTED
            )
        except ConversionFailed as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY
            )

        return Response(
            {
                "mode": "image",
                "pages": result["pages"],
                "truncated": result["truncated"],
            }
        )


class UserInfoView(APIView):
    """Current session user, the frontend's "who am I?" probe.

    Always `AllowAny` and always 200 (never 401/403), so the frontend can render the right
    affordance in BOTH modes:

    * `auth_enabled=false` (local/AllowAny mode, no OIDC): hide the login button entirely.
    * `auth_enabled=true`, anonymous: show "Se connecter" (→ the OIDC authenticate route).
    * authenticated: show the display name + "Se déconnecter".
    """

    permission_classes = [AllowAny]

    # Set the csrftoken cookie on this probe (the SPA calls it on load) so the frontend can send
    # X-CSRFToken on authenticated writes, DRF SessionAuthentication enforces CSRF once logged in.
    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        auth_enabled = bool(getattr(settings, "OIDC_ENABLED", False))
        user = request.user
        if not getattr(user, "is_authenticated", False):
            return Response({"is_authenticated": False, "auth_enabled": auth_enabled})
        full_name = (
            (user.get_full_name() or "").strip()
            if hasattr(user, "get_full_name")
            else ""
        )
        email = getattr(user, "email", "") or ""
        # OIDC users have no admin_email (USERNAME_FIELD), so get_username() can be empty → fall
        # back to the identity email, then the pk.
        username = user.get_username() or email or str(user.pk)
        return Response(
            {
                "is_authenticated": True,
                "auth_enabled": auth_enabled,
                "id": str(user.pk),
                "username": username,
                "email": email,
                "full_name": full_name or username,
            }
        )


class HealthView(APIView):
    """Liveness probe, the process is up. No dependencies checked (k8s livenessProbe)."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok"})


class ReadyView(APIView):
    """Readiness probe, the app can serve traffic (DB reachable). 503 otherwise so k8s holds
    traffic off the pod until it's ready (readinessProbe)."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except Exception:
            logger.exception("readiness check failed (DB unreachable)")
            return Response(
                {"status": "unavailable", "db": False},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"status": "ready", "db": True})


class CollabStateView(APIView):
    """Server-to-server Yjs persistence for the collab (y-provider) server.

    Hocuspocus's Database extension calls GET to load a deck's Yjs state and PUT to store it, so
    **Postgres is the durable source of truth** (via `Presentation.content`, base64 Yjs update) -
    the collab server keeps no durable state of its own. Authenticated by the shared
    `X-Y-Provider-Key` secret, NOT a user session (mirrors the abilities handshake), so session
    auth / CSRF are disabled here. Returns 503 unless `Y_PROVIDER_API_KEY` is configured.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def _guard(self, request):
        """Return an error Response if the shared-secret check fails, else None."""
        configured = getattr(settings, "Y_PROVIDER_API_KEY", "") or ""
        if not configured:
            return Response(
                {
                    "detail": "Collab persistence not enabled (Y_PROVIDER_API_KEY unset)."
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        presented = request.headers.get("X-Y-Provider-Key", "")
        if not hmac.compare_digest(presented.encode(), configured.encode()):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        return None

    def get(self, request, pk):
        denied = self._guard(request)
        if denied:
            return denied
        try:
            presentation = Presentation.objects.get(pk=pk)
        except Presentation.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"content": presentation.content or ""})

    def put(self, request, pk):
        denied = self._guard(request)
        if denied:
            return denied
        try:
            presentation = Presentation.objects.get(pk=pk)
        except Presentation.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        content = request.data.get("content", "")
        if not isinstance(content, str):
            return Response(
                {"detail": "content must be a base64 string."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        presentation.content = content
        presentation.save(update_fields=["content", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
