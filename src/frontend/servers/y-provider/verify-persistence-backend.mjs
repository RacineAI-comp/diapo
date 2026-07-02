// Proof that the collab server persists Y.Docs THROUGH Django → the DB (Postgres in prod), i.e.
// the production persistence path, not local SQLite. Mirrors verify-persistence.mjs but with a
// real backend in the loop:
//
//   1. migrate + start Django (runserver, AllowAny, Y_PROVIDER_API_KEY set) on a temp DB
//   2. create a Presentation via the API → its UUID is the collab room
//   3. start the collab server pointed at Django (COLLAB_BACKEND_URL + Y_PROVIDER_API_KEY)
//   4. write a value, wait for the Database extension to store() it into Django
//   5. kill + restart the collab server (NOT Django, Django holds the durable state)
//   6. reconnect and assert the value survived (loaded back via Database.fetch from Django)
//   7. assert Django actually holds non-empty content at /api/v1.0/collab/<uuid>/
//
// Skips gracefully (exit 0) if the backend venv isn't present, so a node-only CI stays green.
//   node servers/y-provider/verify-persistence-backend.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(__dirname, 'server.mjs');
const BACKEND_DIR = process.env.BACKEND_DIR || resolve(__dirname, '../../../backend');
const BACKEND_PY = process.env.BACKEND_PY || resolve(BACKEND_DIR, '.venv/bin/python');

const DJANGO_PORT = 18077;
const COLLAB_PORT = 12006;
const KEY = 'verify-collab-secret';
const DB = resolve(tmpdir(), 'verify-backend-persistence.sqlite'); // outside the repo
const BACKEND_URL = `http://127.0.0.1:${DJANGO_PORT}`;

if (!existsSync(BACKEND_PY)) {
  console.log(`↷ skipped: backend venv not found at ${BACKEND_PY} (set BACKEND_PY to run).`);
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const djangoEnv = {
  ...process.env,
  DJANGO_DB_PATH: DB,
  DJANGO_DEBUG: '1',
  DJANGO_ALLOWED_HOSTS: '*',
  Y_PROVIDER_API_KEY: KEY,
  PYTHONUNBUFFERED: '1', // flush the "Starting development server" marker promptly
};

function run(cmd, args, env) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd: BACKEND_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('exit', (code) => (code ? rej(new Error(`${cmd} exited ${code}: ${out}`)) : res(out)));
  });
}

function startProc(cmd, args, env, readyMarker, cwd) {
  const proc = spawn(cmd, args, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`${cmd} did not start in time`)), 20000);
    const onData = (d) => {
      if (d.toString().includes(readyMarker)) {
        clearTimeout(timer);
        res(proc);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (code) => code && console.error(`[${cmd}] exited ${code}`));
  });
}

async function stop(proc) {
  if (!proc || proc.killed) return;
  await new Promise((r) => {
    proc.on('exit', r);
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL');
      r();
    }, 3000);
  });
}

function startCollab() {
  return startProc(
    process.execPath,
    [SERVER],
    {
      ...process.env,
      COLLAB_PORT: String(COLLAB_PORT),
      COLLAB_BACKEND_URL: BACKEND_URL,
      Y_PROVIDER_API_KEY: KEY,
    },
    'listening on',
  );
}

async function withProvider(room, fn) {
  const ydoc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: `ws://127.0.0.1:${COLLAB_PORT}`,
    name: room,
    document: ydoc,
    WebSocketPolyfill: WebSocket,
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('provider sync timeout')), 10000);
    provider.on('synced', () => {
      clearTimeout(t);
      res();
    });
  });
  const result = fn ? fn(ydoc) : undefined;
  await sleep(3000); // let the Database extension debounce-store into Django
  provider.destroy();
  ydoc.destroy();
  await sleep(800);
  return result;
}

let pass = 0;
let fail = 0;
const assert = (c, m) => (c ? (pass++, console.log('  ✓', m)) : (fail++, console.error('  ✗', m)));

let django;
let collab;
async function main() {
  rmSync(DB, { force: true });
  try {
    console.log('migrate + start Django');
    await run(BACKEND_PY, ['manage.py', 'migrate', '--no-input'], djangoEnv);
    django = await startProc(
      BACKEND_PY,
      ['manage.py', 'runserver', '--noreload', `127.0.0.1:${DJANGO_PORT}`],
      djangoEnv,
      'Starting development server',
      BACKEND_DIR,
    );
    await sleep(1500);

    console.log('create a Presentation via the API');
    const created = await fetch(`${BACKEND_URL}/api/v1.0/presentations/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Backend-persist deck' }),
    }).then((r) => r.json());
    const room = created.id;
    assert(!!room, `presentation created (room=${room})`);

    const MAGIC = `via-django-${Date.now()}`;

    console.log('Run 1: collab up, write, store → Django');
    collab = await startCollab();
    await withProvider(room, (ydoc) => {
      ydoc.getMap('meta').set('marker', MAGIC);
      ydoc.getArray('slides').push([{ id: 's1', title: 'Persisted via Django' }]);
    });
    await stop(collab);

    console.log('Run 2: restart collab (Django keeps state), reconnect, assert survived');
    collab = await startCollab();
    const read = await withProvider(room, (ydoc) => ({
      marker: ydoc.getMap('meta').get('marker'),
      len: ydoc.getArray('slides').length,
    }));
    await stop(collab);

    console.log('  read back:', read);
    assert(read.marker === MAGIC, `marker survived restart via Django (${read.marker})`);
    assert(read.len === 1, 'slides array survived restart via Django');

    const stored = await fetch(`${BACKEND_URL}/api/v1.0/collab/${room}/`, {
      headers: { 'X-Y-Provider-Key': KEY },
    }).then((r) => r.json());
    assert(
      typeof stored.content === 'string' && stored.content.length > 0,
      'Django holds non-empty Yjs content (Postgres-backed in prod)',
    );
  } finally {
    await stop(collab);
    await stop(django);
    rmSync(DB, { force: true });
  }

  console.log(`\n${fail ? `✗ ${fail} FAILED` : '✓ backend persistence verified'} (${pass} passed)`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error('verify-persistence-backend crashed:', err);
  stop(collab).then(() => stop(django)).finally(() => process.exit(1));
});
