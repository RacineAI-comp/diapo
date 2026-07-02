#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""

import os
import sys


def main():
    """Run administrative tasks."""
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "slides.settings")
    os.environ.setdefault("DJANGO_CONFIGURATION", "Development")
    try:
        # django-configurations' wrapper (reads DJANGO_CONFIGURATION → the Configuration class).
        from configurations.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django / django-configurations. Are you sure they're installed and "
            "available on your PYTHONPATH? Did you forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
