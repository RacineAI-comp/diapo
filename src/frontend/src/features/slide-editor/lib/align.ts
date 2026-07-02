// Alignment, distribution and grouping helpers for multi-selection. All operate on the live scene
// (listObjects) and write back through setProps, in a single transaction per op (one undo step).
import { listObjects, setProps } from '../crdt/scene.js';
import type { SlideObjectView, YSlide } from '../crdt/scene';

type Edge = 'left' | 'centerH' | 'right' | 'top' | 'middle' | 'bottom';

function selected(slide: YSlide, ids: string[]): SlideObjectView[] {
  const set = new Set(ids);
  return listObjects(slide).filter((o) => set.has(o.id));
}

export function align(slide: YSlide, ids: string[], edge: Edge): void {
  const objs = selected(slide, ids);
  if (objs.length < 2) return;
  const left = Math.min(...objs.map((o) => o.x));
  const right = Math.max(...objs.map((o) => o.x + o.w));
  const top = Math.min(...objs.map((o) => o.y));
  const bottom = Math.max(...objs.map((o) => o.y + o.h));
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const doc = slide.doc;
  const run = () => {
    for (const o of objs) {
      if (edge === 'left') setProps(slide, o.id, { x: Math.round(left) });
      else if (edge === 'right') setProps(slide, o.id, { x: Math.round(right - o.w) });
      else if (edge === 'centerH') setProps(slide, o.id, { x: Math.round(cx - o.w / 2) });
      else if (edge === 'top') setProps(slide, o.id, { y: Math.round(top) });
      else if (edge === 'bottom') setProps(slide, o.id, { y: Math.round(bottom - o.h) });
      else if (edge === 'middle') setProps(slide, o.id, { y: Math.round(cy - o.h / 2) });
    }
  };
  doc ? doc.transact(run) : run();
}

// Distribute the gaps between objects evenly along an axis.
export function distribute(slide: YSlide, ids: string[], axis: 'h' | 'v'): void {
  const objs = selected(slide, ids);
  if (objs.length < 3) return;
  const sorted = [...objs].sort((a, b) => (axis === 'h' ? a.x - b.x : a.y - b.y));
  const size = (o: SlideObjectView) => (axis === 'h' ? o.w : o.h);
  const start = axis === 'h' ? sorted[0].x : sorted[0].y;
  const lastObj = sorted[sorted.length - 1];
  const end = axis === 'h' ? lastObj.x + lastObj.w : lastObj.y + lastObj.h;
  const totalSize = sorted.reduce((s, o) => s + size(o), 0);
  const gap = (end - start - totalSize) / (sorted.length - 1);
  const doc = slide.doc;
  const run = () => {
    let cursor = start;
    for (const o of sorted) {
      if (axis === 'h') setProps(slide, o.id, { x: Math.round(cursor) });
      else setProps(slide, o.id, { y: Math.round(cursor) });
      cursor += size(o) + gap;
    }
  };
  doc ? doc.transact(run) : run();
}

const groupId = () => 'g-' + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

export function groupObjects(slide: YSlide, ids: string[]): void {
  if (ids.length < 2) return;
  const g = groupId();
  const doc = slide.doc;
  const run = () => ids.forEach((id) => setProps(slide, id, { group: g }));
  doc ? doc.transact(run) : run();
}

export function ungroupObjects(slide: YSlide, ids: string[]): void {
  const doc = slide.doc;
  const run = () => ids.forEach((id) => setProps(slide, id, { group: undefined }));
  doc ? doc.transact(run) : run();
}

// All object ids sharing a group with any of the given ids (for click-selects-whole-group).
export function expandGroups(slide: YSlide, ids: string[]): string[] {
  const objs = listObjects(slide);
  const groups = new Set(objs.filter((o) => ids.includes(o.id) && o.group).map((o) => o.group));
  if (!groups.size) return ids;
  const out = new Set(ids);
  for (const o of objs) if (o.group && groups.has(o.group)) out.add(o.id);
  return [...out];
}
