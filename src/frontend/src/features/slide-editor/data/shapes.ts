// Shape library. Each shape is an SVG path in a 0..100 / 0..100 viewBox so it scales to any
// object box via preserveAspectRatio="none". `fill`/`stroke`/`strokeWidth` come from the object.
// Rect/ellipse stay DOM-rendered for crisp borders + corner radius; everything else is an SVG path.
import type { ShapeKind } from '../crdt/scene';

export interface ShapeDef {
  kind: ShapeKind;
  label: string;
  /** Material icon used in the Insert → Shapes flyout. */
  icon: string;
  /** SVG path in a 100x100 viewBox; omitted for rect/ellipse (rendered as DOM boxes). */
  path?: string;
}

export const SHAPES: ShapeDef[] = [
  { kind: 'rect', label: 'Rectangle', icon: 'crop_square' },
  { kind: 'roundRect', label: 'Rectangle arrondi', icon: 'rounded_corner' },
  { kind: 'ellipse', label: 'Ellipse', icon: 'circle' },
  { kind: 'triangle', label: 'Triangle', icon: 'change_history', path: 'M50 4 L96 96 L4 96 Z' },
  { kind: 'diamond', label: 'Losange', icon: 'diamond', path: 'M50 2 L98 50 L50 98 L2 50 Z' },
  {
    kind: 'pentagon',
    label: 'Pentagone',
    icon: 'pentagon',
    path: 'M50 3 L97 38 L79 94 L21 94 L3 38 Z',
  },
  {
    kind: 'hexagon',
    label: 'Hexagone',
    icon: 'hexagon',
    path: 'M25 5 L75 5 L98 50 L75 95 L25 95 L2 50 Z',
  },
  {
    kind: 'star',
    label: 'Étoile',
    icon: 'star',
    path:
      'M50 3 L61 38 L98 38 L68 60 L79 95 L50 73 L21 95 L32 60 L2 38 L39 38 Z',
  },
  {
    kind: 'arrowRight',
    label: 'Flèche droite',
    icon: 'arrow_forward',
    path: 'M2 35 L60 35 L60 12 L98 50 L60 88 L60 65 L2 65 Z',
  },
  {
    kind: 'arrowLeft',
    label: 'Flèche gauche',
    icon: 'arrow_back',
    path: 'M98 35 L40 35 L40 12 L2 50 L40 88 L40 65 L98 65 Z',
  },
  {
    kind: 'chevron',
    label: 'Chevron',
    icon: 'chevron_right',
    path: 'M2 12 L60 12 L98 50 L60 88 L2 88 L40 50 Z',
  },
  {
    kind: 'callout',
    label: 'Bulle',
    icon: 'chat_bubble',
    path: 'M4 6 H96 V70 H44 L28 92 L30 70 H4 Z',
  },
];

export function shapeByKind(kind: ShapeKind | undefined): ShapeDef | undefined {
  return SHAPES.find((s) => s.kind === kind);
}
