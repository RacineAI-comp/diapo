# Architecture

Diapo is a browser-based collaborative presentation editor. It has three runtime parts: a Next.js
frontend, a Django backend, and a Yjs collaboration server. They interoperate with the conventions
of La Suite numérique so the app can share single sign-on with the rest of the suite.

## Components

### Frontend (`src/frontend`)

A Next.js (App Router) React application. The editor renders a slide as a set of absolutely
positioned objects (text boxes, shapes, images, tables, charts) on a fixed-aspect canvas. Rich
text inside a text box is a TipTap editor bound to a Yjs fragment. Styling uses the `cunningham`
design system so the app matches the visual language of the suite.

Routes:

- `/` is the Diapo application: the deck dashboard, and the editor when a document is open
  (`/?doc=<id>`). `/home` is kept as a redirect for older links.
- Cross-app navigation uses the header launcher; a suite deployment injects its app list through
  `NEXT_PUBLIC_SUITE_APPS` (JSON array of `{name, icon, url, description}`).

### Collaboration server (`src/frontend/servers/y-provider`)

A Hocuspocus server that hosts the Yjs documents. On each websocket handshake it calls the backend
to authorize the connection (abilities) and it persists document updates through the backend, so
the collaboration replicas stay stateless. Multiple replicas share awareness and updates over Redis
pub/sub, which allows horizontal scaling.

### Backend (`src/backend`)

A Django 5 + Django REST Framework project. It owns the `Presentation` resource, computes per-user
abilities (retrieve / update / destroy / collaboration), and performs `.pptx` conversion. It boots
with SQLite and no external services for a zero-dependency local run; setting `DB_HOST` switches it
to PostgreSQL. Authentication is optional OIDC via `django-lasuite`; when it is not configured the
API is open, which is convenient for local development.

## Data model and the CRDT

The deck content lives authoritatively in a Yjs document, identified by the presentation UUID
(which doubles as the collaboration room name). The backend keeps the `Presentation` record
(title, owner, link role) and an optional content snapshot for rendering or export without the
collaboration server running.

The Yjs scene graph is a bespoke schema (see [crdt-schema.ts](crdt-schema.ts)). The guiding rule is
per-field granularity: every independently editable property sits under its own map key, so two
users editing different properties of the same object merge cleanly instead of overwriting each
other. Rich text inside a box is a `Y.XmlFragment` bound through y-prosemirror, with a derived
plain-text mirror kept for thumbnails and search.

## Identity

Users are keyed on the OIDC `sub` claim (a custom `User` model), mirroring the suite's identity
shape so a single sign-on session works across apps. Login, callback and logout are provided by
`django-lasuite`.

## PowerPoint import and export

Import parses `.pptx` natively with `python-pptx` and rebuilds editable slide objects and rich
text. For other formats, and as a fidelity fallback, the Celery worker renders pages to images
with LibreOffice and poppler. Export produces `.pptx` (via `pptxgenjs`)
and PDF (via `jspdf`). Some conversions are inherently lossy; the importer and exporter aim for
faithful, editable results rather than pixel-perfect round-trips.

## Sharing model

Access control is deliberately simple in v0.1, aligned with how upstream Docs handles link reach
and role:

- Ownerless decks (the no-auth local demo) are world-editable: anyone who can reach the instance
  can read and edit them.
- Owned decks are private to their owner, with one exception: anyone who has the deck URL gets the
  access defined by the deck's `link_role`. With `"reader"` (the default) the deck is read-only for
  link holders; with `"editor"` link holders can edit.
- Only the owner can change `link_role` or delete a deck.
- Listing only ever shows a user their own decks; a shared deck is reached by its URL, not through
  the dashboard.

There is currently no invitation or per-user ACL system beyond link sharing, and no "restricted,
link disabled" mode. These are candidates for later versions.

## Deployment shape

In production, TLS terminates at an ingress that forwards `X-Forwarded-Proto` and `X-Forwarded-Host`
to the backend. The `Production` configuration enforces secure cookies, HSTS and an explicit host
allow-list, and it refuses to start with the development secret key. PostgreSQL stores documents,
media lives on a shared filesystem volume (S3-compatible object storage is planned), and Redis
backs the cache, Celery and collaboration fan-out.
