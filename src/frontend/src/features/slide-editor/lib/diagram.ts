// SmartArt-style diagram layouts. Pure functions: parse an indented text list, then lay one of
// five diagram types out as plain NewObject specs (text boxes, rects, lines). insertDiagram
// (lib/insert.ts) turns the specs into real grouped scene objects; after insertion the diagram is
// ordinary editable content with no live binding to the source text.
import type { NewObject } from '../crdt/scene';

export type DiagramType = 'process' | 'cycle' | 'hierarchy' | 'pyramid' | 'list';

export interface DiagramItem {
  text: string;
  level: number; // indentation depth (two spaces or one tab per level); hierarchy uses it
}

// Hard cap so a pasted novel doesn't explode into hundreds of shapes (mirrored in the dialog help).
export const DIAGRAM_MAX_ITEMS = 30;

// One line per item; leading tabs or 2-space runs set the level. Levels are clamped so a child is
// never more than one deeper than its predecessor (keeps the hierarchy tree well formed).
export function parseDiagramText(src: string): DiagramItem[] {
  const items: DiagramItem[] = [];
  for (const raw of src.split('\n')) {
    if (!raw.trim()) continue;
    const indent = raw.match(/^[\t ]*/)?.[0] ?? '';
    let level = 0;
    for (const ch of indent) level += ch === '\t' ? 2 : 1;
    level = Math.floor(level / 2);
    const prev = items.length ? items[items.length - 1].level : -1;
    items.push({ text: raw.trim(), level: Math.min(level, prev + 1) });
  }
  return items.slice(0, DIAGRAM_MAX_ITEMS);
}

const FALLBACK_PALETTE = ['#1167d4', '#0f172a', '#64748b', '#0891b2', '#15803d', '#f0f1f2'];

// Text size tiers by node count, so labels stay readable as diagrams grow.
function fontSizeFor(n: number): number {
  return n <= 5 ? 18 : n <= 10 ? 15 : n <= 18 ? 13 : 11;
}

// Relative luminance of a #rgb/#rrggbb colour; picks a contrasting label colour.
function isDark(hex: string): boolean {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const s = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.55;
}
const textOn = (bg: string) => (isDark(bg) ? '#ffffff' : '#0f172a');

// A diagram node: a text object with a shape background, so it edits like any text box
// (double-click) and keeps its card look (same pattern as imported shape-with-text).
function node(text: string, x: number, y: number, w: number, h: number, bg: string, fontSize: number, extra: Partial<NewObject> = {}): NewObject {
  return {
    type: 'text',
    text,
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
    shapeFill: bg,
    fill: textOn(bg),
    radius: 8,
    align: 'center',
    valign: 'middle',
    fontSize,
    ...extra,
  };
}

// A straight connector between two points, as a native line object: the renderer draws lines
// horizontally through the box middle, so the box is centered on the segment and rotated.
function seg(x1: number, y1: number, x2: number, y2: number, color: string, arrow: boolean): NewObject {
  const len = Math.max(4, Math.hypot(x2 - x1, y2 - y1));
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return {
    type: 'line',
    stroke: color,
    strokeWidth: 2,
    arrowEnd: arrow,
    x: Math.round((x1 + x2) / 2 - len / 2),
    y: Math.round((y1 + y2) / 2 - 12),
    w: Math.round(len),
    h: 24,
    rotation: Math.round(angle * 10) / 10,
  };
}

interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
}
// Centered block occupying ~80% of the slide width, ~70% of its height.
function block(size: { w: number; h: number }): Block {
  return { x: size.w * 0.1, y: size.h * 0.15, w: size.w * 0.8, h: size.h * 0.7 };
}

// Horizontal boxes with arrow connectors, bending onto a second row (serpentine) past 5 items.
function layoutProcess(items: DiagramItem[], b: Block, palette: string[]): NewObject[] {
  const n = items.length;
  const fs = fontSizeFor(n);
  const rows = n > 5 ? 2 : 1;
  const perRow = Math.ceil(n / rows);
  const gap = perRow > 6 ? 20 : 36;
  const w = (b.w - (perRow - 1) * gap) / perRow;
  const h = Math.min(110, b.h / (rows === 1 ? 2 : 3));
  const rowGap = Math.min(90, b.h - 2 * h);
  const y0 = rows === 1 ? b.y + (b.h - h) / 2 : b.y + (b.h - 2 * h - rowGap) / 2;
  // Center of item i; second row runs right-to-left so consecutive items stay adjacent.
  const center = (i: number) => {
    const row = Math.floor(i / perRow);
    const col = row === 0 ? i : perRow - 1 - (i - perRow);
    return { cx: b.x + col * (w + gap) + w / 2, cy: y0 + row * (h + rowGap) + h / 2, row };
  };
  const out: NewObject[] = [];
  const accent = palette[0];
  for (let i = 0; i < n; i++) {
    const { cx, cy } = center(i);
    out.push(node(items[i].text, cx - w / 2, cy - h / 2, w, h, accent, fs));
  }
  for (let i = 0; i < n - 1; i++) {
    const a = center(i);
    const c = center(i + 1);
    if (a.row === c.row) {
      const dir = c.cx > a.cx ? 1 : -1;
      out.push(seg(a.cx + dir * (w / 2 + 3), a.cy, c.cx - dir * (w / 2 + 3), c.cy, accent, true));
    } else {
      out.push(seg(a.cx, a.cy + h / 2 + 3, c.cx, c.cy - h / 2 - 3, accent, true));
    }
  }
  return out;
}

// Items on an ellipse, arrows between consecutive centers (trimmed to stay clear of the boxes).
function layoutCycle(items: DiagramItem[], b: Block, palette: string[], size: { w: number; h: number }): NewObject[] {
  const n = items.length;
  const fs = fontSizeFor(n);
  const w = Math.min(180, Math.max(110, b.w / Math.max(3, Math.ceil(n / 2))));
  const h = Math.min(72, b.h / 4);
  const rx = b.w / 2 - w / 2;
  const ry = b.h / 2 - h / 2;
  const cx0 = size.w / 2;
  const cy0 = size.h / 2;
  const center = (i: number) => {
    const a = (-90 + (360 / n) * i) * (Math.PI / 180);
    return { cx: cx0 + rx * Math.cos(a), cy: cy0 + ry * Math.sin(a) };
  };
  const out: NewObject[] = [];
  for (let i = 0; i < n; i++) {
    const { cx, cy } = center(i);
    out.push(node(items[i].text, cx - w / 2, cy - h / 2, w, h, palette[i % Math.max(1, palette.length - 1)], fs));
  }
  // Fractional trim keeps the arrow between (not under) neighbours whatever the box sizes are.
  for (let i = 0; n > 1 && i < n; i++) {
    const a = center(i);
    const c = center((i + 1) % n);
    const lerp = (t: number) => ({ x: a.cx + (c.cx - a.cx) * t, y: a.cy + (c.cy - a.cy) * t });
    const p = lerp(0.32);
    const q = lerp(0.68);
    out.push(seg(p.x, p.y, q.x, q.y, palette[0], true));
  }
  return out;
}

interface TreeNode {
  item: DiagramItem;
  children: TreeNode[];
  cx?: number;
}
// Tree from indentation, parents centered over their leaf span, connector lines between levels.
function layoutHierarchy(items: DiagramItem[], b: Block, palette: string[]): NewObject[] {
  const roots: TreeNode[] = [];
  const stack: TreeNode[] = [];
  for (const item of items) {
    const tn: TreeNode = { item, children: [] };
    stack.length = item.level;
    if (item.level === 0) roots.push(tn);
    else stack[item.level - 1].children.push(tn);
    stack.push(tn);
  }
  const depth = Math.max(...items.map((i) => i.level)) + 1;
  const leaves = items.length ? countLeaves(roots) : 0;
  const fs = fontSizeFor(items.length);
  const rowH = b.h / depth;
  const h = Math.min(64, rowH * 0.62);
  const slotW = b.w / Math.max(1, leaves);
  const w = Math.min(200, slotW * (leaves === 1 ? 0.6 : 1) - 10);
  // Post-order: leaves take successive slots, parents center over their children.
  let leaf = 0;
  const place = (tn: TreeNode): number => {
    if (!tn.children.length) {
      tn.cx = b.x + leaf * slotW + slotW / 2;
      leaf += 1;
    } else {
      const xs = tn.children.map(place);
      tn.cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    }
    return tn.cx;
  };
  roots.forEach(place);
  const out: NewObject[] = [];
  const cyAt = (level: number) => b.y + level * rowH + rowH / 2;
  const walk = (tn: TreeNode) => {
    const level = tn.item.level;
    const bg = level === 0 ? palette[0] : palette[palette.length - 1];
    const extra = level === 0 ? {} : { stroke: palette[0], strokeWidth: 1 };
    out.push(node(tn.item.text, (tn.cx as number) - w / 2, cyAt(level) - h / 2, w, h, bg, fs, extra));
    for (const ch of tn.children) {
      out.push(seg(tn.cx as number, cyAt(level) + h / 2, ch.cx as number, cyAt(level + 1) - h / 2, palette[0], false));
      walk(ch);
    }
  };
  roots.forEach(walk);
  return out;
}
function countLeaves(nodes: TreeNode[]): number {
  let n = 0;
  for (const tn of nodes) n += tn.children.length ? countLeaves(tn.children) : 1;
  return n;
}

// Stacked bands, narrow at the top and widest at the bottom, one colour per band.
function layoutPyramid(items: DiagramItem[], b: Block, palette: string[]): NewObject[] {
  const n = items.length;
  const fs = fontSizeFor(n);
  const gap = 6;
  const h = Math.min(70, (b.h - (n - 1) * gap) / n);
  const y0 = b.y + (b.h - (n * h + (n - 1) * gap)) / 2;
  const cx = b.x + b.w / 2;
  const out: NewObject[] = [];
  for (let i = 0; i < n; i++) {
    const w = n === 1 ? b.w * 0.7 : b.w * (0.35 + 0.65 * (i / (n - 1)));
    out.push(node(items[i].text, cx - w / 2, y0 + i * (h + gap), w, h, palette[i % Math.max(1, palette.length - 1)], fs, { radius: 4 }));
  }
  return out;
}

// Emphasis grid: neutral cards with an accent left border, text left-aligned.
function layoutList(items: DiagramItem[], b: Block, palette: string[]): NewObject[] {
  const n = items.length;
  const fs = fontSizeFor(n);
  const cols = Math.min(4, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  const gap = 18;
  const w = (b.w - (cols - 1) * gap) / cols;
  const h = Math.min(120, (b.h - (rows - 1) * gap) / rows);
  const y0 = b.y + (b.h - (rows * h + (rows - 1) * gap)) / 2;
  const cardBg = palette[palette.length - 1];
  const out: NewObject[] = [];
  for (let i = 0; i < n; i++) {
    const x = b.x + (i % cols) * (w + gap);
    const y = y0 + Math.floor(i / cols) * (h + gap);
    // Accent bar behind the card's left edge; then the card itself (text box with padding).
    out.push({ type: 'rect', fill: palette[0], x: Math.round(x), y: Math.round(y), w: 6, h: Math.round(h), radius: 3 });
    out.push(node(items[i].text, x + 6, y, w - 6, h, cardBg, fs, { align: 'left', radius: 0, padLeft: 14 }));
  }
  return out;
}

// Entry point: items + slide size + theme palette in, grouped-object specs out.
export function layoutDiagram(
  type: DiagramType,
  items: DiagramItem[],
  size: { w: number; h: number },
  palette?: string[],
): NewObject[] {
  const capped = items.slice(0, DIAGRAM_MAX_ITEMS);
  if (!capped.length) return [];
  const pal = palette && palette.length >= 2 ? palette : FALLBACK_PALETTE;
  const b = block(size);
  switch (type) {
    case 'process':
      return layoutProcess(capped, b, pal);
    case 'cycle':
      return layoutCycle(capped, b, pal, size);
    case 'hierarchy':
      return layoutHierarchy(capped, b, pal);
    case 'pyramid':
      return layoutPyramid(capped, b, pal);
    case 'list':
      return layoutList(capped, b, pal);
  }
}
