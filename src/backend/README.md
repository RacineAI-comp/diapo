# Slides backend (Django 5 + DRF)

The backend for the collaborative slides editor. It provides the `Presentation` API that the
frontend reads and that the collaboration (y-provider) server consults to authorize websocket
connections. It follows the conventions of La Suite numérique "Docs".

It is local-first: it boots with SQLite and no Keycloak, PostgreSQL or Redis. In that default mode
the API is `AllowAny`, so the collaboration demo works without authentication. OIDC single sign-on
via `django-lasuite` is wired optionally from the environment (see [Authentication](#authentication)).

## Requirements

- Python 3.13
- [`uv`](https://docs.astral.sh/uv/) (or any virtualenv tool)

## Setup

```bash
cd src/backend
uv venv
uv pip install -e '.[dev]'          # core + dev tools (ruff, pytest)
# optional: OIDC login
# uv pip install -e '.[oidc]'
```

## Run

```bash
uv run python manage.py migrate     # creates ./db.sqlite3 (gitignored)
uv run python manage.py runserver 0.0.0.0:8000
```

API base: `http://localhost:8000/api/v1.0/`

| Method | Path | Action |
| --- | --- | --- |
| GET | `/presentations/` | list (paginated, scoped to own + ownerless decks) |
| POST | `/presentations/` | create |
| GET | `/presentations/<uuid>/` | retrieve |
| PUT | `/presentations/<uuid>/` | update |
| PATCH | `/presentations/<uuid>/` | partial_update |
| DELETE | `/presentations/<uuid>/` | destroy |
| GET | `/users/me/` | current user (reports `auth_enabled`) |

The list is paginated (DRF `PageNumberPagination`, 20 per page) and returns
`{"count", "next", "previous", "results"}`. It is scoped: authenticated users see their own
decks plus ownerless demo decks; anonymous users see only ownerless decks. Link-shared decks
stay retrievable by UUID but never appear in someone else's list.

When OIDC is enabled, `django-lasuite` also mounts `authenticate/`, `callback/` and `logout/` under
the same base, used by the frontend's login and logout controls.

Every serialized presentation includes an `abilities` map computed from
`Presentation.get_abilities(request.user)`:

```json
{
  "retrieve": true,
  "update": true,
  "partial_update": true,
  "destroy": true,
  "collaboration_auth": true
}
```

The abilities map is enforced by the API itself (object-level DRF permission), not just
serialized: a request whose action maps to a `false` ability gets a 403. Only the owner may
change `link_role` on an owned deck (a non-owner attempt is an explicit 403); ownerless demo
decks stay world-editable.

The presentation `id` is a UUIDv4 and is also the Yjs collaboration room name.

## Uploads and imports

`POST /upload/` (media): images png/jpg/gif/webp (max 25 MB, verified with Pillow), video
mp4/webm (max 100 MB) and audio mp3/ogg/wav/m4a (max 25 MB). Everything is matched on
extension AND content type; video/audio payloads are additionally magic-byte sniffed (ftyp,
EBML, ID3/frame sync, OggS, RIFF+WAVE), so a renamed payload is rejected. SVG is rejected on
purpose: it can carry scripts and uploads are served from the app origin. `POST /import/` (decks): max 50 MB; `.pptx`, `.ppt`, `.odp`,
`.pdf` only. Zip containers (`.pptx`/`.odp`) are budget-checked before decompression (500 MB
declared uncompressed max, 10k entries). Rendered imports are capped at 200 pages; longer
documents return the first 200 with `"truncated": true`.

Rate limits (all env-overridable): `THROTTLE_ANON_RATE` (default `1000/hour`),
`THROTTLE_USER_RATE` (`5000/hour`), `THROTTLE_IMPORT_RATE` (`20/hour`),
`THROTTLE_UPLOAD_RATE` (`60/hour`).

## Verify

```bash
uv run ruff check .
uv run python manage.py check
uv run python manage.py test
uv run python scripts/prove_abilities.py   # standalone in-memory ability proof
```

## Configuration

Settings use `django-configurations` classes selected by `DJANGO_CONFIGURATION`
(`Development` by default, `Production` for deployments). `Production` enforces secure cookies,
HSTS and an explicit `DJANGO_ALLOWED_HOSTS`, and refuses to start with the development secret key.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | dev key | required in production |
| `DJANGO_DEBUG` | `True` (dev) | `False` in production |
| `DJANGO_ALLOWED_HOSTS` | `*` (dev) | comma-separated; required in production |
| `DB_HOST` | empty | set to switch to PostgreSQL (`.[postgres]`); also reads `DB_NAME`/`DB_USER`/`DB_PASSWORD`/`DB_PORT` |
| `DJANGO_DB_PATH` | `./db.sqlite3` | SQLite path when `DB_HOST` is unset |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` (dev), empty (prod) | comma-separated explicit allowlist; wildcard CORS is never enabled |
| `DJANGO_ALLOW_ANONYMOUS_API` | `false` | **deliberate demo escape hatch**: lets `Production` boot without OIDC, serving an unauthenticated world-writable API; never set it on a real deployment |
| `THROTTLE_ANON_RATE` / `THROTTLE_USER_RATE` | `1000/hour` / `5000/hour` | global DRF throttles |
| `THROTTLE_IMPORT_RATE` / `THROTTLE_UPLOAD_RATE` | `20/hour` / `60/hour` | scoped throttles on `/import/` and `/upload/` |
| `Y_PROVIDER_API_KEY` | empty | shared secret with the collaboration server |
| `REDIS_URL` | empty | Celery broker/result default and collaboration fan-out |
| `CELERY_BROKER_URL` | `REDIS_URL` | set to offload conversion to a worker; empty runs tasks inline |

## Authentication

| Mode | Trigger | Behaviour |
| --- | --- | --- |
| Local | `OIDC_OP_JWKS_ENDPOINT` unset | `AllowAny`; anonymous users can edit |
| OIDC | `OIDC_OP_JWKS_ENDPOINT` set and `.[oidc]` installed | `IsAuthenticated`; `django-lasuite` OIDC backend |

If `OIDC_OP_JWKS_ENDPOINT` is set but the `oidc` extra is not installed, the project fails loudly at
startup rather than silently serving an open API. `django-lasuite` pulls `mozilla-django-oidc`; the
OIDC routes are `/api/v1.0/authenticate/`, `/api/v1.0/callback/` and `/api/v1.0/logout/`.

The `Production` configuration also refuses to boot when OIDC is NOT configured, unless
`DJANGO_ALLOW_ANONYMOUS_API=true` is set explicitly. That variable exists solely for public
demo instances that want the anonymous world-writable mode on purpose.

With authentication on, a deck that has an owner is private: only the owner edits unless its link
role is set to `editor`. Ownerless decks stay world-editable (the no-auth demo path).

For a one-command login stack, run the `full` docker compose profile from the repository root, which
imports the `slides` Keycloak realm (`config/keycloak/realm.json`, user `demo` / `demo`):

```bash
cp ../../.env.example ../../.env
docker compose --profile full --env-file ../../.env up
```

## Collaboration server

The collaboration server (`../frontend/servers/y-provider/server.mjs`) enforces authorization only
when `COLLAB_BACKEND_URL` is set. On each websocket handshake it forwards the browser cookie (and
the `X-Y-Provider-Key` shared secret when `Y_PROVIDER_API_KEY` is set on both sides) to:

```
GET ${COLLAB_BACKEND_URL}/api/v1.0/presentations/<documentName>/
```

It rejects the connection when `abilities.retrieve` is false and sets the document read-only when
`abilities.update` is false.

When both `COLLAB_BACKEND_URL` and `Y_PROVIDER_API_KEY` are set, the collaboration server persists
each deck's Yjs state through the backend (`/api/v1.0/collab/<uuid>/`, guarded by the shared secret)
so PostgreSQL is the durable source of truth and the collaboration replicas stay stateless.

## Async offload (Celery, optional)

`.pptx` conversion runs on a Celery worker when a broker is configured
(`uv pip install -e '.[celery]'` plus `CELERY_BROKER_URL`). With no broker, tasks run inline, so
development and tests need no Redis. Only the worker needs LibreOffice, not the web tier:

```bash
celery -A slides worker -l info
```

`docker compose up` wires the worker and Redis automatically.
