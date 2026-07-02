// Reference schema for the Yjs scene graph used by the slide editor. There is no off-the-shelf
// Yjs binding for a 2D positioned-object canvas, so we define our own shared types. Granularity
// rule: put every independently-editable field in its own map key so concurrent edits to
// *different* props of the same object merge instead of clobber.
//
// The runtime types live in src/frontend/src/features/slide-editor/crdt. Text inside boxes binds
// via y-prosemirror.
import type * as Y from 'yjs';

// Root: ydoc.getArray<Slide>('slides'), ordered list of slides.
export type Presentation = Y.Array<Slide>;

// A slide is a Y.Map:
//   'id'        : string
//   'background': string
//   'objects'   : Y.Map<objectId, SlideObject>   (unordered bag of objects)
//   'zorder'    : Y.Array<objectId>              (z-order = array order; sequence-CRDT converges)
export type Slide = Y.Map<unknown>;

// An object is a Y.Map of scalar keys (+ a Y.XmlFragment for text bodies):
//   type, x, y, w, h, rotation, fill, stroke, strokeWidth, src, text(Y.XmlFragment)
export type SlideObject = Y.Map<unknown>;

export type SlideObjectType = 'text' | 'rect' | 'ellipse' | 'image' | 'line';

/** Logical (non-CRDT) view of an object, for components/typing. */
export interface SlideObjectView {
  id: string;
  type: SlideObjectType;
  x: number; y: number; w: number; h: number; rotation: number; // own keys → merge cleanly
  fill?: string; stroke?: string; strokeWidth?: number;
  src?: string;                 // image: S3 key
  // text body is a Y.XmlFragment edited via y-prosemirror, not a scalar string
}

// Concurrency contract (the load-bearing decisions):
// - move/resize/rotate  → object.set('x'|'y'|'w'|'h'|'rotation', n): last-writer-wins PER KEY.
//                         two users on different objects, or move-vs-recolor same object, merge.
// - z-order             → reorder = delete+insert in slide 'zorder' (Y.Array, converges).
// - add object          → objects.set(uuid, map); zorder.push(uuid). UUIDv4 client-side ids.
// - delete object       → objects.delete(uuid); remove uuid from zorder.
// - slide add/del/move  → operations on the top-level Y.Array<Slide>.
// - rich text           → per-object Y.XmlFragment + Tiptap/y-prosemirror (per-char CRDT).
//
// Backend (Python) reads/writes the SAME doc via `pycrdt` (thumbnails, PPTX/PDF export,
// AI-generated decks). Node collab side uses plain `yjs`. Both share the binary update format.

export interface SceneOps {
  addObject(slide: Slide, view: Omit<SlideObjectView, 'id'>): string; // returns new id
  deleteObject(slide: Slide, id: string): void;
  setProp<K extends keyof SlideObjectView>(slide: Slide, id: string, key: K, value: SlideObjectView[K]): void;
  reorder(slide: Slide, id: string, toIndex: number): void;
}
