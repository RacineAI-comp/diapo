# Production image for the Django Presentation API.
FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
# manage.py alone would default to Development; pin the whole container (migrate + gunicorn)
# to one configuration, overridable at runtime with -e DJANGO_CONFIGURATION=...
ENV DJANGO_CONFIGURATION=Production
WORKDIR /app
COPY . .
RUN pip install -e . gunicorn
# Non-root runtime user; /app stays writable for the SQLite volume and MEDIA_ROOT defaults.
RUN useradd --create-home --uid 1000 app && chown -R app:app /app
USER app
EXPOSE 8000
# migrate then serve. SQLite by default (mount a volume); wire Postgres via env for production.
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn slides.wsgi:application -b 0.0.0.0:8000 -w 3"]
