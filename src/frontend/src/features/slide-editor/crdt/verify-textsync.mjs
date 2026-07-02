// Proves the text-sync fix: a text object created by peer A shows its text on peer B, with no
// split-brain fragment. Reproduces the original bug (B saw the box but not the text).
import * as Y from 'yjs';
import { createTextObject, getPlainText, getTextFragment, BODY_KEY } from './text.js';
import { ensureFirstSlide, getSlideAt } from './slides.js';

let pass = 0,
  fail = 0;
const assert = (c, m) => (c ? (pass++, console.log('  ✓', m)) : (fail++, console.error('  ✗', m)));

const A = new Y.Doc();
const B = new Y.Doc();
ensureFirstSlide(A);
Y.applyUpdate(B, Y.encodeStateAsUpdate(A));
const sA = getSlideAt(A, 0);

// A creates a text object WITH initial content, object + body fragment in one transaction.
const id = createTextObject(sA, { type: 'text', x: 0, y: 0, w: 240, h: 60, text: 'Bonjour' });

// One update carries the object + body + seeded text together.
Y.applyUpdate(B, Y.encodeStateAsUpdate(A, Y.encodeStateVector(B)));
const mapB = getSlideAt(B, 0).get('objects').get(id);

assert(mapB != null, 'object reached peer B');
assert(mapB.get(BODY_KEY) instanceof Y.XmlFragment, 'body fragment arrived atomically with the object');
assert(getPlainText(mapB) === 'Bonjour', `peer B reads the text ("${getPlainText(mapB)}")`);

// B "renders": getTextFragment must reuse the synced fragment, never create a competing one.
const fragBefore = mapB.get(BODY_KEY);
assert(getTextFragment(mapB) === fragBefore, 'getTextFragment on B reuses the synced fragment (no split-brain)');

// A edits the text; B sees it.
const para = getTextFragment(sA.get('objects').get(id)).get(0); // <paragraph>
para.get(0).insert(7, ' le monde'); // append after "Bonjour"
Y.applyUpdate(B, Y.encodeStateAsUpdate(A, Y.encodeStateVector(B)));
assert(getPlainText(mapB) === 'Bonjour le monde', `edits sync A->B ("${getPlainText(mapB)}")`);

console.log(`\n${fail ? '✗ ' + fail + ' FAILED' : '✓ all text-sync checks passed'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
