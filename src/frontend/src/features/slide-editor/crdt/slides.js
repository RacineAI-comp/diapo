// Deck-level CRDT operations.
// Object-level ops live in scene.js; rich-text helpers in text.js. Keep them separate.
import * as Y from 'yjs';
import { getTextFragment, getRichParagraphs, setRichParagraphs } from './text.js';
import { getDefaultBackground } from './deck.js';
import { isDocReadOnly } from './guard.js';

const uuid = () => globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2);

// Snapshot the rich paragraphs (formatting marks included) of every text object on a LIVE slide,
// keyed by object id. A clone rebuilds its bodies from this so move/duplicate keep bold, italic,
// colour, font, links and lists instead of reseeding flattened text from the plain-text mirror.
function richBodiesOf(slide) {
  const out = {};
  const objects = slide && slide.get('objects');
  if (!objects) return out;
  objects.forEach((o, id) => {
    if (o && typeof o.get === 'function' && o.get('type') === 'text') {
      out[id] = getRichParagraphs(o);
    }
  });
  return out;
}

export function getSlides(doc) {
  return doc.getArray('slides');
}

// Pass the doc so the new slide starts on the deck's effective default background (custom theme
// override, else the applied theme bg) instead of always white.
export function newSlide(doc) {
  const s = new Y.Map();
  s.set('id', uuid());
  s.set('background', doc ? getDefaultBackground(doc) : '#ffffff');
  s.set('objects', new Y.Map());
  s.set('zorder', new Y.Array());
  return s;
}

// Create slide[0] iff the deck is empty. Call only AFTER the provider has synced.
export function ensureFirstSlide(doc) {
  const slides = getSlides(doc);
  if (slides.length === 0 && !isDocReadOnly(doc)) slides.push([newSlide(doc)]);
  return slides;
}

export function getSlideAt(doc, index = 0) {
  const slides = getSlides(doc);
  return index >= 0 && index < slides.length ? slides.get(index) : null;
}

// Speaker notes (per slide), stored on the slide Y.Map under 'notes'.
export function getNotes(slide) {
  return (slide && slide.get('notes')) || '';
}
export function setNotes(slide, text) {
  if (slide && !isDocReadOnly(slide.doc)) slide.set('notes', text);
}

// Per-slide transition (SCHEMA v2): { type, duration } stored as a plain value under 'transition'.
export function getTransition(slide) {
  const t = slide && slide.get('transition');
  return t && typeof t === 'object' ? t : { type: 'none', duration: 400 };
}
export function setTransition(slide, transition) {
  if (slide && !isDocReadOnly(slide.doc)) slide.set('transition', transition);
}

// Per-slide layout id (SCHEMA v2), references a layout from the layout registry.
export function getLayout(slide) {
  return (slide && slide.get('layout')) || 'blank';
}
export function setLayout(slide, layoutId) {
  if (slide && !isDocReadOnly(slide.doc)) slide.set('layout', layoutId);
}

// Per-slide section membership (SCHEMA v2), references a section id from deck meta.
export function getSection(slide) {
  return (slide && slide.get('section')) || null;
}
export function setSection(slide, sectionId) {
  if (slide && !isDocReadOnly(slide.doc)) slide.set('section', sectionId);
}

export function listSlideIds(doc) {
  return getSlides(doc).map((sl) => sl.get('id'));
}

export function addSlide(doc, atIndex) {
  const slides = getSlides(doc);
  const i = atIndex == null ? slides.length : Math.max(0, Math.min(atIndex, slides.length));
  // Read-only: no insert; return a valid in-range index so navigation callers stay put.
  if (isDocReadOnly(doc)) return Math.max(0, Math.min(i, slides.length - 1));
  slides.insert(i, [newSlide(doc)]);
  return i;
}

export function deleteSlide(doc, index) {
  if (isDocReadOnly(doc)) return;
  const slides = getSlides(doc);
  if (index >= 0 && index < slides.length && slides.length > 1) slides.delete(index, 1);
}

// A live Y type can belong to only one parent, so it cannot be re-inserted elsewhere. To "move" or
// "duplicate" a slide we snapshot it with toJSON() and rebuild a fresh Y.Map tree from that plain
// data, optionally re-iding the slide and objects (for duplication) while preserving every prop and
// the z-order. Returns the rebuilt slide plus the rich bodies re-keyed to the clone's new object
// ids, so seedTextBodies can rebuild formatted text (see richBodiesOf / seedTextBodies).
function buildSlideFrom(json, { reid = false, rich = null } = {}) {
  const s = new Y.Map();
  s.set('id', reid ? uuid() : json.id ?? uuid());
  s.set('background', json.background ?? '#ffffff');
  // Preserve per-slide v2 props (notes/transition/layout/section) across move and duplicate.
  if (json.notes != null) s.set('notes', json.notes);
  if (json.transition != null) s.set('transition', json.transition);
  if (json.layout != null) s.set('layout', json.layout);
  if (json.section != null) s.set('section', json.section);

  const objects = new Y.Map();
  const zorder = new Y.Array();
  s.set('objects', objects);
  s.set('zorder', zorder);

  const srcObjects = json.objects ?? {};
  const srcZorder = Array.isArray(json.zorder) ? json.zorder : [];
  // Map old object id -> new id so the z-order stays consistent after re-iding.
  const idMap = new Map();
  for (const oldId of Object.keys(srcObjects)) {
    idMap.set(oldId, reid ? uuid() : oldId);
  }
  const richByNewId = {};
  for (const [oldId, props] of Object.entries(srcObjects)) {
    const newId = idMap.get(oldId);
    const o = new Y.Map();
    objects.set(newId, o); // integrate before populating
    // Copy every prop except 'body': a serialized Y.XmlFragment cannot be re-set as a plain value.
    // The real body fragment is (re)built by seedTextBodies AFTER the slide is attached to the doc
    // (seeding a detached fragment throws), from the captured rich paragraphs when available and
    // otherwise from the copied plain-text mirror.
    for (const [k, v] of Object.entries(props)) {
      if (k === 'body') continue;
      o.set(k, v);
    }
    if (rich && rich[oldId]) richByNewId[newId] = rich[oldId];
  }
  // Preserve z-order; drop any dangling ids that have no matching object.
  for (const oldId of srcZorder) {
    const newId = idMap.get(oldId);
    if (newId != null && srcObjects[oldId] != null) zorder.push([newId]);
  }
  return { slide: s, rich: richByNewId };
}

// Build the body Y.XmlFragment for every text object on a slide that is ALREADY attached to a doc.
// When rich paragraphs were captured from the source (move/duplicate), rebuild the formatted text
// with its marks; otherwise seed from the plain-text mirror. Call inside the same transaction as the
// slide's insertion so a peer never sees a text object without its body (the y-prosemirror
// split-brain).
function seedTextBodies(slide, richByNewId = {}) {
  const objects = slide.get('objects');
  if (!objects) return;
  objects.forEach((o, id) => {
    if (!(o && typeof o.get === 'function' && o.get('type') === 'text')) return;
    const paras = richByNewId[id];
    if (paras && paras.length) setRichParagraphs(o, paras);
    else getTextFragment(o);
  });
}

// Reorder a slide by index. We clone the source slide's data, delete the original,
// then insert the rebuilt slide at the destination index (re-using its id).
export function moveSlide(doc, from, to) {
  if (isDocReadOnly(doc)) return;
  const slides = getSlides(doc);
  const len = slides.length;
  if (from < 0 || from >= len) return;
  const dest = Math.max(0, Math.min(to, len - 1));
  if (dest === from) return;

  const source = slides.get(from);
  const rich = richBodiesOf(source);
  const json = source.toJSON();
  const { slide: clone, rich: richByNewId } = buildSlideFrom(json, { reid: false, rich });
  doc.transact(() => {
    slides.delete(from, 1);
    // `dest` is the desired final index. After removing `from` the array length is
    // back to its original-minus-one, so inserting at `dest` lands it correctly for
    // moves in either direction (the elements between from and dest have shifted).
    slides.insert(Math.max(0, Math.min(dest, slides.length)), [clone]);
    seedTextBodies(clone, richByNewId);
  });
}

// Replace the entire deck with a list of slide JSON snapshots (used by version restore + import).
// Rebuilds real Y types from the plain data; preserves ids unless reid is set.
export function replaceSlides(doc, slidesJson, { reid = false } = {}) {
  if (isDocReadOnly(doc)) return;
  const slides = getSlides(doc);
  doc.transact(() => {
    slides.delete(0, slides.length);
    for (const s of slidesJson) {
      const { slide: c, rich: richByNewId } = buildSlideFrom(s, { reid });
      slides.push([c]);
      seedTextBodies(c, richByNewId);
    }
    if (slides.length === 0) slides.push([newSlide(doc)]);
  });
}

// Append slide JSON snapshots to the end of the deck (used by import-merge).
export function appendSlides(doc, slidesJson, { reid = true } = {}) {
  if (isDocReadOnly(doc)) return;
  const slides = getSlides(doc);
  doc.transact(() => {
    for (const s of slidesJson) {
      const { slide: c, rich: richByNewId } = buildSlideFrom(s, { reid });
      slides.push([c]);
      seedTextBodies(c, richByNewId);
    }
  });
}

// Deep-clone a slide (objects + z-order) into a fresh slide with new UUIDs,
// inserted directly after the source. Returns the index of the new slide.
export function duplicateSlide(doc, index) {
  const slides = getSlides(doc);
  if (index < 0 || index >= slides.length) return -1;
  // Read-only: no clone; return the source index so navigation callers stay put.
  if (isDocReadOnly(doc)) return index;
  const source = slides.get(index);
  const rich = richBodiesOf(source);
  const json = source.toJSON();
  const { slide: clone, rich: richByNewId } = buildSlideFrom(json, { reid: true, rich });
  const at = index + 1;
  doc.transact(() => {
    slides.insert(at, [clone]);
    seedTextBodies(clone, richByNewId);
  });
  return at;
}
