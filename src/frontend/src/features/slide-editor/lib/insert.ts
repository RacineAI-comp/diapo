// High-level "insert an object" operations used by the ribbon Insert tab, the shape/icon flyouts
// and layout application. Each composes the low-level scene ops and returns the new object id so
// the caller can select it. Objects are centered on the current slide size.
import i18next from '../../../i18n';
import { addObject, listObjects } from '../crdt/scene.js';
import { createTextObject } from '../crdt/text.js';
import { getSlideSize } from '../crdt/deck.js';
import { setLayout } from '../crdt/slides.js';
import type { NewObject, ShapeKind, YSlide } from '../crdt/scene';
import { layoutById } from '../data/layouts';
import { DEFAULT_SLIDE } from '../crdt/deck.js';

function center(slide: YSlide, w: number, h: number) {
  const doc = slide.doc;
  const size = doc ? getSlideSize(doc) : DEFAULT_SLIDE;
  // Cascade successive inserts by a small step so they don't stack exactly on top of each other
  // (otherwise you can't tell them apart or click the lower ones). Wraps after a few steps.
  const step = (listObjects(slide).length % 6) * 16;
  return {
    x: Math.round((size.w - w) / 2) + step,
    y: Math.round((size.h - h) / 2) + step,
  };
}

export function insertText(slide: YSlide, partial: Partial<NewObject> = {}): string {
  const w = partial.w ?? 360;
  const h = partial.h ?? 80;
  return createTextObject(slide, { type: 'text', w, h, ...center(slide, w, h), ...partial });
}

export function insertShape(slide: YSlide, kind: ShapeKind): string {
  const w = 200;
  const h = 150;
  return addObject(slide, {
    type: kind === 'rect' || kind === 'ellipse' ? kind : 'shape',
    shape: kind,
    fill: '#1167d4',
    w,
    h,
    ...center(slide, w, h),
  });
}

export function insertLine(slide: YSlide, withArrow = false): string {
  const w = 240;
  const h = 0;
  return addObject(slide, {
    type: 'line',
    stroke: '#0f172a',
    strokeWidth: 3,
    arrowEnd: withArrow,
    w,
    h: 24,
    ...center(slide, w, 24),
  });
}

export function insertImage(slide: YSlide, src: string, w: number, h: number): string {
  return addObject(slide, { type: 'image', src, fit: 'contain', w, h, ...center(slide, w, h) });
}

export function insertVideo(slide: YSlide, src: string, alt?: string): string {
  const w = 640;
  const h = 360;
  return addObject(slide, { type: 'video', src, alt, fit: 'contain', controls: true, w, h, ...center(slide, w, h) });
}

export function insertAudio(slide: YSlide, src: string, alt?: string): string {
  const w = 320;
  const h = 56;
  return addObject(slide, { type: 'audio', src, alt, controls: true, w, h, ...center(slide, w, h) });
}

export function insertTable(slide: YSlide, rows = 3, cols = 3): string {
  const cells = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (r === 0 ? i18next.t('Col {{n}}', { n: c + 1 }) : '')),
  );
  const w = 480;
  const h = 220;
  return addObject(slide, {
    type: 'table',
    rows,
    cols,
    cells,
    banding: true,
    fill: '#f1f5f9',
    stroke: '#cbd5e1',
    w,
    h,
    ...center(slide, w, h),
  });
}

export function insertChart(slide: YSlide, chartType: NonNullable<NewObject['chartType']> = 'column'): string {
  const w = 460;
  const h = 300;
  return addObject(slide, {
    type: 'chart',
    chartType,
    data: {
      categories: [1, 2, 3, 4].map((n) => i18next.t('T{{n}}', { n })),
      series: [{ name: i18next.t('Série {{n}}', { n: 1 }), values: [12, 19, 9, 22] }],
    },
    w,
    h,
    ...center(slide, w, h),
  });
}

export function insertIcon(slide: YSlide, icon: string): string {
  const s = 96;
  return addObject(slide, { type: 'icon', icon, fill: '#1167d4', w: s, h: s, ...center(slide, s, s) });
}

// Insert a generated diagram (lib/diagram.ts specs) as real objects sharing one group id, in a
// single transaction (one undo step). The group id uses the same 'g-' scheme as lib/align.ts
// groupObjects, so click-select/move treats the diagram exactly like a user-made group.
export function insertDiagram(slide: YSlide, specs: NewObject[]): string[] {
  const g = 'g-' + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
  const ids: string[] = [];
  const doc = slide.doc;
  const run = () => {
    for (const spec of specs) {
      const view = { ...spec, group: g };
      ids.push(view.type === 'text' ? createTextObject(slide, view) : addObject(slide, view));
    }
  };
  if (doc) doc.transact(run);
  else run();
  return ids.filter(Boolean);
}

// Insert an object straight from a view snapshot (used by paste). Handles text bodies correctly.
export function insertFromView(slide: YSlide, view: NewObject): string {
  return view.type === 'text' ? createTextObject(slide, view) : addObject(slide, view);
}

// Duplicate an object in place (offset slightly). Text duplicates keep their plain content (rich
// marks are not deep-cloned here, acceptable for a quick duplicate; full clone is via the slide).
export function duplicateObject(slide: YSlide, id: string): string | null {
  const view = listObjects(slide).find((o) => o.id === id);
  if (!view) return null;
  const { id: _omit, ...rest } = view;
  const copy = { ...rest, x: view.x + 16, y: view.y + 16 } as NewObject;
  return view.type === 'text' ? createTextObject(slide, copy) : addObject(slide, copy);
}

// Resize a table object's grid, preserving existing cell text where it overlaps.
export function resizeTable(slide: YSlide, id: string, rows: number, cols: number): void {
  const o = (slide.get('objects') as { get(k: string): { get(k: string): unknown; set(k: string, v: unknown): void } | undefined }).get(id);
  if (!o) return;
  const r = Math.max(1, Math.min(20, rows));
  const c = Math.max(1, Math.min(12, cols));
  const old = (o.get('cells') as string[][] | undefined) || [];
  const next: string[][] = Array.from({ length: r }, (_, ri) =>
    Array.from({ length: c }, (_, ci) => old[ri]?.[ci] ?? (ri === 0 ? i18next.t('Col {{n}}', { n: ci + 1 }) : '')),
  );
  const doc = slide.doc;
  const run = () => {
    o.set('rows', r);
    o.set('cols', c);
    o.set('cells', next);
  };
  if (doc) doc.transact(run);
  else run();
}

// Stamp a layout's placeholders onto a slide (idempotent-ish: replaces nothing, just adds the
// placeholder text boxes and records the layout id). Placeholder coords assume the 960x540 design
// canvas and are scaled to the real slide size.
export function applyLayout(slide: YSlide, layoutId: string): void {
  const doc = slide.doc;
  const def = layoutById(layoutId);
  const size = doc ? getSlideSize(doc) : DEFAULT_SLIDE;
  const sx = size.w / DEFAULT_SLIDE.w;
  const sy = size.h / DEFAULT_SLIDE.h;
  const run = () => {
    setLayout(slide, layoutId);
    for (const p of def.placeholders) {
      createTextObject(slide, {
        type: 'text',
        ph: p.ph,
        // The prompt is a natural i18n key (French source); resolve it in the current language at
        // creation time (it becomes persisted slide content).
        text: i18next.t(p.prompt),
        x: Math.round(p.x * sx),
        y: Math.round(p.y * sy),
        w: Math.round(p.w * sx),
        h: Math.round(p.h * sy),
        fontSize: p.fontSize,
        align: p.align,
      });
    }
  };
  if (doc) doc.transact(run);
  else run();
}
