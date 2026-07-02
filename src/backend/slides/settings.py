"""
Django settings for the Diapo backend, django-configurations Configuration classes
(same machinery as upstream La Suite "Docs"). Pick the class with DJANGO_CONFIGURATION
(Base / Development / Production); manage.py defaults to Development, wsgi.py/asgi.py default
to Production.

* Boots with ZERO external services (SQLite, no Keycloak/Postgres/Redis). In that default mode the
  Presentation API is AllowAny so the app runs with no authentication wired.
* OIDC / SSO via `django-lasuite` is wired ONLY from env. When `OIDC_OP_JWKS_ENDPOINT` is set AND
  the optional `oidc` extra is installed, the API requires an authenticated user.

Everything is overridable through environment variables so the same code runs locally and in prod.
"""

import os
from pathlib import Path

from configurations import Configuration

BASE_DIR = Path(__file__).resolve().parent.parent


def _env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _env_list(name: str, default: str = "") -> list[str]:
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


class Base(Configuration):
    """Shared settings (env-driven). Development/Production below select via DJANGO_CONFIGURATION."""

    # ----------------------------------------------------------------------------------
    # Core
    # ----------------------------------------------------------------------------------
    SECRET_KEY = os.environ.get(
        "DJANGO_SECRET_KEY",
        "dev-insecure-secret-key-change-me-in-production",  # local-only default
    )
    DEBUG = _env_bool("DJANGO_DEBUG", True)
    ALLOWED_HOSTS = _env_list("DJANGO_ALLOWED_HOSTS", "*")
    # The backend always sits behind a proxy (Next.js rewrites in dev, the ingress in prod), which
    # forwards the browser's host as X-Forwarded-Host. Honour it so build_absolute_uri (→ the OIDC
    # redirect_uri) uses the real browser origin, not the proxy target.
    USE_X_FORWARDED_HOST = _env_bool("USE_X_FORWARDED_HOST", True)

    INSTALLED_APPS = [
        "django.contrib.admin",
        "django.contrib.auth",
        "django.contrib.contenttypes",
        "django.contrib.sessions",
        "django.contrib.messages",
        "django.contrib.staticfiles",
        # Third party
        "rest_framework",
        "corsheaders",
        # Local
        "core",
    ]

    MIDDLEWARE = [
        "corsheaders.middleware.CorsMiddleware",
        "django.middleware.security.SecurityMiddleware",
        "django.contrib.sessions.middleware.SessionMiddleware",
        "django.middleware.common.CommonMiddleware",
        "django.middleware.csrf.CsrfViewMiddleware",
        "django.contrib.auth.middleware.AuthenticationMiddleware",
        "django.contrib.messages.middleware.MessageMiddleware",
        "django.middleware.clickjacking.XFrameOptionsMiddleware",
    ]

    ROOT_URLCONF = "slides.urls"

    TEMPLATES = [
        {
            "BACKEND": "django.template.backends.django.DjangoTemplates",
            "DIRS": [],
            "APP_DIRS": True,
            "OPTIONS": {
                "context_processors": [
                    "django.template.context_processors.request",
                    "django.contrib.auth.context_processors.auth",
                    "django.contrib.messages.context_processors.messages",
                ],
            },
        },
    ]

    WSGI_APPLICATION = "slides.wsgi.application"
    ASGI_APPLICATION = "slides.asgi.application"

    # ----------------------------------------------------------------------------------
    # Database, SQLite by default (zero external services); Postgres when DB_HOST is set.
    # ----------------------------------------------------------------------------------
    if os.environ.get("DB_HOST"):
        DATABASES = {
            "default": {
                "ENGINE": "django.db.backends.postgresql",
                "NAME": os.environ.get("DB_NAME", "slides"),
                "USER": os.environ.get("DB_USER", "slides"),
                "PASSWORD": os.environ.get("DB_PASSWORD", ""),
                "HOST": os.environ["DB_HOST"],
                "PORT": os.environ.get("DB_PORT", "5432"),
                "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", "60")),
                "OPTIONS": {
                    "connect_timeout": int(os.environ.get("DB_CONNECT_TIMEOUT", "5"))
                },
            }
        }
    else:
        DATABASES = {
            "default": {
                "ENGINE": "django.db.backends.sqlite3",
                "NAME": os.environ.get("DJANGO_DB_PATH", str(BASE_DIR / "db.sqlite3")),
            }
        }

    DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

    # Custom OIDC-first user model (sub-keyed), mirrors upstream La Suite's identity model.
    AUTH_USER_MODEL = "core.User"

    # ----------------------------------------------------------------------------------
    # Celery (OPTIONAL async offload), broker/result default to REDIS_URL.
    # ----------------------------------------------------------------------------------
    _REDIS_URL = os.environ.get("REDIS_URL", "")
    CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", _REDIS_URL)
    CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", _REDIS_URL)
    CELERY_TASK_ALWAYS_EAGER = not bool(CELERY_BROKER_URL)
    CELERY_TASK_SERIALIZER = "json"
    CELERY_RESULT_SERIALIZER = "json"
    CELERY_ACCEPT_CONTENT = ["json"]
    CELERY_TASK_TIME_LIMIT = int(os.environ.get("CELERY_TASK_TIME_LIMIT", "300"))

    # ----------------------------------------------------------------------------------
    # Observability, structured logs always; Sentry + Prometheus optional & env-gated.
    # ----------------------------------------------------------------------------------
    LOG_FORMAT = os.environ.get("LOG_FORMAT", "console")  # set "json" in production
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
    LOGGING = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "json": {"()": "slides.logging.JsonFormatter"},
            "console": {"format": "%(levelname)s %(name)s: %(message)s"},
        },
        "handlers": {
            "stdout": {
                "class": "logging.StreamHandler",
                "formatter": "json" if LOG_FORMAT == "json" else "console",
            }
        },
        "root": {"handlers": ["stdout"], "level": LOG_LEVEL},
    }

    AUTH_PASSWORD_VALIDATORS = []

    LANGUAGE_CODE = "en-us"
    LANGUAGES = [("en-us", "English"), ("fr-fr", "Français")]
    TIME_ZONE = "UTC"
    USE_I18N = True
    USE_TZ = True

    STATIC_URL = "static/"
    STATIC_ROOT = os.environ.get("DJANGO_STATIC_ROOT", str(BASE_DIR / "static"))

    MEDIA_URL = os.environ.get("MEDIA_URL", "/media/")
    MEDIA_ROOT = os.environ.get("MEDIA_ROOT", str(BASE_DIR / "media"))

    # ----------------------------------------------------------------------------------
    # CORS / CSRF
    # ----------------------------------------------------------------------------------
    CORS_ALLOW_CREDENTIALS = True
    # Explicit origin allowlist, never a wildcard (credentialed CORS + wildcard is an account
    # takeover primitive). Development narrows the default to the local frontend below.
    CORS_ALLOWED_ORIGINS = _env_list("CORS_ALLOWED_ORIGINS", "")
    CORS_ALLOW_ALL_ORIGINS = False
    CSRF_TRUSTED_ORIGINS = _env_list("CSRF_TRUSTED_ORIGINS", "")

    # Shared secret the collab (y-provider) server presents on server-to-server calls.
    Y_PROVIDER_API_KEY = os.environ.get("Y_PROVIDER_API_KEY", "")

    # ----------------------------------------------------------------------------------
    # Authentication, OPTIONAL OIDC via django-lasuite, AllowAny local fallback.
    # ----------------------------------------------------------------------------------
    _OIDC_REQUESTED = bool(os.environ.get("OIDC_OP_JWKS_ENDPOINT"))
    OIDC_ENABLED = False

    REST_FRAMEWORK = {
        "DEFAULT_AUTHENTICATION_CLASSES": [
            "rest_framework.authentication.SessionAuthentication",
        ],
        "DEFAULT_PERMISSION_CLASSES": [
            "rest_framework.permissions.AllowAny",
        ],
        "UNAUTHENTICATED_USER": "django.contrib.auth.models.AnonymousUser",
        "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
        "PAGE_SIZE": 20,
        "DEFAULT_THROTTLE_CLASSES": [
            "rest_framework.throttling.AnonRateThrottle",
            "rest_framework.throttling.UserRateThrottle",
        ],
        "DEFAULT_THROTTLE_RATES": {
            "anon": os.environ.get("THROTTLE_ANON_RATE", "1000/hour"),
            "user": os.environ.get("THROTTLE_USER_RATE", "5000/hour"),
            # ScopedRateThrottle scopes: heavy file endpoints (LibreOffice / object storage).
            "import": os.environ.get("THROTTLE_IMPORT_RATE", "20/hour"),
            "upload": os.environ.get("THROTTLE_UPLOAD_RATE", "60/hour"),
        },
    }

    AUTHENTICATION_BACKENDS = ["django.contrib.auth.backends.ModelBackend"]

    if _OIDC_REQUESTED:
        try:
            import lasuite.oidc_login

            OIDC_ENABLED = True
        except ImportError as exc:
            raise RuntimeError(
                "OIDC_OP_JWKS_ENDPOINT is set but the 'oidc' extra (django-lasuite) is not "
                "installed. Install with `pip install -e '.[oidc]'` or unset the env var to "
                "run in local AllowAny mode."
            ) from exc

    if OIDC_ENABLED:
        INSTALLED_APPS = [*INSTALLED_APPS, "lasuite.oidc_login"]
        # sub-keyed backend (same base impress uses).
        AUTHENTICATION_BACKENDS = [
            "core.oidc.SuiteOIDCBackend",
            *AUTHENTICATION_BACKENDS,
        ]
        # Browser logs in via the OIDC redirect → a Django session; the API + the collab server's
        # cookie-forwarded calls authenticate via that session cookie.
        REST_FRAMEWORK = {
            **REST_FRAMEWORK,
            "DEFAULT_AUTHENTICATION_CLASSES": [
                "rest_framework.authentication.SessionAuthentication",
            ],
            "DEFAULT_PERMISSION_CLASSES": [
                "rest_framework.permissions.IsAuthenticated",
            ],
        }

        OIDC_OP_JWKS_ENDPOINT = os.environ["OIDC_OP_JWKS_ENDPOINT"]
        OIDC_OP_AUTHORIZATION_ENDPOINT = os.environ.get(
            "OIDC_OP_AUTHORIZATION_ENDPOINT", ""
        )
        OIDC_OP_TOKEN_ENDPOINT = os.environ.get("OIDC_OP_TOKEN_ENDPOINT", "")
        OIDC_OP_USER_ENDPOINT = os.environ.get("OIDC_OP_USER_ENDPOINT", "")
        OIDC_OP_LOGOUT_ENDPOINT = os.environ.get("OIDC_OP_LOGOUT_ENDPOINT", "")
        OIDC_RP_CLIENT_ID = os.environ.get("OIDC_RP_CLIENT_ID", "")
        OIDC_RP_CLIENT_SECRET = os.environ.get("OIDC_RP_CLIENT_SECRET", "")
        OIDC_RP_SIGN_ALGO = os.environ.get("OIDC_RP_SIGN_ALGO", "RS256")
        OIDC_RP_SCOPES = os.environ.get("OIDC_RP_SCOPES", "openid email profile")
        OIDC_CREATE_USER = _env_bool("OIDC_CREATE_USER", True)
        OIDC_REDIRECT_ALLOWED_HOSTS = _env_list("OIDC_REDIRECT_ALLOWED_HOSTS", "")
        # django-lasuite's backend reads these DIRECTLY (no internal default), so they must exist:
        OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION = _env_bool(
            "OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION", True
        )
        OIDC_ALLOW_DUPLICATE_EMAILS = _env_bool("OIDC_ALLOW_DUPLICATE_EMAILS", False)
        OIDC_OP_URL = (
            os.environ.get("OIDC_OP_URL")
            or OIDC_OP_JWKS_ENDPOINT.split("/protocol/")[0]
        )
        OIDC_USERINFO_FULLNAME_FIELDS = _env_list(
            "OIDC_USERINFO_FULLNAME_FIELDS", "given_name,family_name"
        )
        OIDC_USERINFO_SHORTNAME_FIELD = os.environ.get(
            "OIDC_USERINFO_SHORTNAME_FIELD", "given_name"
        )
        OIDC_STORE_ID_TOKEN = _env_bool("OIDC_STORE_ID_TOKEN", True)
        LOGIN_REDIRECT_URL = os.environ.get("LOGIN_REDIRECT_URL", "/")
        LOGOUT_REDIRECT_URL = os.environ.get("LOGOUT_REDIRECT_URL", "/")
        LOGIN_REDIRECT_URL_FAILURE = os.environ.get(
            "LOGIN_REDIRECT_URL_FAILURE", LOGIN_REDIRECT_URL
        )

    @classmethod
    def setup(cls):
        """Env-gated optional integrations, run after the class is built (django-configurations)."""
        super().setup()
        # Sentry (self-hosted / in-region). Optional dependency; set SENTRY_DSN to enable.
        sentry_dsn = os.environ.get("SENTRY_DSN", "")
        cls.SENTRY_DSN = sentry_dsn
        if sentry_dsn:
            try:
                import sentry_sdk
                from sentry_sdk.integrations.django import DjangoIntegration

                sentry_sdk.init(
                    dsn=sentry_dsn,
                    integrations=[DjangoIntegration()],
                    traces_sample_rate=float(
                        os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.0")
                    ),
                    send_default_pii=False,
                    environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
                )
            except ImportError as exc:
                raise RuntimeError(
                    "SENTRY_DSN is set but sentry-sdk is not installed, install '.[observability]'."
                ) from exc
        # Prometheus /metrics, optional dep, env-gated.
        cls.METRICS_ENABLED = _env_bool("METRICS_ENABLED", False)
        if cls.METRICS_ENABLED:
            try:
                import django_prometheus

                cls.INSTALLED_APPS = [*cls.INSTALLED_APPS, "django_prometheus"]
                cls.MIDDLEWARE = [
                    "django_prometheus.middleware.PrometheusBeforeMiddleware",
                    *cls.MIDDLEWARE,
                    "django_prometheus.middleware.PrometheusAfterMiddleware",
                ]
            except ImportError as exc:
                raise RuntimeError(
                    "METRICS_ENABLED is set but django-prometheus is not installed, '.[observability]'."
                ) from exc


class Development(Base):
    """Local dev (default). DEBUG honours DJANGO_DEBUG (true by default in Base)."""

    # Local frontend origin(s). Dev usually talks same-origin through the Next.js /api rewrite,
    # so this only matters for direct cross-origin calls to :8000.
    CORS_ALLOWED_ORIGINS = _env_list("CORS_ALLOWED_ORIGINS", "http://localhost:3000")


class Production(Base):
    """Production settings. TLS terminates at the ingress, which forwards X-Forwarded-Proto.
    Secrets and allowed hosts come from the environment; the class fails fast at startup if the
    insecure development SECRET_KEY or a wildcard host list is left in place."""

    DEBUG = False

    # No wildcard host fallback in production: DJANGO_ALLOWED_HOSTS must be set explicitly.
    ALLOWED_HOSTS = _env_list("DJANGO_ALLOWED_HOSTS", "")

    # Never allow credentialed wildcard CORS in production.
    CORS_ALLOW_ALL_ORIGINS = False

    # HTTPS hardening.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = _env_bool("DJANGO_SECURE_SSL_REDIRECT", True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_HSTS_SECONDS = int(os.environ.get("DJANGO_SECURE_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

    @classmethod
    def setup(cls):
        super().setup()
        from django.core.exceptions import ImproperlyConfigured

        insecure_default = "dev-insecure-secret-key-change-me-in-production"
        if not cls.SECRET_KEY or cls.SECRET_KEY == insecure_default:
            raise ImproperlyConfigured(
                "DJANGO_SECRET_KEY must be set to a strong, unique value in production."
            )
        if not cls.ALLOWED_HOSTS:
            raise ImproperlyConfigured(
                "DJANGO_ALLOWED_HOSTS must be set in production (there is no wildcard fallback)."
            )
        # A production deployment without OIDC serves an anonymous, world-writable API. Refuse
        # to boot unless that is opted into explicitly (public demo instances).
        if not cls.OIDC_ENABLED and not _env_bool("DJANGO_ALLOW_ANONYMOUS_API", False):
            raise ImproperlyConfigured(
                "OIDC is not configured (OIDC_OP_JWKS_ENDPOINT unset). In production this "
                "would expose an unauthenticated API. Configure OIDC, or set "
                "DJANGO_ALLOW_ANONYMOUS_API=true to run a deliberately open demo instance."
            )
