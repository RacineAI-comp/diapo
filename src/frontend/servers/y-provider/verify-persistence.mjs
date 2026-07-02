// Proof that the collab server persists Y.Docs across restarts.
//
//   1. start the collab server (COLLAB_PORT=12005, a UNIQUE port, NOT 1234)
//   2. connect a HocuspocusProvider, write a value into the Y.Doc, wait for sync, disconnect
//   3. kill the server
//   4. restart the server (same SQLite file)
//   5. reconnect a fresh provider/doc and assert the value is still there
//
// Uses Node 22's global WebSocket (no `ws` dep). Run:
//   node servers/y-provider/verify-persistence.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(__dirname, 'server.mjs');
const PORT = 12005; // unique, NOT 1234
const DOC = 'persistence-test-doc';
const DB = resolve(__dirname, 'data', 'verify-persistence.sqlite');

const env = {
  ...process.env,
  COLLAB_PORT: String(PORT),
  COLLAB_DB_PATH: DB,
  // Auth deliberately OFF for this test (no backend), we test persistence only.
  COLLAB_BACKEND_URL: '',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const proc = spawn(process.execPath, [SERVER], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolveStart, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start in time')), 10000);
    proc.stdout.on('data', (d) => {
      if (d.toString().includes('listening on')) {
        clearTimeout(timer);
        resolveStart(proc);
      }
    });
    proc.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
    proc.on('exit', (code) => {
      if (code) console.error(`[server] exited with code ${code}`);
    });
  });
}

async function stopServer(proc) {
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

/** Connect, run `fn(ydoc)`, wait for a sync round-trip, then disconnect. */
async function withProvider(fn) {
  const ydoc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: `ws://127.0.0.1:${PORT}`,
    name: DOC,
    document: ydoc,
    // Node has global WebSocket (Node 22); pass it explicitly for clarity.
    WebSocketPolyfill: WebSocket,
  });

  // Wait until the initial sync handshake completes.
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('provider sync timeout')), 10000);
    provider.on('synced', () => {
      clearTimeout(t);
      res();
    });
  });

  const result = fn ? fn(ydoc) : undefined;

  // Give the write time to flush to the server + extension.
  await sleep(800);

  provider.destroy();
  ydoc.destroy();
  return result;
}

let pass = 0;
let fail = 0;
const assert = (cond, msg) => {
  if (cond) {
    pass++;
    console.log('  ✓', msg);
  } else {
    fail++;
    console.error('  ✗', msg);
  }
};

async function main() {
  // Clean slate.
  try {
    rmSync(DB, { force: true });
  } catch {
    /* ignore */
  }

  const MAGIC = `hello-${Date.now()}`;

  // --- Run 1: write -----------------------------------------------------------------------
  console.log('Run 1: start server, write a Y value, disconnect');
  let server = await startServer();
  await withProvider((ydoc) => {
    ydoc.getMap('meta').set('marker', MAGIC);
    ydoc.getArray('slides').push([{ id: 's1', title: 'Persisted slide' }]);
  });
  await stopServer(server);
  console.log('  server stopped');

  // --- Run 2: restart + read --------------------------------------------------------------
  console.log('Run 2: restart server, reconnect, assert the value survived');
  server = await startServer();
  const read = await withProvider((ydoc) => ({
    marker: ydoc.getMap('meta').get('marker'),
    slidesLen: ydoc.getArray('slides').length,
    firstTitle: ydoc.getArray('slides').get(0)?.title,
  }));
  await stopServer(server);
  console.log('  server stopped');

  console.log('  read back:', read);
  assert(read.marker === MAGIC, `Y.Map value persisted across restart (${read.marker})`);
  assert(read.slidesLen === 1, 'Y.Array length persisted across restart');
  assert(read.firstTitle === 'Persisted slide', 'Y.Array item content persisted across restart');

  // Cleanup the test DB.
  try {
    rmSync(DB, { force: true });
  } catch {
    /* ignore */
  }

  console.log(`\n${fail ? `✗ ${fail} FAILED` : '✓ persistence verified'} (${pass} passed)`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error('verify-persistence crashed:', err);
  process.exit(1);
});
