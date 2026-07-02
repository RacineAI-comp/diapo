// Headless proof that deck-level ops (add/duplicate/delete/move) converge across peers.
// Two Y.Docs edited independently, then state exchanged. Run: node verify-deck.mjs
import * as Y from 'yjs';
import { addObject, setProp, listObjects } from './scene.js';
import {
  ensureFirstSlide,
  getSlides,
  getSlideAt,
  listSlideIds,
  addSlide,
  deleteSlide,
  duplicateSlide,
  moveSlide,
} from './slides.js';

function sync(a, b) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}
let pass = 0,
  fail = 0;
const assert = (c, m) => (c ? (pass++, console.log('  ✓', m)) : (fail++, console.error('  ✗', m)));
const converged = (a, b, m) => {
  const sameCount = getSlides(a).length === getSlides(b).length;
  const sameOrder = JSON.stringify(listSlideIds(a)) === JSON.stringify(listSlideIds(b));
  assert(sameCount && sameOrder, `${m}, converges (count + slide-id order)`);
};

const A = new Y.Doc(),
  B = new Y.Doc();
ensureFirstSlide(A);
Y.applyUpdate(B, Y.encodeStateAsUpdate(A)); // seed B with slide[0]
converged(A, B, 'initial seed');

// Put some objects on slide[0] so we can prove duplication copies them.
const s0 = getSlideAt(A, 0);
const r1 = addObject(s0, { type: 'rect', x: 10, y: 20, w: 100, h: 80, fill: '#abc' });
const t1 = addObject(s0, { type: 'text', x: 5, y: 5, text: 'hello' });
setProp(s0, r1, 'x', 42);
sync(A, B);

// 1) addSlide propagates
const initialCount = getSlides(A).length;
addSlide(A); // append at end
sync(A, B);
assert(getSlides(B).length === initialCount + 1, 'addSlide propagates A→B');
converged(A, B, 'after addSlide');

// 2) duplicateSlide deep-clones objects with NEW ids, inserted right after source
const dupAt = duplicateSlide(A, 0);
sync(A, B);
assert(dupAt === 1, 'duplicateSlide inserts directly after source');
const srcObjs = listObjects(getSlideAt(A, 0));
const dupObjs = listObjects(getSlideAt(A, 1));
assert(dupObjs.length === srcObjs.length, 'duplicate copies same object COUNT');
assert(
  JSON.stringify(dupObjs.map((o) => ({ ...o, id: undefined }))) ===
    JSON.stringify(srcObjs.map((o) => ({ ...o, id: undefined }))),
  'duplicate copies object PROPS + z-order (ignoring ids)',
);
const srcIds = new Set(srcObjs.map((o) => o.id));
assert(
  dupObjs.every((o) => !srcIds.has(o.id)),
  'duplicate uses fresh object UUIDs (no id collisions)',
);
assert(
  getSlideAt(A, 0).get('id') !== getSlideAt(A, 1).get('id'),
  'duplicate slide has a fresh slide UUID',
);
// Editing the duplicate must NOT bleed into the original (independent Y types).
setProp(getSlideAt(A, 1), dupObjs[0].id, 'x', -777);
sync(A, B);
assert(
  listObjects(getSlideAt(A, 0)).find((o) => o.id === r1)?.x === 42,
  'editing duplicate does not mutate the original (real deep clone)',
);
converged(A, B, 'after duplicateSlide');

// 3) moveSlide reorders and converges; ids preserved (move != re-id)
const before = listSlideIds(A);
moveSlide(A, 0, 2); // move first slide to index 2
sync(A, B);
const after = listSlideIds(A);
assert(after[2] === before[0], 'moveSlide places the slide at the target index');
assert(after.length === before.length, 'moveSlide preserves slide count');
assert(
  JSON.stringify([...after].sort()) === JSON.stringify([...before].sort()),
  'moveSlide preserves the same slide ids (no re-id, no loss)',
);
converged(A, B, 'after moveSlide');

// moved slide still carries its objects (clone preserved contents)
const movedObjs = listObjects(getSlideAt(A, 2));
assert(movedObjs.length === srcObjs.length, 'moved slide keeps its objects');

// 4) deleteSlide propagates and converges
const preDel = getSlides(A).length;
deleteSlide(A, 1);
sync(A, B);
assert(getSlides(B).length === preDel - 1, 'deleteSlide propagates A→B');
converged(A, B, 'after deleteSlide');

// 5) deleteSlide refuses to drop the last slide
while (getSlides(A).length > 1) deleteSlide(A, getSlides(A).length - 1);
deleteSlide(A, 0); // no-op: only one slide left
assert(getSlides(A).length === 1, 'deleteSlide keeps at least one slide');
sync(A, B);
converged(A, B, 'after delete-to-one');

// 6) concurrent moves on different peers still converge to the same order
addSlide(A);
addSlide(A);
sync(A, B); // both peers now have 3 slides
moveSlide(A, 0, 2);
moveSlide(B, 2, 0);
sync(A, B);
converged(A, B, 'concurrent moves on both peers');

console.log(`\n${fail ? '✗ ' + fail + ' FAILED' : '✓ all deck checks passed'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
