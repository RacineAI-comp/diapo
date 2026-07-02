// End-to-end auth proof: real HocuspocusProvider clients -> auth-enabled collab server ->
// real Django abilities. Requires: Django on :8000, collab on :12099 with COLLAB_BACKEND_URL set.
// Also spawns a second collab server (allowlist set) to prove the websocket Origin gate.
// Env: OWNERLESS=<uuid> OWNED=<uuid>. Run: node servers/y-provider/verify-auth.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { HocuspocusProvider } from '@hocuspocus/provider';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(__dirname, 'server.mjs');

const URL = process.env.COLLAB_URL || 'ws://localhost:12099';
const BACKEND_URL = process.env.COLLAB_BACKEND_URL || 'http://localhost:8000';
const OWNERLESS = process.env.OWNERLESS;
const OWNED = process.env.OWNED;
const MISSING = '00000000-0000-0000-0000-000000000000';

// Second collab server, same backend, but with the Origin allowlist enabled.
const ORIGIN_PORT = 12098;
const ORIGIN_URL = `ws://localhost:${ORIGIN_PORT}`;
const GOOD_ORIGIN = 'http://localhost:3000';
const BAD_ORIGIN = 'http://evil.example';

// Polyfill that sends a fixed Origin header via Node's (undici) WebSocket header support;
// the plain global WebSocket sends no Origin, which covers the missing-header case.
const wsWithOrigin = (origin) =>
  class extends WebSocket {
    constructor(url) {
      super(url, { headers: { origin } });
    }
  };

const mk = (room) => new HocuspocusProvider({ url: URL, name: room, WebSocketPolyfill: WebSocket });
const mkOrigin = (room, origin) =>
  new HocuspocusProvider({
    url: ORIGIN_URL,
    name: room,
    WebSocketPolyfill: origin ? wsWithOrigin(origin) : WebSocket,
  });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const syncedWithin = (p, ms) =>
  Promise.race([
    new Promise((res) => (p.synced ? res(true) : p.on('synced', () => res(true)))),
    wait(ms).then(() => false),
  ]);

let pass = 0,
  fail = 0;
const assert = (c, m) => (c ? (pass++, console.log('  ✓', m)) : (fail++, console.error('  ✗', m)));

// 1) EDITABLE, ownerless deck: abilities.update=true -> writable, edits propagate.
{
  const a = mk(OWNERLESS);
  const b = mk(OWNERLESS);
  const sa = await syncedWithin(a, 6000);
  const sb = await syncedWithin(b, 6000);
  assert(sa && sb, 'ownerless: both peers authorized + connected');
  a.document.getMap('t').set('k', 'hello');
  await wait(900);
  assert(b.document.getMap('t').get('k') === 'hello', 'ownerless: write propagates (writable)');
  a.destroy();
  b.destroy();
}

// 2) READ-ONLY, owned deck, anonymous: abilities.update=false -> server drops our writes.
{
  const a = mk(OWNED);
  const b = mk(OWNED);
  const sa = await syncedWithin(a, 6000);
  const sb = await syncedWithin(b, 6000);
  assert(sa && sb, 'owned: both peers connect (retrieve allowed)');
  a.document.getMap('t').set('k', 'nope');
  await wait(1200);
  assert(
    b.document.getMap('t').get('k') === undefined,
    'owned: write does NOT propagate (read-only enforced by abilities.update=false)',
  );
  a.destroy();
  b.destroy();
}

// 3) REJECTED, nonexistent deck: Django 404 -> collab refuses the handshake.
{
  const a = mk(MISSING);
  const synced = await syncedWithin(a, 4000);
  assert(!synced, 'nonexistent: connection rejected (never syncs, fail-closed)');
  a.destroy();
}

// 4) ORIGIN ALLOWLIST: spawn a collab server with COLLAB_WS_ALLOWED_ORIGINS set, then prove
//    missing Origin -> rejected, wrong Origin -> rejected, allowed Origin -> connects + syncs.
{
  const proc = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      COLLAB_PORT: String(ORIGIN_PORT),
      COLLAB_BACKEND_URL: BACKEND_URL,
      COLLAB_WS_ALLOWED_ORIGINS: GOOD_ORIGIN,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('origin-test server did not start')), 10000);
    proc.stdout.on('data', (d) => {
      if (d.toString().includes('listening on')) {
        clearTimeout(t);
        res();
      }
    });
  });

  try {
    const none = mkOrigin(OWNERLESS, null);
    assert(!(await syncedWithin(none, 4000)), 'origin: missing Origin header rejected');
    none.destroy();

    const bad = mkOrigin(OWNERLESS, BAD_ORIGIN);
    assert(!(await syncedWithin(bad, 4000)), `origin: disallowed Origin rejected (${BAD_ORIGIN})`);
    bad.destroy();

    const good = mkOrigin(OWNERLESS, GOOD_ORIGIN);
    assert(await syncedWithin(good, 6000), `origin: allowed Origin connects (${GOOD_ORIGIN})`);
    good.destroy();
  } finally {
    proc.kill('SIGTERM');
  }
}

console.log(`\n${fail ? '✗ ' + fail + ' FAILED' : '✓ all auth checks passed'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
