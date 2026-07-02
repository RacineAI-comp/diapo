// Headless proof that the scene-graph CRDT converges, no browser needed.
// Two Y.Docs, edits applied independently, then state exchanged. Run: npm run verify:crdt
import * as Y from 'yjs';
import { addObject, setProp, listObjects, reorder, deleteObject } from './scene.js';
import { ensureFirstSlide, getSlideAt } from './slides.js';

function sync(a, b) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}
let pass = 0, fail = 0;
const assert = (c, m) => (c ? (pass++, console.log('  ✓', m)) : (fail++, console.error('  ✗', m)));
const objs = (d) => listObjects(getSlideAt(d));

const A = new Y.Doc(), B = new Y.Doc();
ensureFirstSlide(A);
Y.applyUpdate(B, Y.encodeStateAsUpdate(A)); // seed B with the initial slide

// 1) add propagates
const id1 = addObject(getSlideAt(A), { type: 'rect', x: 10, y: 10, w: 100, h: 100 });
sync(A, B);
assert(objs(B).some((o) => o.id === id1), 'add propagates A→B');

// 2) concurrent move of DIFFERENT objects: both survive
const id2 = addObject(getSlideAt(A), { type: 'ellipse', x: 0, y: 0 });
sync(A, B);
setProp(getSlideAt(A), id1, 'x', 999);
setProp(getSlideAt(B), id2, 'y', 777);
sync(A, B);
const fa = objs(A);
assert(
  fa.find((o) => o.id === id1).x === 999 && fa.find((o) => o.id === id2).y === 777,
  'concurrent moves of different objects both survive (merge, no clobber)',
);

// 3) concurrent edit of the SAME key: converges (last-writer-wins)
setProp(getSlideAt(A), id1, 'x', 111);
setProp(getSlideAt(B), id1, 'x', 222);
sync(A, B);
const xA = objs(A).find((o) => o.id === id1).x;
const xB = objs(B).find((o) => o.id === id1).x;
assert(xA === xB, `concurrent same-key edit converges (LWW) to ${xA}`);

// 4) z-order reorder converges to the same order on both peers
reorder(getSlideAt(A), id1, 0);
sync(A, B);
assert(
  JSON.stringify(objs(A).map((o) => o.id)) === JSON.stringify(objs(B).map((o) => o.id)),
  'z-order converges',
);

// 5) delete propagates
deleteObject(getSlideAt(A), id2);
sync(A, B);
assert(!objs(B).some((o) => o.id === id2), 'delete propagates');

console.log(`\n${fail ? '✗ ' + fail + ' FAILED' : '✓ all CRDT checks passed'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
