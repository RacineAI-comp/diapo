"""ASGI config for the Slides backend (django-configurations)."""

import os

from configurations.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "slides.settings")
os.environ.setdefault("DJANGO_CONFIGURATION", "Production")

application = get_asgi_application()
