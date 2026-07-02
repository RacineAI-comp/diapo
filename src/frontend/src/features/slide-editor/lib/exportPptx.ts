import pptxgen from 'pptxgenjs';
import i18next from '../../../i18n';
import type * as Y from 'yjs';
import { getSlides, getSlideAt } from '../crdt/slides.js';
import { listObjects } from '../crdt/scene.js';
import { getRichParagraphs } from '../crdt/text.js';
import type { RichParagraph } from '../crdt/text';
import { getSlideSize, getTitle } from '../crdt/deck.js';
import { fontStack } from '../data/fonts';
import type { ShapeKind, SlideObjectView } from '../crdt/scene';

const PXIN = 96;
const inch = (px: number) => px / PXIN;
// Colour → 6-digit hex. Handles '#rrggbb' AND 'rgb()/rgba()' (gradient stops carry rgba), so a
// gradient/translucent fill exports as a representative solid instead of the editor default.
const hex = (c?: string, fallback = 'DBEAFE'): string => {
  if (!c) return fallback;
  const s = c.trim();
  if (s.startsWith('#')) return s.replace('#', '').toUpperCase().slice(0, 6);
  const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) {
    const h = (n: string) => Math.max(0, Math.min(255, Math.round(parseFloat(n)))).toString(16).padStart(2, '0');
    return (h(m[1]) + h(m[2]) + h(m[3])).toUpperCase();
  }
  return fallback;
};
// First raw colour token in a CSS expression (e.g. a gradient string), or undefined. The caller
// runs it through hex(), do NOT pre-hex here (double-hexing drops it to the fallback).
const firstCssColor = (css?: string): string | undefined => {
  if (!css) return undefined;
  const m = css.match(/#[0-9a-fA-F]{6}|rgba?\([^)]*\)/);
  return m ? m[0] : undefined;
};

interface GradStops { kind: 'linear' | 'radial'; angle: number; stops: { color: string; pos: number }[] }

// Parse our own CSS gradient strings ("linear-gradient(<deg>deg, <color> <pos>%, …)" /
// "radial-gradient(circle, …)") into structured stops (pos 0..1) for canvas rendering.
function parseCssGradient(css: string): GradStops | undefined {
  const isRadial = css.includes('radial-gradient');
  const open = css.indexOf('(');
  const close = css.lastIndexOf(')');
  if (open < 0 || close < 0) return undefined;
  // Split on top-level commas only (rgba(...) carries internal commas).
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of css.slice(open + 1, close)) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  let angle = 180;
  let stopParts = parts;
  if (!isRadial && /deg/.test(parts[0])) { angle = parseFloat(parts[0]); stopParts = parts.slice(1); }
  else if (isRadial && /circle|ellipse|\bat\b/.test(parts[0])) stopParts = parts.slice(1);
  const stops = stopParts.map((p, i, arr) => {
    const mm = p.trim().match(/^(.*?)\s+([\d.]+)%$/);
    return mm ? { color: mm[1].trim(), pos: parseFloat(mm[2]) / 100 } : { color: p.trim(), pos: arr.length > 1 ? i / (arr.length - 1) : 0 };
  });
  return stops.length >= 2 ? { kind: isRadial ? 'radial' : 'linear', angle, stops } : undefined;
}

// Render a gradient-filled shape (rect / ellipse / custom path) to a PNG data-URL via canvas, so the
// real gradient + per-stop alpha survive export (pptxgenjs has no gradient fill). Translucent
// overlays (vignettes) and glow blobs then round-trip faithfully. Synchronous (no image loading).
function shapeGradientPng(o: SlideObjectView): string | undefined {
  const spec: GradStops | undefined = o.gradSpec
    ? { kind: o.gradSpec.kind, angle: o.gradSpec.angle, stops: o.gradSpec.stops.map((s) => ({ color: s.color, pos: s.pos / 100 })) }
    : o.gradient
      ? parseCssGradient(o.gradient)
      : undefined;
  if (!spec) return undefined;
  const w = Math.max(2, Math.round(o.w));
  const h = Math.max(2, Math.round(o.h));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) return undefined;
  let g: CanvasGradient;
  if (spec.kind === 'radial') {
    g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
  } else {
    const th = (spec.angle * Math.PI) / 180; // CSS: 0deg=to top, clockwise
    const sx = Math.sin(th);
    const cs = Math.cos(th);
    g = ctx.createLinearGradient(w / 2 - (sx * w) / 2, h / 2 + (cs * h) / 2, w / 2 + (sx * w) / 2, h / 2 - (cs * h) / 2);
  }
  for (const s of spec.stops) g.addColorStop(Math.max(0, Math.min(1, s.pos)), s.color);
  ctx.fillStyle = g;
  if (o.customPath && o.pathW && o.pathH) {
    ctx.scale(w / o.pathW, h / o.pathH);
    ctx.fill(new Path2D(o.customPath));
  } else if ((o.shape || o.type) === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
    ctx.fill();
  } else {
    ctx.fillRect(0, 0, w, h);
  }
  try {
    return cv.toDataURL('image/png');
  } catch {
    return undefined;
  }
}

// A shape's fill as a pptxgenjs ShapeFillProps. Imported transparent shapes (fill==='none', e.g. a
// bodyPr/noFill overlay) MUST export as no-fill, otherwise the editor default paints them opaque and
// they hide content beneath (this was turning whole dark backgrounds white on round-trip). A gradient
// (gradSpec/CSS) has no native pptxgenjs fill, so we export its representative first-stop colour.
function fillFor(o: SlideObjectView): { type: 'none' } | { color: string; transparency?: number } {
  if (o.fill === 'none') return { type: 'none' };
  const grad = o.gradSpec?.stops?.[0]?.color || firstCssColor(o.gradient);
  const color = hex(grad ?? o.fill);
  const transparency = o.opacity != null && o.opacity < 1 ? Math.round((1 - o.opacity) * 100) : undefined;
  return transparency != null ? { color, transparency } : { color };
}

// Slide background: solid '#rrggbb' → colour; 'url(data:…)' picture fill → image; gradient/other CSS
// → representative solid; absent → white.
function slideBackground(bg: string | undefined): pptxgen.BackgroundProps {
  if (!bg) return { color: 'FFFFFF' };
  const s = bg.trim();
  if (s.startsWith('#')) return { color: hex(s, 'FFFFFF') };
  const url = s.match(/url\(["']?(data:[^)"']+)["']?\)/);
  if (url) return { data: url[1] };
  const c = firstCssColor(s);
  return c ? { color: hex(c) } : { color: 'FFFFFF' };
}

// Map our shape kinds onto pptxgenjs ShapeType names (native OOXML shapes).
const SHAPE_MAP: Record<ShapeKind, string> = {
  rect: 'rect',
  roundRect: 'roundRect',
  ellipse: 'ellipse',
  triangle: 'triangle',
  diamond: 'diamond',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
  star: 'star5',
  arrowRight: 'rightArrow',
  arrowLeft: 'leftArrow',
  chevron: 'chevron',
  callout: 'wedgeRoundRectCallout',
  // Imported custom geometry has no native pptxgenjs preset; round-trip as a plain rect box.
  custom: 'rect',
};

// Imported custom geometry (a:custGeom) → pptxgenjs custom-shape `points`. The path `d` is in
// path-unit space (0..pathW × 0..pathH); pptxgenjs wants coordinates in INCHES relative to the
// shape's extent, so we scale by the object's px size. Cubic/quadratic curves map directly; arcs are
// approximated by a line to their end point (rare in practice). Returns [] if the path is unusable.
function customGeomPoints(o: SlideObjectView): Array<Record<string, unknown>> {
  const d = o.customPath;
  const pw = o.pathW;
  const ph = o.pathH;
  if (!d || !pw || !ph) return [];
  const sx = o.w / pw / PXIN;
  const sy = o.h / ph / PXIN;
  const X = (v: number) => +(v * sx).toFixed(4);
  const Y = (v: number) => +(v * sy).toFixed(4);
  const pts: Array<Record<string, unknown>> = [];
  const re = /([MLCQAZ])([^MLCQAZ]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const cmd = m[1].toUpperCase();
    const n = m[2].trim().split(/[\s,]+/).filter((t) => t !== '').map(Number);
    if (cmd === 'M') pts.push({ x: X(n[0]), y: Y(n[1]), moveTo: true });
    else if (cmd === 'L') pts.push({ x: X(n[0]), y: Y(n[1]) });
    else if (cmd === 'C') pts.push({ x: X(n[4]), y: Y(n[5]), curve: { type: 'cubic', x1: X(n[0]), y1: Y(n[1]), x2: X(n[2]), y2: Y(n[3]) } });
    else if (cmd === 'Q') pts.push({ x: X(n[2]), y: Y(n[3]), curve: { type: 'quadratic', x1: X(n[0]), y1: Y(n[1]) } });
    else if (cmd === 'A') pts.push({ x: X(n[5]), y: Y(n[6]) }); // arc → line to end point (approx)
    else if (cmd === 'Z') pts.push({ close: true });
    if (pts.length > 1200) return []; // pathologically complex, fall back to a rect box
  }
  return pts;
}

// Generate a .pptx from the deck's scene model, native OOXML via pptxgenjs (no LibreOffice for our
// own format). Tracks every object type so export stays in lockstep with the editor.
export async function exportDeckToPptx(doc: Y.Doc): Promise<void> {
  const pptx = new pptxgen();
  const size = getSlideSize(doc);
  pptx.defineLayout({ name: 'STAGE', width: inch(size.w), height: inch(size.h) });
  pptx.layout = 'STAGE';
  const title = getTitle(doc) || 'presentation';

  const n = getSlides(doc).length;
  for (let i = 0; i < n; i++) {
    const slide = getSlideAt(doc, i);
    if (!slide) continue;
    const s = pptx.addSlide();
    s.background = slideBackground(slide.get('background') as string | undefined);
    const objects = slide.get('objects') as Y.Map<Y.Map<unknown>> | undefined;

    for (const o of listObjects(slide)) {
      const pos = { x: inch(o.x), y: inch(o.y), w: inch(o.w), h: inch(o.h), rotate: o.rotation || 0 };
      const line = o.strokeWidth ? { color: hex(o.stroke, '0F172A'), width: o.strokeWidth } : { type: 'none' as const };

      if (o.type === 'text') {
        const runs = richRuns(getRichParagraphs(objects?.get(o.id)), o);
        if (runs.length)
          s.addText(runs, {
            ...pos,
            align: (o.align as 'left' | 'center' | 'right') || 'left',
            valign: (o.valign as 'top' | 'middle' | 'bottom') || 'middle',
          });
      } else if (o.type === 'image' && o.src) {
        s.addImage({ data: o.src, ...pos });
      } else if ((o.type === 'video' || o.type === 'audio') && o.src) {
        // Same-origin media -> base64 -> native addMedia. Oversize or unfetchable files are
        // skipped so the rest of the export survives (mirrors how charts degrade).
        const data = await fetchMediaData(o.src);
        if (data) {
          // Real file extension from the upload URL beats pptxgenjs' mime-subtype guess
          // (audio/mpeg would otherwise become a ".mpeg" part).
          const m = o.src.startsWith('data:') ? null : o.src.split('?')[0].match(/\.(mp4|webm|mp3|ogg|wav|m4a)$/i);
          s.addMedia({ type: o.type, data, extn: m ? m[1].toLowerCase() : undefined, x: pos.x, y: pos.y, w: pos.w, h: pos.h });
        }
      } else if (o.type === 'line') {
        s.addShape('line' as never, { ...pos, line: { color: hex(o.stroke, '0F172A'), width: o.strokeWidth || 3 } });
      } else if (o.type === 'icon') {
        s.addText(o.icon || '★', { ...pos, fontSize: Math.round(Math.min(o.w, o.h) * 0.5), align: 'center', valign: 'middle', color: hex(o.fill, '0F172A') });
      } else if (o.type === 'table') {
        addTable(s, o);
      } else if (o.type === 'chart') {
        addChart(pptx, s, o, pos);
      } else if (o.type === 'shape' && (o.gradSpec || o.gradient)) {
        // Gradient fill (incl. translucent vignettes / glow blobs) → rasterise to a PNG so the real
        // gradient + alpha survive (pptxgenjs has no gradient fill). Clips to the custom path/ellipse.
        const png = shapeGradientPng(o);
        if (png) {
          const transparency = o.opacity != null && o.opacity < 1 ? Math.round((1 - o.opacity) * 100) : undefined;
          s.addImage({ data: png, ...pos, transparency });
        } else {
          s.addShape('rect' as never, { ...pos, fill: fillFor(o), line });
        }
      } else if (o.type === 'shape' && o.customPath && o.pathW && o.pathH) {
        // Custom geometry → native OOXML custom shape (points), scaled from path-units to inches.
        const pts = customGeomPoints(o);
        if (pts.length) {
          s.addShape('custGeom' as never, { ...pos, points: pts as never, fill: fillFor(o), line });
        } else {
          s.addShape('rect' as never, { ...pos, fill: fillFor(o), line });
        }
      } else {
        // rect / ellipse / shape
        const kind = (o.shape || o.type) as ShapeKind;
        const shapeType = SHAPE_MAP[kind] || 'rect';
        s.addShape(shapeType as never, {
          ...pos,
          fill: fillFor(o),
          line,
          rectRadius: kind === 'roundRect' ? inch(o.radius ?? 18) : undefined,
        });
      }
    }
  }

  await pptx.writeFile({ fileName: `${title.replace(/[^\w.-]+/g, '_')}.pptx` });
}

// Cap on media embedded in a .pptx; larger files are skipped, not fetched into memory twice.
const MAX_MEDIA_EXPORT = 50 * 1024 * 1024;

// Fetch a same-origin media URL and return it as a data-URL for pptxgenjs addMedia, or null when
// the fetch fails / the file exceeds the export cap (the caller then skips the object).
async function fetchMediaData(src: string): Promise<string | null> {
  if (src.startsWith('data:')) {
    return src.length * 0.75 <= MAX_MEDIA_EXPORT ? src : null;
  }
  try {
    const resp = await fetch(src, { credentials: 'include' });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    if (blob.size > MAX_MEDIA_EXPORT) return null;
    return await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// First family name from a CSS stack (drop quotes/fallbacks): '"Inter", system-ui' -> 'Inter'.
function firstFamily(stack: string): string {
  return stack.split(',')[0].replace(/["']/g, '').trim();
}
// CSS px size -> PowerPoint points (96px/in, 72pt/in).
function ptFromCss(css: string | undefined, fallback: number): number {
  const n = css ? parseFloat(css) : NaN;
  return Number.isFinite(n) ? Math.round(n * 0.75) : fallback;
}

// Build pptxgenjs styled runs from rich paragraphs, falling back to the text box's defaults.
function richRuns(paras: RichParagraph[], o: SlideObjectView): pptxgen.TextProps[] {
  const boxFamily = o.fontFamily ? firstFamily(fontStack(o.fontFamily)) : undefined;
  const boxSize = o.fontSize ? Math.round(o.fontSize * 0.75) : 18;
  const boxColor = hex(o.fill, '0F172A');
  const out: pptxgen.TextProps[] = [];
  for (const p of paras) {
    if (!p.runs.length) {
      out.push({ text: '', options: { breakLine: true } });
      continue;
    }
    const headSize = p.heading === 1 ? Math.round(boxSize * 1.5) : p.heading === 2 ? Math.round(boxSize * 1.25) : boxSize;
    p.runs.forEach((r, ri) => {
      out.push({
        text: r.text,
        options: {
          bold: r.bold || p.heading > 0,
          italic: r.italic,
          underline: r.underline ? { style: 'sng' } : undefined,
          strike: r.strike ? 'sngStrike' : undefined,
          subscript: r.sub,
          superscript: r.sup,
          color: r.color ? hex(r.color, boxColor) : boxColor,
          fontFace: r.fontFamily ? firstFamily(r.fontFamily) : boxFamily,
          fontSize: r.fontSize ? ptFromCss(r.fontSize, headSize) : headSize,
          hyperlink: r.link ? { url: r.link } : undefined,
          breakLine: ri === p.runs.length - 1,
        },
      });
    });
  }
  return out;
}

function addTable(s: pptxgen.Slide, o: SlideObjectView) {
  const cells = o.cells || [];
  if (!cells.length) return;
  const rows = cells.map((row, r) =>
    row.map((text) => ({
      text: text || '',
      options: r === 0 ? { bold: true, fill: { color: hex(o.fill, 'F1F5F9') } } : {},
    })),
  );
  s.addTable(rows as never, {
    x: inch(o.x),
    y: inch(o.y),
    w: inch(o.w),
    h: inch(o.h),
    border: { type: 'solid', color: hex(o.stroke, 'CBD5E1'), pt: 1 },
    fontSize: 11,
    valign: 'middle',
  });
}

function addChart(pptx: pptxgen, s: pptxgen.Slide, o: SlideObjectView, pos: { x: number; y: number; w: number; h: number }) {
  const data = o.data;
  if (!data || !data.categories?.length) return;
  const type = o.chartType || 'column';
  if (type === 'pie') {
    const s0 = data.series[0];
    s.addChart(pptx.ChartType.pie, [{ name: s0?.name || i18next.t('Série'), labels: data.categories, values: s0?.values || [] }], pos);
    return;
  }
  const chartData = data.series.map((ser) => ({ name: ser.name, labels: data.categories, values: ser.values }));
  const typeMap: Record<string, pptxgen.CHART_NAME> = {
    column: pptx.ChartType.bar,
    bar: pptx.ChartType.bar,
    line: pptx.ChartType.line,
    area: pptx.ChartType.area,
  };
  s.addChart(typeMap[type] || pptx.ChartType.bar, chartData, { ...pos, barDir: type === 'bar' ? 'bar' : 'col' });
}
