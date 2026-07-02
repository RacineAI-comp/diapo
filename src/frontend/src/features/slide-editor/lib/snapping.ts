import type { SlideObjectView } from '../crdt/scene';

// Alignment / snapping helpers feeding Moveable in SlideCanvas.
//
// Moveable does the heavy lifting at drag/resize time (elementGuidelines + horizontal/vertical
// guidelines + a snap threshold). These helpers turn the CRDT scene into the inputs Moveable
// wants, and `computeGuides` stays available for any headless/unit reasoning about alignment.

export interface Guide {
  axis: 'x' | 'y';
  position: number;
}

// Default 16:9 stage size (mirrors SlideCanvas' W/H). Center lines are derived from these so a
// moving object snaps to the slide's middle as well as to its peers.
export const SLIDE_W = 960;
export const SLIDE_H = 540;

// Distance (px) within which Moveable will snap to a guideline.
export const SNAP_THRESHOLD = 6;

// Vertical guidelines = x positions; horizontal guidelines = y positions. We always offer the
// slide center; callers can extend with thirds/edges if desired.
export function slideVerticalGuidelines(width = SLIDE_W): number[] {
  return [0, width / 2, width];
}

export function slideHorizontalGuidelines(height = SLIDE_H): number[] {
  return [0, height / 2, height];
}

// The three meaningful x/y lines of a single object: its near edge, center, far edge.
function edges(start: number, size: number): [number, number, number] {
  return [start, start + size / 2, start + size];
}

// Pure alignment computation: for the `moving` object, return the guides from `others` whose
// edges/centers line up (exactly) with the moving object's edges/centers. This is the headless
// counterpart to Moveable's element snapping, handy for tests and for any non-DOM caller.
export function computeGuides(others: SlideObjectView[], moving: SlideObjectView): Guide[] {
  const out: Guide[] = [];
  const seen = new Set<string>();
  const movingX = edges(moving.x, moving.w);
  const movingY = edges(moving.y, moving.h);

  const push = (axis: 'x' | 'y', position: number) => {
    const key = `${axis}:${position}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ axis, position });
  };

  // Include the slide center lines as always-available guides.
  push('x', SLIDE_W / 2);
  push('y', SLIDE_H / 2);

  for (const other of others) {
    if (other.id === moving.id) continue;
    for (const ox of edges(other.x, other.w)) {
      if (movingX.some((mx) => Math.abs(mx - ox) <= SNAP_THRESHOLD)) push('x', ox);
    }
    for (const oy of edges(other.y, other.h)) {
      if (movingY.some((my) => Math.abs(my - oy) <= SNAP_THRESHOLD)) push('y', oy);
    }
  }
  return out;
}
