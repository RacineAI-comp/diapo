// Local Hocuspocus collab server for Diapo.
//
// Two responsibilities, both mirroring upstream Docs' servers/y-provider:
//
//  1. PERSISTENCE, Y.Docs survive a restart. Two backends, chosen by env:
//       • PRODUCTION (COLLAB_BACKEND_URL + Y_PROVIDER_API_KEY set): persist THROUGH Django via
//         the Database extension → Postgres is the source of truth (Presentation.content). The
//         collab server holds no durable state of its own, so replicas can come and go.
//       • LOCAL DEMO (otherwise): a gitignored SQLite file via @hocuspocus/extension-sqlite.
//
//  2. AUTH (env-gated), when COLLAB_BACKEND_URL is set, every websocket handshake forwards
//     the browser's Cookie to `${COLLAB_BACKEND_URL}/api/v1.0/presentations/<documentName>/`,
//     reads the returned `abilities`, rejects if !abilities.retrieve, and sets the Yjs doc
//     readOnly = !abilities.update. When COLLAB_BACKEND_URL is UNSET the server accepts every
//     connection (the zero-backend local demo path), exactly as before.
import { Server } from '@hocuspocus/server';
import { SQLite } from '@hocuspocus/extension-sqlite';
import { Database } from '@hocuspocus/extension-database';
import { Redis } from '@hocuspocus/extension-redis';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { hostname } from 'node:os';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const port = Number(process.env.COLLAB_PORT || 1234);

// --- Persistence ---------------------------------------------------------------------------
// Default to a gitignored file next to this server. Override with COLLAB_DB_PATH (":memory:"
// is honoured by the extension for ephemeral runs, e.g. tests).
const dbPath =
  process.env.COLLAB_DB_PATH || resolve(__dirname, 'data', 'collab.sqlite');

// Ensure the parent directory exists so sqlite3 can create the file (skip for :memory:).
if (dbPath !== ':memory:') {
  mkdirSync(dirname(dbPath), { recursive: true });
}

// --- Env-gated auth ------------------------------------------------------------------------
// Trim trailing slash so we can safely append the path.
const backendUrl = (process.env.COLLAB_BACKEND_URL || '').replace(/\/+$/, '');
const authEnabled = backendUrl.length > 0;

// Optional shared secret presented to the backend (mirrors upstream X-Y-Provider-Key).
const yProviderApiKey = process.env.Y_PROVIDER_API_KEY || '';

// --- WebSocket Origin allowlist (env-gated) --------------------------------------------------
// COLLAB_WS_ALLOWED_ORIGINS: comma-separated browser origins allowed to open a websocket,
// e.g. "http://localhost:3000,https://slides.example.com". When set, every handshake whose
// Origin header is absent or not in the list is rejected BEFORE auth runs. Note this also
// rejects non-browser clients (they send no Origin header); that is intentional, the collab
// websocket is meant for browsers only. When unset, no Origin check is performed.
const allowedOrigins = (process.env.COLLAB_WS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, '').toLowerCase())
  .filter(Boolean);
const originCheckEnabled = allowedOrigins.length > 0;

// Every fetch to the Django backend carries this timeout so a stuck backend cannot pin
// websocket handshakes or document loads forever.
const BACKEND_FETCH_TIMEOUT_MS = 10_000;

/**
 * Ask the Django backend whether this request may access the document, forwarding the
 * browser cookie. Returns the `abilities` object, or throws to reject the connection.
 */
async function fetchAbilities({ documentName, requestHeaders }) {
  const url = `${backendUrl}/api/v1.0/presentations/${encodeURIComponent(documentName)}/`;

  const headers = {};
  if (requestHeaders.cookie) headers.cookie = requestHeaders.cookie;
  if (requestHeaders.origin) headers.origin = requestHeaders.origin;
  if (yProviderApiKey) headers['X-Y-Provider-Key'] = yProviderApiKey;

  // Node 18+ / Node 22 has global fetch; no extra dep needed. The timeout keeps a hung
  // backend from stalling the handshake; the caller treats the abort as a backend error
  // and rejects the connection (fail closed).
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(BACKEND_FETCH_TIMEOUT_MS),
  });
  if (res.status !== 200) {
    throw new Error(`backend returned ${res.status} for ${documentName}`);
  }
  const doc = await res.json();
  if (!doc || typeof doc.abilities !== 'object' || doc.abilities === null) {
    throw new Error(`backend response missing abilities for ${documentName}`);
  }
  return doc.abilities;
}

// --- Persistence backend selection ---------------------------------------------------------
// Persist through Django (→ Postgres) only when we have BOTH a backend URL and the shared
// secret to authenticate the server-to-server calls; otherwise fall back to local SQLite.
const persistViaBackend = authEnabled && yProviderApiKey.length > 0;

/** Hocuspocus Database extension that loads/stores the Yjs binary state through the Django API. */
function backendDatabaseExtension() {
  const stateUrl = (name) =>
    `${backendUrl}/api/v1.0/collab/${encodeURIComponent(name)}/`;
  const headers = () => ({
    'X-Y-Provider-Key': yProviderApiKey,
    'content-type': 'application/json',
  });
  return new Database({
    // Return the stored Yjs update as a Uint8Array, or null for a brand-new document.
    fetch: async ({ documentName }) => {
      let res;
      try {
        res = await fetch(stateUrl(documentName), {
          headers: headers(),
          signal: AbortSignal.timeout(BACKEND_FETCH_TIMEOUT_MS),
        });
      } catch (error) {
        // Timeout or network failure: log and rethrow so Hocuspocus aborts the load
        // instead of starting an empty doc over the stored state.
        console.error(
          `✗ collab fetch failed for "${documentName}":`,
          error?.message ?? error,
        );
        throw new Error(`collab fetch failed for "${documentName}"`);
      }
      if (res.status === 404) return null; // unknown doc → start fresh
      if (res.status !== 200) {
        throw new Error(`collab fetch ${res.status} for "${documentName}"`);
      }
      const { content } = await res.json();
      return content ? new Uint8Array(Buffer.from(content, 'base64')) : null;
    },
    // Store the full Yjs state (base64) back into Postgres via Django.
    store: async ({ documentName, state }) => {
      let res;
      try {
        res = await fetch(stateUrl(documentName), {
          method: 'PUT',
          headers: headers(),
          body: JSON.stringify({ content: Buffer.from(state).toString('base64') }),
          signal: AbortSignal.timeout(BACKEND_FETCH_TIMEOUT_MS),
        });
      } catch (error) {
        // Timeout or network failure: log it; Hocuspocus retries the store on the
        // next debounced change, so the failure is not silent data loss.
        console.error(
          `✗ collab store failed for "${documentName}":`,
          error?.message ?? error,
        );
        throw new Error(`collab store failed for "${documentName}"`);
      }
      if (res.status !== 204 && res.status !== 200) {
        throw new Error(`collab store ${res.status} for "${documentName}"`);
      }
    },
  });
}

const extensions = [
  persistViaBackend ? backendDatabaseExtension() : new SQLite({ database: dbPath }),
];

// --- Horizontal scaling (env-gated) --------------------------------------------------------
// With REDIS_URL set, the Redis extension syncs awareness + document updates across replicas
// via pub/sub, so N stateless collab pods behave as one. Unset → single instance (dev/demo).
const redisUrl = process.env.REDIS_URL || '';
if (redisUrl) {
  const u = new URL(redisUrl); // redis://[:password@]host:port[/db]
  extensions.push(
    new Redis({
      host: u.hostname,
      port: Number(u.port || 6379),
      // new URL() keeps credentials percent-encoded; decode so passwords with special
      // characters (e.g. "p@ss" encoded as "p%40ss") reach Redis verbatim.
      options: u.password
        ? {
            password: decodeURIComponent(u.password),
            username: u.username ? decodeURIComponent(u.username) : undefined,
          }
        : undefined,
      // Unique per replica so a pod ignores its own echoed messages.
      identifier: `${hostname()}:${process.pid}`,
      prefix: 'slides',
    }),
  );
}

const server = new Server({
  port,
  name: 'slides-collab',
  extensions,

  // onConnect runs on the websocket handshake, before onAuthenticate. Throwing here closes
  // the connection. Only enforced when COLLAB_WS_ALLOWED_ORIGINS is set; a missing Origin
  // header (non-browser client) is then rejected too, see the allowlist comment above.
  async onConnect({ requestHeaders }) {
    if (!originCheckEnabled) return;

    const origin = (requestHeaders.origin || '')
      .trim()
      .replace(/\/+$/, '')
      .toLowerCase();
    if (!origin || !allowedOrigins.includes(origin)) {
      console.warn(
        `✗ collab origin: handshake rejected (origin=${requestHeaders.origin || '<none>'})`,
      );
      throw new Error('Origin not allowed');
    }
  },

  // onAuthenticate runs before the connection is accepted. We only enforce abilities when a
  // backend is configured; otherwise we don't register meaningful logic and accept everyone.
  async onAuthenticate({ documentName, requestHeaders, connectionConfig }) {
    if (!authEnabled) {
      // No backend: local demo mode. Accept and stay writable.
      return;
    }

    let abilities;
    try {
      abilities = await fetchAbilities({ documentName, requestHeaders });
    } catch (error) {
      console.error(
        `✗ collab auth: backend error for "${documentName}":`,
        error?.message ?? error,
      );
      // Reject, fail closed when auth is enabled.
      throw new Error('Backend error: Unauthorized');
    }

    if (!abilities.retrieve) {
      console.warn(`✗ collab auth: retrieve denied for "${documentName}"`);
      throw new Error('Wrong abilities: Unauthorized');
    }

    // Editors get a writable doc; everyone else is read-only.
    connectionConfig.readOnly = !abilities.update;

    console.log(
      `✔ collab auth: "${documentName}" connected (readOnly=${connectionConfig.readOnly})`,
    );
  },
});

server.listen();

const persistTarget = persistViaBackend
  ? `Postgres via ${backendUrl}/api/v1.0/collab/<id>/`
  : dbPath;

if (redisUrl) {
  console.log(`  ↔ Redis scaling on (${new URL(redisUrl).host}), replicas share state`);
}

if (originCheckEnabled) {
  console.log(`  ⛨ Origin allowlist on: ${allowedOrigins.join(', ')}`);
}

if (authEnabled) {
  console.log(
    `▶ Diapo collab (Hocuspocus) listening on ws://localhost:${port} ` +
      `[auth → ${backendUrl}/api/v1.0/presentations/<id>/, persist → ${persistTarget}]`,
  );
  if (!persistViaBackend) {
    console.warn(
      '  ⚠ COLLAB_BACKEND_URL set but Y_PROVIDER_API_KEY is empty → persisting to local SQLite, ' +
        'not Postgres. Set Y_PROVIDER_API_KEY (here AND on the backend) for durable shared state.',
    );
  }
  if (!originCheckEnabled) {
    console.warn(
      '  ⚠ COLLAB_WS_ALLOWED_ORIGINS not set → websocket Origin checking is DISABLED. ' +
        'Set it to your app origin(s), e.g. "https://slides.example.com", for production.',
    );
  }
} else {
  console.log(`▶ Diapo collab (Hocuspocus) listening on ws://localhost:${port}`);
  console.log(
    `  (no COLLAB_BACKEND_URL set → accepting all connections; persisting to ${dbPath})`,
  );
}
