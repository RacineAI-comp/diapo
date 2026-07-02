"""Tests proving the Presentation model, get_abilities, and the DRF API.

Run with: python manage.py test
"""

import uuid

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import resolve

from rest_framework.test import APIClient

from core.models import Presentation

User = get_user_model()


class PresentationModelTests(TestCase):
    def test_uuid_primary_key(self):
        p = Presentation.objects.create(title="Deck A")
        self.assertIsInstance(p.id, uuid.UUID)
        self.assertEqual(p.id.version, 4)

    def test_abilities_ownerless_is_world_editable(self):
        p = Presentation.objects.create(title="Ownerless")
        abilities = p.get_abilities(AnonymousUser())
        self.assertTrue(abilities["retrieve"])
        self.assertTrue(abilities["update"])
        self.assertTrue(abilities["partial_update"])
        self.assertTrue(abilities["collaboration_auth"])
        # Every documented key is present.
        self.assertEqual(
            set(abilities),
            {
                "retrieve",
                "update",
                "partial_update",
                "destroy",
                "collaboration_auth",
            },
        )

    def test_abilities_owned_deck_readonly_for_others(self):
        owner = User.objects.create(sub="owner-sub", email="owner@example.com")
        other = User.objects.create(sub="other-sub", email="other@example.com")
        p = Presentation.objects.create(title="Owned", owner=owner)

        owner_abilities = p.get_abilities(owner)
        self.assertTrue(owner_abilities["update"])
        self.assertTrue(owner_abilities["destroy"])

        other_abilities = p.get_abilities(other)
        self.assertTrue(other_abilities["retrieve"])
        self.assertFalse(other_abilities["update"])
        self.assertFalse(other_abilities["destroy"])

        anon_abilities = p.get_abilities(AnonymousUser())
        self.assertTrue(anon_abilities["retrieve"])
        self.assertFalse(anon_abilities["update"])


class PresentationAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_create_and_retrieve_includes_abilities(self):
        resp = self.client.post(
            "/api/v1.0/presentations/", {"title": "From API"}, format="json"
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()
        self.assertIn("abilities", body)
        self.assertTrue(body["abilities"]["update"])  # ownerless -> editable
        pk = body["id"]

        # The detail URL the collab server hits: /api/v1.0/presentations/<id>/
        detail = self.client.get(f"/api/v1.0/presentations/{pk}/")
        self.assertEqual(detail.status_code, 200, detail.content)
        self.assertEqual(detail.json()["id"], pk)
        self.assertIn("abilities", detail.json())

    def test_list_returns_abilities(self):
        Presentation.objects.create(title="L1")
        resp = self.client.get("/api/v1.0/presentations/")
        self.assertEqual(resp.status_code, 200, resp.content)
        results = resp.json()
        # DefaultRouter without pagination returns a list.
        items = results["results"] if isinstance(results, dict) else results
        self.assertGreaterEqual(len(items), 1)
        self.assertIn("abilities", items[0])

    def test_update_changes_title(self):
        p = Presentation.objects.create(title="Old")
        resp = self.client.patch(
            f"/api/v1.0/presentations/{p.id}/", {"title": "New"}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        p.refresh_from_db()
        self.assertEqual(p.title, "New")


KEY = "test-collab-secret"


@override_settings(Y_PROVIDER_API_KEY=KEY)
class CollabStateTests(TestCase):
    """Server-to-server Yjs persistence endpoint (collab server ⇆ Postgres)."""

    def setUp(self):
        self.client = APIClient()
        self.p = Presentation.objects.create(title="Collab deck")
        self.url = f"/api/v1.0/collab/{self.p.id}/"

    def test_put_then_get_roundtrips_content(self):
        resp = self.client.put(
            self.url, {"content": "AAEC"}, format="json", HTTP_X_Y_PROVIDER_KEY=KEY
        )
        self.assertEqual(resp.status_code, 204, resp.content)
        self.p.refresh_from_db()
        self.assertEqual(self.p.content, "AAEC")

        got = self.client.get(self.url, HTTP_X_Y_PROVIDER_KEY=KEY)
        self.assertEqual(got.status_code, 200, got.content)
        self.assertEqual(got.json()["content"], "AAEC")

    def test_get_unknown_doc_404(self):
        resp = self.client.get(
            f"/api/v1.0/collab/{uuid.uuid4()}/", HTTP_X_Y_PROVIDER_KEY=KEY
        )
        self.assertEqual(resp.status_code, 404, resp.content)

    def test_wrong_or_missing_key_forbidden(self):
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(
            self.client.get(self.url, HTTP_X_Y_PROVIDER_KEY="nope").status_code, 403
        )

    @override_settings(Y_PROVIDER_API_KEY="")
    def test_disabled_when_no_key_configured(self):
        resp = self.client.get(self.url, HTTP_X_Y_PROVIDER_KEY=KEY)
        self.assertEqual(resp.status_code, 503, resp.content)


class CeleryAndRenderTests(TestCase):
    """Async offload infra: tasks run eagerly with no broker; the render helper produces PNGs."""

    def test_health_ping_runs_eagerly(self):
        # No broker in tests → CELERY_TASK_ALWAYS_EAGER → the task runs in-process.
        from core.tasks import health_ping

        self.assertEqual(health_ping.delay().get(), "pong")

    def test_render_to_pages_rasterises_a_pdf(self):
        # A real 1-page PDF (via Pillow) exercises the poppler path without LibreOffice.
        import io

        from PIL import Image

        from core.render import render_to_pages

        buf = io.BytesIO()
        Image.new("RGB", (200, 150), "white").save(buf, "PDF")
        result = render_to_pages(buf.getvalue(), "tiny.pdf")
        self.assertEqual(len(result["pages"]), 1)
        self.assertFalse(result["truncated"])
        self.assertTrue(result["pages"][0].startswith("data:image/png;base64,"))


class ObservabilityTests(TestCase):
    """Health/readiness probes + structured logging."""

    def test_healthz_and_readyz(self):
        client = APIClient()
        self.assertEqual(client.get("/healthz").json()["status"], "ok")
        ready = client.get("/readyz")
        self.assertEqual(ready.status_code, 200, ready.content)
        self.assertTrue(ready.json()["db"])

    def test_json_log_formatter(self):
        import json as _json
        import logging

        from slides.logging import JsonFormatter

        record = logging.LogRecord(
            "svc", logging.INFO, __file__, 1, "hello %s", ("world",), None
        )
        out = _json.loads(JsonFormatter().format(record))
        self.assertEqual(out["message"], "hello world")
        self.assertEqual(out["level"], "INFO")
        self.assertIn("time", out)


class CollabContractTests(SimpleTestCase):
    """Never-fork safety net: the backend must keep exposing the exact routes the collab
    (y-provider) server (`src/frontend/servers/y-provider/server.mjs`) calls."""

    def test_collab_server_contract_routes_resolve(self):
        u = uuid.uuid4()
        self.assertEqual(
            resolve(f"/api/v1.0/presentations/{u}/").view_name, "presentation-detail"
        )
        self.assertEqual(resolve(f"/api/v1.0/collab/{u}/").view_name, "collab-state")
        self.assertEqual(resolve("/healthz").view_name, "healthz")
        self.assertEqual(resolve("/readyz").view_name, "readyz")


class AbilitiesEnforcementTests(TestCase):
    """The API enforces get_abilities per object (not just serializes it)."""

    def setUp(self):
        self.client = APIClient()
        self.alice = User.objects.create(sub="alice", email="alice@example.com")
        self.bob = User.objects.create(sub="bob", email="bob@example.com")
        self.reader_deck = Presentation.objects.create(
            title="Bob reader", owner=self.bob, link_role=Presentation.LinkRole.READER
        )
        self.editor_deck = Presentation.objects.create(
            title="Bob editor", owner=self.bob, link_role=Presentation.LinkRole.EDITOR
        )

    def _as_alice(self):
        self.client.force_authenticate(user=self.alice)

    def test_non_owner_can_retrieve_reader_deck_but_not_update(self):
        self._as_alice()
        got = self.client.get(f"/api/v1.0/presentations/{self.reader_deck.id}/")
        self.assertEqual(got.status_code, 200, got.content)
        self.assertFalse(got.json()["abilities"]["update"])

        resp = self.client.patch(
            f"/api/v1.0/presentations/{self.reader_deck.id}/",
            {"title": "Hijacked"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403, resp.content)
        self.reader_deck.refresh_from_db()
        self.assertEqual(self.reader_deck.title, "Bob reader")

    def test_non_owner_cannot_delete(self):
        self._as_alice()
        for deck in (self.reader_deck, self.editor_deck):
            resp = self.client.delete(f"/api/v1.0/presentations/{deck.id}/")
            self.assertEqual(resp.status_code, 403, resp.content)
        self.assertEqual(Presentation.objects.count(), 2)

    def test_non_owner_cannot_change_link_role(self):
        # Privilege escalation attempt: promote someone else's link to editor -> explicit 403.
        self._as_alice()
        resp = self.client.patch(
            f"/api/v1.0/presentations/{self.reader_deck.id}/",
            {"link_role": "editor"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403, resp.content)
        self.reader_deck.refresh_from_db()
        self.assertEqual(self.reader_deck.link_role, Presentation.LinkRole.READER)

    def test_editor_link_allows_update_but_not_link_role_or_delete(self):
        self._as_alice()
        url = f"/api/v1.0/presentations/{self.editor_deck.id}/"
        resp = self.client.patch(url, {"title": "Edited by Alice"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.content)

        demote = self.client.patch(url, {"link_role": "reader"}, format="json")
        self.assertEqual(demote.status_code, 403, demote.content)
        self.editor_deck.refresh_from_db()
        self.assertEqual(self.editor_deck.link_role, Presentation.LinkRole.EDITOR)

        self.assertEqual(self.client.delete(url).status_code, 403)

    def test_owner_has_full_control(self):
        self.client.force_authenticate(user=self.bob)
        url = f"/api/v1.0/presentations/{self.reader_deck.id}/"
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(
            self.client.patch(url, {"title": "Renamed"}, format="json").status_code, 200
        )
        self.assertEqual(
            self.client.patch(url, {"link_role": "editor"}, format="json").status_code,
            200,
        )
        self.reader_deck.refresh_from_db()
        self.assertEqual(self.reader_deck.link_role, Presentation.LinkRole.EDITOR)
        self.assertEqual(self.client.delete(url).status_code, 204)

    def test_anonymous_cannot_mutate_owned_deck(self):
        resp = self.client.patch(
            f"/api/v1.0/presentations/{self.reader_deck.id}/",
            {"title": "Anon edit"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403, resp.content)
        self.assertEqual(
            self.client.delete(
                f"/api/v1.0/presentations/{self.editor_deck.id}/"
            ).status_code,
            403,
        )

    def test_anonymous_ownerless_demo_behaviour_unchanged(self):
        # AllowAny local mode: ownerless decks stay world-editable.
        deck = Presentation.objects.create(title="Demo")
        url = f"/api/v1.0/presentations/{deck.id}/"
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(
            self.client.patch(url, {"title": "Demo 2"}, format="json").status_code, 200
        )
        self.assertEqual(self.client.delete(url).status_code, 204)


class ListScopingTests(TestCase):
    """GET /presentations/ only shows own + ownerless decks; link-shared decks stay reachable
    by UUID but never leak into someone else's list."""

    def setUp(self):
        self.client = APIClient()
        self.alice = User.objects.create(sub="alice", email="alice@example.com")
        self.bob = User.objects.create(sub="bob", email="bob@example.com")
        self.mine = Presentation.objects.create(title="Mine", owner=self.alice)
        self.ownerless = Presentation.objects.create(title="Ownerless")
        self.bobs = Presentation.objects.create(title="Bobs", owner=self.bob)
        self.bobs_shared = Presentation.objects.create(
            title="Bobs shared", owner=self.bob, link_role=Presentation.LinkRole.EDITOR
        )

    def _listed_ids(self):
        resp = self.client.get("/api/v1.0/presentations/")
        self.assertEqual(resp.status_code, 200, resp.content)
        return {item["id"] for item in resp.json()["results"]}

    def test_authenticated_list_is_scoped(self):
        self.client.force_authenticate(user=self.alice)
        ids = self._listed_ids()
        self.assertEqual(ids, {str(self.mine.id), str(self.ownerless.id)})

    def test_anonymous_list_only_ownerless(self):
        self.assertEqual(self._listed_ids(), {str(self.ownerless.id)})

    def test_link_shared_deck_still_retrievable_by_uuid(self):
        self.client.force_authenticate(user=self.alice)
        resp = self.client.get(f"/api/v1.0/presentations/{self.bobs_shared.id}/")
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_list_is_paginated(self):
        for i in range(25):
            Presentation.objects.create(title=f"Bulk {i}")
        resp = self.client.get("/api/v1.0/presentations/")
        body = resp.json()
        self.assertEqual(set(body), {"count", "next", "previous", "results"})
        self.assertEqual(body["count"], 26)  # 25 bulk + self.ownerless
        self.assertEqual(len(body["results"]), 20)
        self.assertIsNotNone(body["next"])


class MediaUploadTests(TestCase):
    """Upload endpoint only accepts real raster images within the size budget."""

    def setUp(self):
        self.client = APIClient()

    def _png_bytes(self):
        import io

        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGB", (4, 4), "red").save(buf, "PNG")
        return buf.getvalue()

    def _post(self, name, content, content_type):
        from django.core.files.uploadedfile import SimpleUploadedFile

        return self.client.post(
            "/api/v1.0/upload/",
            {"file": SimpleUploadedFile(name, content, content_type=content_type)},
            format="multipart",
        )

    def test_accepts_real_png(self):
        import tempfile

        with tempfile.TemporaryDirectory() as media:
            with override_settings(MEDIA_ROOT=media):
                resp = self._post("pic.png", self._png_bytes(), "image/png")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIn("url", resp.json())

    def test_rejects_non_image_payload(self):
        resp = self._post("fake.png", b"<script>alert(1)</script>", "image/png")
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_rejects_svg(self):
        resp = self._post("vector.svg", b"<svg xmlns='x'/>", "image/svg+xml")
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_rejects_mismatched_content_type(self):
        resp = self._post("pic.png", self._png_bytes(), "application/octet-stream")
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_rejects_oversize(self):
        big = b"\0" * (25 * 1024 * 1024 + 1)
        resp = self._post("big.png", big, "image/png")
        self.assertEqual(resp.status_code, 413, resp.content)


class MediaUploadAvTests(TestCase):
    """Video/audio uploads: extension + content type allowlist AND magic-byte sniffing."""

    # Minimal payloads carrying just the container magic bytes.
    MP4 = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 16
    WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 16
    MP3_ID3 = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 16
    MP3_SYNC = b"\xff\xfb\x90\x00" + b"\x00" * 16
    OGG = b"OggS\x00\x02" + b"\x00" * 16
    WAV = b"RIFF\x24\x00\x00\x00WAVEfmt " + b"\x00" * 16

    def setUp(self):
        self.client = APIClient()

    def _post(self, name, content, content_type):
        from django.core.files.uploadedfile import SimpleUploadedFile

        return self.client.post(
            "/api/v1.0/upload/",
            {"file": SimpleUploadedFile(name, content, content_type=content_type)},
            format="multipart",
        )

    def _post_stored(self, name, content, content_type):
        import tempfile

        with tempfile.TemporaryDirectory() as media:
            with override_settings(MEDIA_ROOT=media):
                return self._post(name, content, content_type)

    def test_accepts_mp4(self):
        resp = self._post_stored("clip.mp4", self.MP4, "video/mp4")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIn("url", resp.json())

    def test_accepts_webm(self):
        resp = self._post_stored("clip.webm", self.WEBM, "video/webm")
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_accepts_mp3_id3_and_frame_sync(self):
        self.assertEqual(
            self._post_stored("a.mp3", self.MP3_ID3, "audio/mpeg").status_code, 200
        )
        self.assertEqual(
            self._post_stored("b.mp3", self.MP3_SYNC, "audio/mpeg").status_code, 200
        )

    def test_accepts_ogg(self):
        resp = self._post_stored("a.ogg", self.OGG, "audio/ogg")
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_accepts_wav(self):
        resp = self._post_stored("a.wav", self.WAV, "audio/wav")
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_accepts_m4a(self):
        resp = self._post_stored("a.m4a", self.MP4, "audio/mp4")
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_rejects_spoofed_extension(self):
        # Right extension + content type, wrong bytes: sniffing must catch it.
        resp = self._post("evil.mp4", b"<script>alert(1)</script>", "video/mp4")
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_rejects_mismatched_content_type(self):
        resp = self._post("clip.mp4", self.MP4, "text/plain")
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_rejects_wav_without_wave_tag(self):
        # RIFF alone is not enough (e.g. an AVI is also RIFF).
        resp = self._post(
            "a.wav", b"RIFF\x24\x00\x00\x00AVI " + b"\x00" * 16, "audio/wav"
        )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_rejects_oversize_video(self):
        from unittest import mock

        from core.views import MediaUploadView

        payload = self.MP4 + b"\x00" * 1024
        with mock.patch.object(MediaUploadView, "MAX_VIDEO_SIZE", 512):
            resp = self._post("big.mp4", payload, "video/mp4")
        self.assertEqual(resp.status_code, 413, resp.content)

    def test_rejects_oversize_audio(self):
        from unittest import mock

        from core.views import MediaUploadView

        payload = self.MP3_ID3 + b"\x00" * 1024
        with mock.patch.object(MediaUploadView, "MAX_AUDIO_SIZE", 512):
            resp = self._post("big.mp3", payload, "audio/mpeg")
        self.assertEqual(resp.status_code, 413, resp.content)


PPTX_CT = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


class ImportGuardTests(TestCase):
    """Import endpoint rejects oversize files, unsupported types, and zip bombs before any
    parsing or LibreOffice conversion runs."""

    def setUp(self):
        self.client = APIClient()

    def _post(self, name, content, content_type):
        from django.core.files.uploadedfile import SimpleUploadedFile

        return self.client.post(
            "/api/v1.0/import/",
            {"file": SimpleUploadedFile(name, content, content_type=content_type)},
            format="multipart",
        )

    def test_rejects_oversize(self):
        big = b"\0" * (50 * 1024 * 1024 + 1)
        resp = self._post("deck.pptx", big, PPTX_CT)
        self.assertEqual(resp.status_code, 413, resp.content)

    def test_rejects_unsupported_extension(self):
        resp = self._post("notes.txt", b"hello", "text/plain")
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_rejects_mismatched_content_type(self):
        resp = self._post("deck.pptx", b"PK\x03\x04", "text/html")
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_rejects_corrupt_zip(self):
        resp = self._post("deck.pptx", b"not a zip at all", PPTX_CT)
        self.assertEqual(resp.status_code, 400, resp.content)

    def _zip_bytes(self, entries):
        import io
        import zipfile

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for name, data in entries:
                zf.writestr(name, data)
        return buf.getvalue()

    def test_rejects_zip_bomb_declared_size(self):
        from unittest import mock

        from core.views import ImportView

        payload = self._zip_bytes([("big.bin", b"\0" * (1024 * 1024))])
        with mock.patch.object(ImportView, "MAX_ZIP_UNCOMPRESSED", 512 * 1024):
            resp = self._post("bomb.pptx", payload, PPTX_CT)
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_rejects_zip_bomb_entry_count(self):
        from unittest import mock

        from core.views import ImportView

        payload = self._zip_bytes([(f"f{i}", b"") for i in range(6)])
        with mock.patch.object(ImportView, "MAX_ZIP_ENTRIES", 5):
            resp = self._post("many.pptx", payload, PPTX_CT)
        self.assertEqual(resp.status_code, 400, resp.content)
