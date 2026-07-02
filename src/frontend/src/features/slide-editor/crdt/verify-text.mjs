// Headless proof that rich text converges, no browser needed.
// Two Y.Docs share the SAME text object; each edits its Y.XmlFragment (via text.js) and we
// exchange state. Both peers must converge to identical content. Run: node verify-text.mjs
import * as Y from 'yjs';
import { ensureFirstSlide, getSlideAt } from './slides.js';
import { addObject } from './scene.js';
import { getTextFragment, getPlainText, setPlainText, syncPlainTextMirror, BODY_KEY } from './text.js';

function sync(a, b) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}
let pass = 0, fail = 0;
const assert = (c, m) => (c ? (pass++, console.log('  ✓', m)) : (fail++, console.error('  ✗', m)));

const objMap = (doc, id) => getSlideAt(doc).get('objects').get(id);
// Append literal text into the first paragraph of a fragment (mimics typing at the end).
function appendText(fragment, str) {
  fragment.doc.transact(() => {
    let p = fragment.get(0);
    if (!(p instanceof Y.XmlElement)) {
      p = new Y.XmlElement('paragraph');
      fragment.insert(0, [p]);
    }
    p.insert(p.length, [new Y.XmlText(str)]);
  });
}

const A = new Y.Doc();
const B = new Y.Doc();
ensureFirstSlide(A);

// Create a text object with a legacy scalar value to prove one-time seeding.
const id = addObject(getSlideAt(A), { type: 'text', text: 'Hello' });
Y.applyUpdate(B, Y.encodeStateAsUpdate(A)); // seed B with the slide + object

// 1) getTextFragment returns a Y.XmlFragment and seeds from legacy scalar 'text'.
const fragA = getTextFragment(objMap(A, id));
assert(fragA instanceof Y.XmlFragment, 'getTextFragment returns a Y.XmlFragment');
assert(objMap(A, id).get(BODY_KEY) === fragA, `fragment stored under key '${BODY_KEY}'`);
assert(getPlainText(objMap(A, id)) === 'Hello', 'legacy scalar seeded into fragment');

// 2) The fragment (with seeded content) propagates A -> B.
sync(A, B);
const fragB = getTextFragment(objMap(B, id));
assert(fragB instanceof Y.XmlFragment, 'B resolves the same object fragment');
assert(getPlainText(objMap(B, id)) === 'Hello', 'seeded content propagates A->B');

// 3) Concurrent per-character edits on the SAME paragraph from both peers merge (no clobber).
appendText(fragA, ' from A');
appendText(fragB, ' from B');
sync(A, B);
const textA = getPlainText(objMap(A, id));
const textB = getPlainText(objMap(B, id));
assert(textA === textB, `concurrent edits converge to identical text: "${textA}"`);
assert(textA.includes('from A') && textA.includes('from B'), 'both peers’ insertions survive the merge');

// 4) The two docs are byte-for-byte identical after sync (full CRDT convergence).
const sameState = Y.equalSnapshots(Y.snapshot(A), Y.snapshot(B));
assert(sameState, 'docs converge to identical Yjs state');

// 5) Plain-text mirror helper keeps the legacy 'text' scalar in sync for thumbnails.
syncPlainTextMirror(objMap(A, id));
assert(objMap(A, id).get('text') === textA, 'syncPlainTextMirror refreshes legacy scalar mirror');

// 6) setPlainText replaces the body and stays convergent across peers.
setPlainText(objMap(A, id), 'Line 1\nLine 2');
sync(A, B);
assert(getPlainText(objMap(B, id)) === 'Line 1\nLine 2', 'setPlainText (multi-line) converges A->B');

console.log(`\n${fail ? '✗ ' + fail + ' FAILED' : '✓ all rich-text checks passed'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
