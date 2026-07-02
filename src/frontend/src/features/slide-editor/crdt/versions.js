// Version history (SCHEMA v2). Manual checkpoints stored in doc.getArray('versions') so they sync
// and persist in our own collab DB (sovereign, no external service). A snapshot is plain JSON of
// the slides + key deck meta. Restore rebuilds the deck from that JSON (rich text marks are
// flattened to plain text on restore, like duplicate, acceptable for a checkpoint).
import * as Y from 'yjs';
import { isDocReadOnly } from './guard.js';
import { getSlides, replaceSlides } from './slides.js';
import { getTitle, setTitle, getTheme, setTheme, getSlideSize, setSlideSize, getFooter, setFooter } from './deck.js';

const uuid = () => globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2);

export function getVersions(doc) {
  return doc.getArray('versions');
}

function metaSnapshot(doc) {
  const size = getSlideSize(doc);
  return { title: getTitle(doc), theme: getTheme(doc), size, footer: getFooter(doc) };
}

export function captureVersion(doc, label, author) {
  if (isDocReadOnly(doc)) return '';
  const versions = getVersions(doc);
  const snap = { slides: getSlides(doc).toJSON(), meta: metaSnapshot(doc) };
  const m = new Y.Map();
  const id = uuid();
  doc.transact(() => {
    m.set('id', id);
    m.set('label', label || 'Version');
    m.set('author', author || '');
    m.set('ts', Date.now());
    m.set('data', JSON.stringify(snap));
    versions.push([m]);
  });
  return id;
}

export function listVersions(doc) {
  const versions = getVersions(doc);
  const out = [];
  versions.forEach((m) => {
    if (m instanceof Y.Map) out.push({ id: m.get('id'), label: m.get('label') || 'Version', author: m.get('author') || '', ts: m.get('ts') || 0 });
  });
  out.sort((a, b) => b.ts - a.ts);
  return out;
}

export function restoreVersion(doc, id) {
  if (isDocReadOnly(doc)) return false;
  const versions = getVersions(doc);
  let raw = null;
  versions.forEach((m) => {
    if (m instanceof Y.Map && m.get('id') === id) raw = m.get('data');
  });
  if (!raw) return false;
  let snap;
  try {
    snap = JSON.parse(raw);
  } catch {
    return false;
  }
  replaceSlides(doc, snap.slides || [], { reid: false });
  const meta = snap.meta || {};
  if (meta.title != null) setTitle(doc, meta.title);
  if (meta.theme) setTheme(doc, meta.theme);
  if (meta.size) setSlideSize(doc, meta.size.w, meta.size.h);
  if (meta.footer) setFooter(doc, meta.footer);
  return true;
}

export function deleteVersion(doc, id) {
  if (isDocReadOnly(doc)) return;
  const versions = getVersions(doc);
  for (let i = 0; i < versions.length; i++) {
    if (versions.get(i).get('id') === id) {
      versions.delete(i, 1);
      return;
    }
  }
}
