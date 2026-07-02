// The bespoke Yjs scene graph, made real (see apps/slides/docs/crdt-schema.ts for the design).
// Granularity rule: each independently-editable field is its own Y.Map key, so concurrent
// edits to different props of the same object merge instead of clobbering.
//
// Doc shape (SCHEMA v2):
//   doc.getArray('slides')                       -> ordered slides
//     slide: Y.Map { id, background, transition, layout, section, notes,
//                    objects: Y.Map<objectId, Y.Map<prop>>,
//                    zorder:  Y.Array<objectId> }  // z-order == array order
//   doc.getMap('meta')      -> deck title/theme/settings/footer/sections (deck.js)
//   doc.getMap('comments')  -> comment threads (comments.js)
import * as Y from 'yjs';
import { isDocReadOnly } from './guard.js';

// Object-level ops only. Deck/slide ops live in slides.js/deck.js; rich text in text.js.
const DEFAULTS = { type: 'rect', x: 0, y: 0, w: 200, h: 120, rotation: 0 };

// Props that carry a structured (object/array) value rather than a scalar. Stored as-is on the
// Y.Map (LWW per key), fine because they are edited as a whole (filters, crop, anim, chart data).
const STRUCTURED_KEYS = new Set([
  'filters', 'crop', 'anim', 'anims', 'data', 'cells', 'cellStyles', 'colWidths', 'rowHeights', 'gradSpec',
]);

// Every prop listObjects surfaces. Adding one here is all it takes to thread a new field through.
const VIEW_KEYS = [
  'type', 'x', 'y', 'w', 'h', 'rotation', 'fill', 'text', 'src', 'opacity', 'stroke', 'strokeWidth',
  'alt', 'ph', 'anim', 'anims', 'href', 'locked', 'group', 'shadow', 'shadowCss',
  'shape', 'radius', 'gradient', 'dash', 'arrowStart', 'arrowEnd',
  'customPath', 'pathW', 'pathH', 'gradSpec',
  'valign', 'fontFamily', 'fontSize', 'align', 'lineHeight', 'shapeFill',
  'padTop', 'padRight', 'padBottom', 'padLeft', 'autofit', 'nowrap',
  'lineHeightPx', 'spaceBefore', 'spaceAfter',
  'fit', 'flipH', 'flipV', 'filters', 'crop', 'mask',
  'rows', 'cols', 'cells', 'banding', 'cellStyles', 'colWidths', 'rowHeights',
  'chartType', 'stacked', 'data',
  'icon',
  'poster', 'autoplay', 'loop', 'muted', 'controls',
];

export function addObject(slide, view) {
  if (isDocReadOnly(slide.doc)) return '';
  const id = newId();
  const objects = slide.get('objects');
  const o = new Y.Map();
  objects.set(id, o); // integrate first
  for (const [k, v] of Object.entries({ ...DEFAULTS, ...view })) {
    if (v !== undefined) o.set(k, v);
  }
  slide.get('zorder').push([id]);
  return id;
}

export function deleteObject(slide, id) {
  if (isDocReadOnly(slide.doc)) return;
  const objects = slide.get('objects');
  if (objects.has(id)) objects.delete(id);
  const z = slide.get('zorder');
  const i = z.toArray().indexOf(id);
  if (i >= 0) z.delete(i, 1);
}

export function setProp(slide, id, key, value) {
  if (isDocReadOnly(slide.doc)) return;
  const o = slide.get('objects').get(id);
  if (o) o.set(key, value);
}

// Set several props atomically (one transaction → one undo step, one network update).
export function setProps(slide, id, patch) {
  if (isDocReadOnly(slide.doc)) return;
  const o = slide.get('objects').get(id);
  if (!o) return;
  const doc = slide.doc;
  const run = () => {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      o.set(k, v);
    }
  };
  if (doc) doc.transact(run);
  else run();
}

export function reorder(slide, id, toIndex) {
  if (isDocReadOnly(slide.doc)) return;
  const z = slide.get('zorder');
  const i = z.toArray().indexOf(id);
  if (i < 0) return;
  z.delete(i, 1);
  z.insert(Math.max(0, Math.min(toIndex, z.length)), [id]);
}

export function getObjectIds(slide) {
  return slide.get('zorder').toArray();
}

export function listObjects(slide) {
  const objects = slide.get('objects');
  const z = slide.get('zorder');
  const out = [];
  for (const id of z.toArray()) {
    const o = objects.get(id);
    if (!o) continue;
    const view = { id };
    for (const k of VIEW_KEYS) {
      const v = o.get(k);
      if (v !== undefined) view[k] = v;
    }
    if (view.rotation == null) view.rotation = 0;
    out.push(view);
  }
  return out;
}

// Animation read path with legacy fallback. `anims` (ordered list) wins when present; a legacy
// single `anim` surfaces as a one-item entrance list. Entries without a kind default to
// 'entrance'. Pure view-level helper shared by the inspector panel and the presenter.
export function effectiveAnims(view) {
  if (Array.isArray(view.anims)) return view.anims.map((a) => (a.kind ? a : { ...a, kind: 'entrance' }));
  if (view.anim) return [{ ...view.anim, kind: 'entrance' }];
  return [];
}

// Exported for callers that need to know which keys are structured (e.g. clone/import paths).
export { STRUCTURED_KEYS };

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2);
}
