import type * as Y from 'yjs';

export type SlideObjectType =
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'image'
  | 'line'
  | 'shape'
  | 'table'
  | 'chart'
  | 'icon'
  | 'video'
  | 'audio';

export type ShapeKind =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'star'
  | 'arrowRight'
  | 'arrowLeft'
  | 'chevron'
  | 'callout'
  | 'custom';

export interface ImageFilters {
  brightness?: number; // %  (100 = neutral)
  contrast?: number; // %
  saturate?: number; // %
  grayscale?: number; // %
  blur?: number; // px
}
export interface Crop {
  t?: number; // % cropped from each edge
  r?: number;
  b?: number;
  l?: number;
}
export type AnimKind = 'entrance' | 'emphasis' | 'exit';
export type EntranceAnimType = 'fade' | 'slide-up' | 'zoom' | 'wipe';
export type EmphasisAnimType = 'pulse' | 'tint' | 'shake' | 'grow';
export type ExitAnimType = 'fade-out' | 'slide-down' | 'zoom-out' | 'wipe-out';
export interface Anim {
  // EntranceAnimType | EmphasisAnimType | ExitAnimType; kept open for imported/legacy values.
  type: string;
  kind?: AnimKind; // absent = 'entrance' (legacy single-anim decks)
  duration?: number; // ms
  delay?: number; // ms
  order?: number; // global play order within the slide; ties broken by z-order then list position
  trigger?: 'click' | 'with' | 'after'; // 'click' default; 'with'/'after' join the previous step
}
export interface GradSpec {
  kind: 'linear' | 'radial';
  angle: number; // degrees (linear only)
  stops: { color: string; pos: number }[]; // pos = 0..100
}
export interface ChartData {
  categories: string[];
  series: { name: string; values: number[]; color?: string }[];
}

// Per-cell table styling captured at .pptx import. All fields optional; the renderer falls back to
// the table-level model (fill/stroke/banding) when a cell carries no style.
export interface CellStyle {
  fill?: string; // cell background (a:tcPr/a:solidFill)
  color?: string; // cell text colour
  align?: 'left' | 'center' | 'right'; // horizontal text alignment
  valign?: 'top' | 'middle' | 'bottom'; // vertical text alignment (anchor)
  bold?: boolean;
  borderColor?: string; // uniform cell border colour (a:lnL/R/T/B); absent → table border
  borderWidth?: number; // px
  span?: number; // gridSpan, number of columns this cell spans (merge origin)
  rowSpan?: number; // rowSpan, number of rows this cell spans (merge origin)
  merged?: boolean; // a continuation cell of a merge (hMerge/vMerge), not rendered
}

export interface SlideObjectView {
  id: string;
  type: SlideObjectType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  fill?: string;
  text?: string;
  src?: string; // image data-URL or object-store key
  opacity?: number; // 0..1
  stroke?: string; // border color
  strokeWidth?: number; // border width (px)
  // v2, shared
  alt?: string; // accessibility text
  ph?: string; // placeholder role: 'title' | 'body' | 'subtitle' | ...
  anim?: Anim; // legacy single entrance animation (superseded by anims)
  anims?: Anim[]; // ordered animation list; takes precedence over anim when present
  href?: string; // hyperlink target
  locked?: boolean; // position/edit lock
  group?: string; // group id (objects sharing it move together)
  shadow?: boolean; // drop shadow (editor default; fixed offset/blur)
  // Imported shadow from .pptx a:outerShdw, a ready-made CSS drop-shadow(...) string with the real
  // offset/blur/colour/alpha. Overrides the fixed `shadow` boolean. Absent on editor-created shapes.
  shadowCss?: string;
  // v2, shapes
  shape?: ShapeKind; // when type === 'shape'
  radius?: number; // corner radius (px)
  gradient?: string; // CSS gradient (overrides flat fill)
  dash?: 'dash' | 'dot'; // line/border dash style (a:prstDash); solid when absent
  // Custom geometry (a:custGeom) imported as an SVG path. `customPath` is the path `d` in
  // path-unit space; `pathW`/`pathH` are the path's coordinate-space extent (the SVG viewBox).
  // The renderer scales the path to the object box (preserveAspectRatio=none).
  customPath?: string;
  pathW?: number;
  pathH?: number;
  // Real gradient for a custom-geometry path (CSS gradient strings can't fill an SVG <path>).
  gradSpec?: GradSpec;
  arrowStart?: boolean; // line/connector arrowheads
  arrowEnd?: boolean;
  // v2, text box
  valign?: 'top' | 'middle' | 'bottom';
  fontFamily?: string;
  fontSize?: number; // box default text size (px)
  align?: 'left' | 'center' | 'right' | 'justify';
  lineHeight?: number; // box default line-height multiplier
  shapeFill?: string; // text-box background (e.g. an imported shape-with-text)
  // Text-box padding from .pptx bodyPr insets (px). PowerPoint defaults applied at import when
  // unset (l/r≈10px, t/b≈5px). Absent on editor-created boxes → CSS default padding applies.
  padTop?: number;
  padRight?: number;
  padBottom?: number;
  padLeft?: number;
  // Autofit mode from .pptx bodyPr: 'shape' = spAutoFit (box sized to text, don't clip overflow),
  // 'norm' = normAutofit (font shrink already baked into run sizes at import). Absent = no autofit.
  autofit?: 'shape' | 'norm';
  // bodyPr wrap="none": text does not auto-wrap, each paragraph stays on one line and overflows.
  nowrap?: boolean;
  // Box-level uniform paragraph spacing from .pptx (px), applied to every paragraph by the renderer.
  lineHeightPx?: number; // absolute line box px (lnSpc spcPts), overrides lineHeight multiple
  spaceBefore?: number; // margin-top px on each paragraph (spcBef)
  spaceAfter?: number; // margin-bottom px on each paragraph (spcAft)
  // v2, image
  // 'fill' = stretch to the frame ignoring aspect (PowerPoint blipFill default at import); editor
  // UI exposes only contain/cover.
  fit?: 'contain' | 'cover' | 'fill';
  flipH?: boolean; // a:xfrm flipH, mirror horizontally (image/shape)
  flipV?: boolean; // a:xfrm flipV, mirror vertically
  filters?: ImageFilters;
  crop?: Crop;
  mask?: 'none' | 'circle' | 'rounded';
  // v2, table
  rows?: number;
  cols?: number;
  cells?: string[][];
  banding?: boolean;
  // Per-cell styling captured at .pptx import (parallel to `cells`, same row/col indexing). Editor
  // tables leave it unset and keep the simple banding/header model. See TableObject for rendering.
  cellStyles?: CellStyle[][];
  colWidths?: number[]; // relative column widths (sums normalised by the renderer); imported tables only
  rowHeights?: number[]; // relative row heights; imported tables only
  // v2, chart
  chartType?: 'bar' | 'column' | 'line' | 'pie' | 'area';
  stacked?: boolean; // stacked column/bar chart (grouping="stacked")
  data?: ChartData;
  // v2, icon
  icon?: string;
  // v2, video/audio (src is shared with image)
  poster?: string; // video poster image URL
  autoplay?: boolean; // start playback when presented
  loop?: boolean;
  muted?: boolean;
  controls?: boolean; // show native player controls (default true when absent)
}

export type NewObject = Partial<Omit<SlideObjectView, 'id'>> & { type: SlideObjectType };

export type YSlide = Y.Map<unknown>;

export function addObject(slide: YSlide, view: NewObject): string;
export function deleteObject(slide: YSlide, id: string): void;
export function setProp<K extends keyof SlideObjectView>(
  slide: YSlide,
  id: string,
  key: K,
  value: SlideObjectView[K],
): void;
export function setProps(slide: YSlide, id: string, patch: Partial<SlideObjectView>): void;
export function reorder(slide: YSlide, id: string, toIndex: number): void;
export function listObjects(slide: YSlide): SlideObjectView[];
export function getObjectIds(slide: YSlide): string[];
export function effectiveAnims(view: Pick<SlideObjectView, 'anim' | 'anims'>): Anim[];
