"""Celery tasks. Only meaningful when the optional `celery` extra is installed and a broker is
configured; otherwise the web process renders inline (see ImportView._render_pages_response)."""

import base64

from celery import shared_task

from core.render import render_to_pages


@shared_task(name="core.render_import_pages")
def render_import_pages(file_b64: str, name: str) -> dict:
    """Render an uploaded deck to base64 PNG pages on a worker (LibreOffice off the web tier).
    Returns render.py's `{"pages": [...], "truncated": bool}` payload."""
    return render_to_pages(base64.b64decode(file_b64), name)


@shared_task(name="core.health_ping")
def health_ping() -> str:
    """Trivial task for worker liveness checks."""
    return "pong"
