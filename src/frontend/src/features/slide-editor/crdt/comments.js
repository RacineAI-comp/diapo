// Comment threads (SCHEMA v2). Stored in their own top-level map so they sync independently of the
// scene graph:
//
//   doc.getMap('comments'): Y.Map<threadId, Y.Map {
//     id, slideId, objectId?, resolved(bool), createdAt(number),
//     items: Y.Array<Y.Map{ id, author, color, text, ts }>
//   }>
//
// A thread anchors to a slide (slideId) and optionally an object (objectId). @mentions are parsed
// from item text at render time (no separate store needed).
import * as Y from 'yjs';
import { isDocReadOnly } from './guard.js';

const uuid = () => globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2);

export function getComments(doc) {
  return doc.getMap('comments');
}

// Create a thread + its first message in one transaction.
export function addThread(doc, { slideId, objectId, author, color, text }) {
  if (isDocReadOnly(doc)) return '';
  const threads = getComments(doc);
  const id = uuid();
  doc.transact(() => {
    const t = new Y.Map();
    threads.set(id, t);
    t.set('id', id);
    t.set('slideId', slideId);
    if (objectId) t.set('objectId', objectId);
    t.set('resolved', false);
    t.set('createdAt', Date.now());
    const items = new Y.Array();
    t.set('items', items);
    items.push([makeItem({ author, color, text })]);
  });
  return id;
}

export function addReply(doc, threadId, { author, color, text }) {
  if (isDocReadOnly(doc)) return;
  const t = getComments(doc).get(threadId);
  if (!(t instanceof Y.Map)) return;
  const items = t.get('items');
  if (items instanceof Y.Array) items.push([makeItem({ author, color, text })]);
}

export function setResolved(doc, threadId, resolved) {
  if (isDocReadOnly(doc)) return;
  const t = getComments(doc).get(threadId);
  if (t instanceof Y.Map) t.set('resolved', !!resolved);
}

export function deleteThread(doc, threadId) {
  if (isDocReadOnly(doc)) return;
  const threads = getComments(doc);
  if (threads.has(threadId)) threads.delete(threadId);
}

// Snapshot all threads (plain objects) for rendering, sorted by creation time.
export function listThreads(doc, { slideId } = {}) {
  const threads = getComments(doc);
  const out = [];
  threads.forEach((t) => {
    if (!(t instanceof Y.Map)) return;
    if (slideId && t.get('slideId') !== slideId) return;
    const items = t.get('items');
    out.push({
      id: t.get('id'),
      slideId: t.get('slideId'),
      objectId: t.get('objectId') || null,
      resolved: !!t.get('resolved'),
      createdAt: t.get('createdAt') || 0,
      items:
        items instanceof Y.Array
          ? items.map((it) => ({
              id: it.get('id'),
              author: it.get('author') || 'Anonyme',
              color: it.get('color') || '#64748b',
              text: it.get('text') || '',
              ts: it.get('ts') || 0,
            }))
          : [],
    });
  });
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out;
}

function makeItem({ author, color, text }) {
  const it = new Y.Map();
  it.set('id', uuid());
  it.set('author', author || 'Anonyme');
  it.set('color', color || '#64748b');
  it.set('text', text || '');
  it.set('ts', Date.now());
  return it;
}

// Parse @mentions from a comment body (returns the mentioned display-names).
export function parseMentions(text) {
  const out = [];
  const re = /@([\p{L}\p{N}_.-]+)/gu;
  let m;
  while ((m = re.exec(text || '')) !== null) out.push(m[1]);
  return out;
}
