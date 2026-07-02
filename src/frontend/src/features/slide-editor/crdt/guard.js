// Client-side write gate for read-only sessions. Docs registered here make every CRDT mutator
// (scene.js / slides.js / deck.js / comments.js / versions.js / text.js) a no-op, so the local
// replica cannot diverge from the server, which already drops writes from read-only connections.
// Rich-text editing is gated separately (Tiptap editable=false in TextBox).
const READ_ONLY_DOCS = new WeakSet();

export function setDocReadOnly(doc, readOnly) {
  if (!doc) return;
  if (readOnly) READ_ONLY_DOCS.add(doc);
  else READ_ONLY_DOCS.delete(doc);
}

export function isDocReadOnly(doc) {
  return !!doc && READ_ONLY_DOCS.has(doc);
}
