# Load the Celery app at Django startup so @shared_task registers, but only if the optional
# `celery` extra is installed. The backend boots and serves fine without it (inline rendering).
try:
    from .celery import app as celery_app

    __all__ = ("celery_app",)
except (
    ModuleNotFoundError
):  # celery not installed → no async offload, inline fallback only
    celery_app = None
