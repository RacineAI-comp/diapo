"""Celery app for the Slides backend, OPTIONAL, like the OIDC/Postgres extras.

Heavy work (LibreOffice import conversion) is dispatched to a worker so it never runs in the web
process. Config comes from Django settings under the ``CELERY_`` namespace. Without a broker,
settings set ``task_always_eager`` so dev/tests run tasks in-process with no Redis. This module
only imports when the ``celery`` extra is installed (see slides/__init__.py guard).
"""

import os

import configurations
from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "slides.settings")
os.environ.setdefault("DJANGO_CONFIGURATION", "Development")
# Settings are django-configurations Configuration classes; resolve them before Celery reads them.
configurations.setup()

app = Celery("slides")
# Read CELERY_* keys from Django settings, then discover tasks.py in installed apps.
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
