// Headless proof that the undo/redo wiring (useUndoRedo) actually works, no browser needed.
// We build a Y.UndoManager exactly like the hook does (tracking the slide's `objects` map AND
// `zorder` array, scoped to local origin `null`), then exercise add -> undo -> redo.
// Run: node src/features/slide-editor/crdt/verify-undo.mjs   (exits non-zero on failure)
import * as Y from 'yjs';
import { addObject, listObjects } from './scene.js';
import { ensureFirstSlide, getSlideAt } from './slides.js';

let pass = 0,
  fail = 0;
const assert = (c, m) => (c ? (pass++, console.log('  ✓', m)) : (fail++, console.error('  ✗', m)));
const objs = (slide) => listObjects(slide);

const doc = new Y.Doc();
ensureFirstSlide(doc);
const slide = getSlideAt(doc);

// Mirror useUndoRedo: track objects + zorder, local edits only (origin null).
const objects = slide.get('objects');
const zorder = slide.get('zorder');
const um = new Y.UndoManager([objects, zorder], {
  trackedOrigins: new Set([null]),
  // Match the hook: a 300ms capture window coalesces the rapid sub-ops of a single addObject
  // (objects.set + per-prop sets + zorder.push) into ONE undo step, like a real user action.
  captureTimeout: 300,
});

// 0) clean slate
assert(objs(slide).length === 0, 'starts with zero objects');
assert(um.canUndo() === false, 'canUndo false before any edit');
assert(um.canRedo() === false, 'canRedo false before any edit');

// 1) add -> canUndo true, object present
const id = addObject(slide, { type: 'rect', x: 10, y: 20, w: 100, h: 80 });
assert(
  objs(slide).some((o) => o.id === id),
  'addObject inserts the object',
);
assert(um.canUndo() === true, 'canUndo true after add');

// 2) undo removes it (both the objects entry and its zorder slot)
um.undo();
assert(
  !objs(slide).some((o) => o.id === id),
  'undo removes the object',
);
assert(zorder.toArray().indexOf(id) === -1, 'undo also removes the zorder entry');
assert(um.canUndo() === false, 'canUndo false after undoing the only edit');
assert(um.canRedo() === true, 'canRedo true after undo');

// 3) redo restores it (same id, same props, back in zorder)
um.redo();
const restored = objs(slide).find((o) => o.id === id);
assert(!!restored, 'redo restores the object');
assert(
  restored && restored.x === 10 && restored.y === 20 && restored.w === 100 && restored.h === 80,
  'redo restores the original props',
);
assert(zorder.toArray().indexOf(id) >= 0, 'redo restores the zorder entry');

console.log(`\n${fail ? '✗ ' + fail + ' FAILED' : '✓ all undo/redo checks passed'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
