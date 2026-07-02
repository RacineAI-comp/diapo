// Pure presentational renderers for the non-interactive object types (shapes, lines, images,
// icons). Each fills its parent box (100% x 100%); SlideObjectView owns the positioned wrapper,
// selection outline and Moveable target. Tables/charts are interactive and live in their own files.
import type { CSSProperties } from 'react';
import type { ImageFilters, SlideObjectView as ObjView, ShapeKind } from '../../crdt/scene';
import { shapeByKind } from '../../data/shapes';

export function filterCss(f: ImageFilters | undefined): string | undefined {
  if (!f) return undefined;
  const parts: string[] = [];
  if (f.brightness != null && f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast != null && f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturate != null && f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
  if (f.grayscale) parts.push(`grayscale(${f.grayscale}%)`);
  if (f.blur) parts.push(`blur(${f.blur}px)`);
  return parts.length ? parts.join(' ') : undefined;
}

// DOM box shapes (crisp borders + radius + gradient) vs. SVG path shapes.
const DOM_SHAPES = new Set<ShapeKind>(['rect', 'roundRect', 'ellipse']);

// Coarse dash kind → a CSS border-style (DOM shapes) / SVG stroke-dasharray (path shapes/lines).
const dashBorderStyle = (d: ObjView['dash']): CSSProperties['borderStyle'] =>
  d === 'dot' ? 'dotted' : d === 'dash' ? 'dashed' : 'solid';
const dashArray = (d: ObjView['dash'], sw: number): string | undefined =>
  d === 'dot' ? `${sw} ${sw * 2}` : d === 'dash' ? `${sw * 4} ${sw * 2}` : undefined;

export function ShapeContent({ o }: { o: ObjView }) {
  const kind = (o.shape || o.type) as ShapeKind; // legacy rect/ellipse map onto shape kinds
  const fill = o.gradient || o.fill || '#dbeafe';
  const border = o.strokeWidth
    ? `${o.strokeWidth}px ${dashBorderStyle(o.dash)} ${o.stroke || '#0f172a'}`
    : undefined;

  // Custom geometry (a:custGeom) imported as an SVG path, scaled to the object box.
  if (o.customPath) {
    const g = o.gradSpec;
    const gid = g ? `cg-${o.id}` : undefined;
    const cfill = g ? `url(#${gid})` : o.fill || (o.strokeWidth ? 'none' : '#cbd5e1');
    return (
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${o.pathW || 100} ${o.pathH || 100}`}
        preserveAspectRatio="none"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {g && (
          <defs>
            {g.kind === 'radial' ? (
              <radialGradient id={gid} cx="50%" cy="50%" r="50%">
                {g.stops.map((s, i) => (
                  <stop key={i} offset={`${s.pos}%`} stopColor={s.color} />
                ))}
              </radialGradient>
            ) : (
              <linearGradient id={gid} gradientTransform={`rotate(${g.angle} 0.5 0.5)`}>
                {g.stops.map((s, i) => (
                  <stop key={i} offset={`${s.pos}%`} stopColor={s.color} />
                ))}
              </linearGradient>
            )}
          </defs>
        )}
        <path
          d={o.customPath}
          fill={cfill}
          stroke={o.stroke || 'none'}
          strokeWidth={o.strokeWidth || 0}
          strokeDasharray={dashArray(o.dash, o.strokeWidth || 1)}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  if (DOM_SHAPES.has(kind)) {
    const radius = kind === 'ellipse' ? '50%' : kind === 'roundRect' ? (o.radius ?? 18) : (o.radius ?? 8);
    return <div style={{ width: '100%', height: '100%', background: fill, border, borderRadius: radius }} />;
  }
  const def = shapeByKind(kind);
  if (!def?.path) return <div style={{ width: '100%', height: '100%', background: fill, border }} />;
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ display: 'block' }}>
      <path
        d={def.path}
        fill={o.fill || '#dbeafe'}
        stroke={o.stroke || 'none'}
        strokeWidth={o.strokeWidth || 0}
        strokeDasharray={dashArray(o.dash, o.strokeWidth || 1)}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function LineContent({ o }: { o: ObjView }) {
  const sw = o.strokeWidth || 3;
  const color = o.stroke || o.fill || '#0f172a';
  const w = Math.max(1, o.w);
  const h = Math.max(1, o.h);
  const mid = h / 2;
  const m = `arrow-${o.id}`;
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <defs>
        <marker id={`${m}-e`} markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0 0 L7 3 L0 6 Z" fill={color} />
        </marker>
        <marker id={`${m}-s`} markerWidth="10" markerHeight="10" refX="0" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M7 0 L0 3 L7 6 Z" fill={color} />
        </marker>
      </defs>
      <line
        x1={0}
        y1={mid}
        x2={w}
        y2={mid}
        stroke={color}
        strokeWidth={sw}
        strokeLinecap={o.dash ? 'butt' : 'round'}
        strokeDasharray={dashArray(o.dash, sw)}
        vectorEffect="non-scaling-stroke"
        markerEnd={o.arrowEnd ? `url(#${m}-e)` : undefined}
        markerStart={o.arrowStart ? `url(#${m}-s)` : undefined}
      />
    </svg>
  );
}

export function ImageContent({ o }: { o: ObjView }) {
  const objectFit: CSSProperties['objectFit'] =
    o.fit === 'cover' ? 'cover' : o.fit === 'fill' ? 'fill' : 'contain';
  const mirror =
    o.flipH || o.flipV ? `scale(${o.flipH ? -1 : 1}, ${o.flipV ? -1 : 1})` : undefined;
  const c = o.crop;
  const cropped = !!c && !!(c.t || c.r || c.b || c.l);
  // Mask-to-shape (circle/rounded) is a frame clip, keep it on the displayed box.
  const maskClip =
    o.mask === 'circle' ? 'circle(50%)' : o.mask === 'rounded' ? 'inset(0 round 16%)' : undefined;

  const common: CSSProperties = {
    pointerEvents: 'none',
    filter: filterCss(o.filters),
    transform: mirror,
    borderRadius: o.radius || undefined,
  };

  // PowerPoint's blipFill stretches the (srcRect-cropped) blip to fill the frame. CSS object-fit
  // clips but does not scale the kept region, so for a cropped picture we zoom the image up by the
  // inverse of the kept fraction and shift it, inside an overflow:hidden frame, the kept region
  // then exactly fills the box (matching PowerPoint), regardless of fit mode.
  if (cropped) {
    const l = c!.l || 0;
    const r = c!.r || 0;
    const t = c!.t || 0;
    const b = c!.b || 0;
    const keptW = Math.max(1, 100 - l - r);
    const keptH = Math.max(1, 100 - t - b);
    return (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          clipPath: maskClip,
          borderRadius: o.radius || undefined,
        }}
      >
        <img
          src={o.src}
          alt={o.alt || ''}
          draggable={false}
          style={{
            ...common,
            position: 'absolute',
            width: `${(100 / keptW) * 100}%`,
            height: `${(100 / keptH) * 100}%`,
            left: `${(-l / keptW) * 100}%`,
            top: `${(-t / keptH) * 100}%`,
            objectFit: 'fill',
            display: 'block',
            borderRadius: undefined,
          }}
        />
      </div>
    );
  }

  return (
    <img
      src={o.src}
      alt={o.alt || ''}
      draggable={false}
      style={{
        ...common,
        width: '100%',
        height: '100%',
        objectFit,
        display: 'block',
        clipPath: maskClip,
      }}
    />
  );
}

export function IconContent({ o }: { o: ObjView }) {
  const size = Math.max(8, Math.min(o.w, o.h));
  const glyph = o.icon || 'star';
  // Material Icon names are ascii ligatures; anything else (emoji) renders in the system font.
  const isMaterial = /^[a-z0-9_]+$/.test(glyph);
  return (
    <span
      className={isMaterial ? 'material-icons' : undefined}
      aria-hidden="true"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size,
        lineHeight: 1,
        color: isMaterial ? o.fill || '#0f172a' : undefined,
        userSelect: 'none',
      }}
    >
      {glyph}
    </span>
  );
}
