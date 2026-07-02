import { forwardRef } from 'react';
import type { CSSProperties } from 'react';
import type { SlideObjectView as ObjView, YSlide } from '../crdt/scene';
import { fontStack } from '../data/fonts';
import { TextBox } from './TextBox';
import { ChartObject } from './objects/ChartObject';
import { TableObject } from './objects/TableObject';
import { VideoObject } from './objects/VideoObject';
import { AudioObject } from './objects/AudioObject';
import { ShapeContent, LineContent, ImageContent, IconContent } from './objects/renderers';

interface Props {
  slide: YSlide;
  o: ObjView;
  selected: boolean;
  editing: boolean;
  remoteColor?: string;
  /** Read-only render (present mode / static preview): no outline, no pointer handlers. */
  presenting?: boolean;
  onSelect: (e: React.PointerEvent) => void;
  onStartEdit: () => void;
}

const valignToJustify = (v: ObjView['valign']) =>
  v === 'top' ? 'flex-start' : v === 'bottom' ? 'flex-end' : 'center';

// Is a #rrggbb (or #rgb) colour dark? Used to pick contrasting default text colour.
function isDark(hex: string): boolean {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return false;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

// One positioned object (DOM+SVG approach, no canvas). The selected object gets a Moveable
// overlay (rendered by SlideCanvas). This component owns the positioned wrapper, selection outline
// and pointer wiring; type-specific rendering is delegated to the objects/ renderers.
export const SlideObjectView = forwardRef<HTMLDivElement, Props>(function SlideObjectView(
  { slide, o, selected, editing, remoteColor, presenting, onSelect, onStartEdit },
  ref,
) {
  const base: CSSProperties = {
    position: 'absolute',
    left: o.x,
    top: o.y,
    width: o.w,
    height: o.h,
    transform: `rotate(${o.rotation || 0}deg)`,
    opacity: o.opacity ?? 1,
    // Imported shadow (real offset/blur/colour from .pptx) wins over the fixed editor drop-shadow.
    filter: o.shadowCss || (o.shadow ? 'drop-shadow(0 8px 16px rgba(2,6,23,.28))' : undefined),
    outline: presenting
      ? 'none'
      : selected
        ? '1px solid #64748b'
        : remoteColor
          ? `2px solid ${remoteColor}`
          : '1px solid rgba(15,23,42,.10)',
    cursor: presenting ? 'default' : o.locked ? 'default' : 'grab',
    pointerEvents: presenting ? 'none' : undefined,
  };

  const select = (e: React.PointerEvent) => {
    if (presenting) return;
    e.stopPropagation();
    onSelect(e);
  };

  if (o.type === 'text') {
    // Default text colour auto-contrasts the slide background (dark slide → light text), so themed
    // / dark decks stay readable. Box `fill` and per-run colour marks still override this.
    const slideBg = (slide.get('background') as string) || '#ffffff';
    const defaultInk = isDark(slideBg) ? '#f8fafc' : '#0f172a';
    // Imported padding (.pptx bodyPr insets) → CSS vars consumed by .textbox-content. When unset
    // (editor-created box) the CSS falls back to the default 8px/12px so normal boxes look unchanged.
    const hasPad =
      o.padTop != null || o.padRight != null || o.padBottom != null || o.padLeft != null;
    // spAutoFit: PowerPoint sized the box to the text, so don't clip, let any small overflow show
    // (matches PowerPoint) instead of cutting text off. Other modes keep the authored box.
    const overflow = o.autofit === 'shape' ? 'visible' : undefined;
    // Single click selects (Moveable shows); double click enters edit mode.
    const textBase: CSSProperties = {
      ...base,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: valignToJustify(o.valign),
      fontFamily: fontStack(o.fontFamily),
      fontSize: o.fontSize || undefined,
      textAlign: o.align,
      // Absolute line box (lnSpc spcPts) wins over the unitless multiple (spcPct).
      lineHeight: o.lineHeightPx ? `${o.lineHeightPx}px` : o.lineHeight || undefined,
      overflow,
      // Box-level default text color (fill); per-run marks override it. Defaults to a colour that
      // contrasts the slide background (NOT --ink, which flips with app dark mode).
      color: o.fill || defaultInk,
      // Optional box background (imported shape-with-text keeps its fill behind the text).
      background: o.shapeFill || undefined,
      // Imported shape chrome behind the text: border (+dash) and rounded corners. Absent on
      // editor-created text boxes, so those render exactly as before.
      border: o.strokeWidth
        ? `${o.strokeWidth}px ${o.dash === 'dot' ? 'dotted' : o.dash === 'dash' ? 'dashed' : 'solid'} ${o.stroke || '#0f172a'}`
        : undefined,
      borderRadius: o.radius || undefined,
      // Imported text-frame insets as padding (px). Per-side CSS vars; .textbox-content reads them.
      ...(hasPad
        ? ({
            '--pad-top': `${o.padTop ?? 0}px`,
            '--pad-right': `${o.padRight ?? 0}px`,
            '--pad-bottom': `${o.padBottom ?? 0}px`,
            '--pad-left': `${o.padLeft ?? 0}px`,
          } as CSSProperties)
        : {}),
      // Per-paragraph margins from spcBef/spcAft (applied to every paragraph by .textbox-content).
      ...(o.spaceBefore != null ? ({ '--space-before': `${o.spaceBefore}px` } as CSSProperties) : {}),
      ...(o.spaceAfter != null ? ({ '--space-after': `${o.spaceAfter}px` } as CSSProperties) : {}),
    };
    return (
      <div
        ref={ref}
        className={`obj text${editing ? ' is-editing' : ''}${o.nowrap ? ' is-nowrap' : ''}`}
        style={textBase}
        onPointerDown={(e) => onSelect(e)}
        onDoubleClick={() => onStartEdit()}
      >
        <TextBox slide={slide} o={o} editing={editing} />
      </div>
    );
  }

  if (o.type === 'image') {
    return (
      <div ref={ref} className="obj" style={base} onPointerDown={select}>
        <ImageContent o={o} />
      </div>
    );
  }

  if (o.type === 'video' || o.type === 'audio') {
    // Media players need real pointer events in present mode (the presenting wrapper default is
    // 'none') and when "edited" (double-click, like TextBox); otherwise Moveable owns the frame.
    const interactive = !!presenting || editing;
    const mediaBase: CSSProperties = presenting ? { ...base, pointerEvents: 'auto' } : base;
    return (
      <div
        ref={ref}
        className={`obj${editing ? ' is-editing' : ''}`}
        style={mediaBase}
        onPointerDown={(e) => onSelect(e)}
        onDoubleClick={() => onStartEdit()}
      >
        {o.type === 'video' ? (
          <VideoObject o={o} interactive={interactive} presenting={!!presenting} />
        ) : (
          <AudioObject o={o} interactive={interactive} presenting={!!presenting} />
        )}
      </div>
    );
  }

  if (o.type === 'icon') {
    return (
      <div ref={ref} className="obj" style={base} onPointerDown={select}>
        <IconContent o={o} />
      </div>
    );
  }

  if (o.type === 'line') {
    return (
      <div ref={ref} className="obj" style={base} onPointerDown={select}>
        <LineContent o={o} />
      </div>
    );
  }

  if (o.type === 'chart') {
    return (
      <div ref={ref} className="obj" style={base} onPointerDown={select}>
        <ChartObject o={o} />
      </div>
    );
  }

  if (o.type === 'table') {
    return (
      <div
        ref={ref}
        className={`obj${editing ? ' is-editing' : ''}`}
        style={base}
        onPointerDown={(e) => onSelect(e)}
        onDoubleClick={() => onStartEdit()}
      >
        <TableObject slide={slide} o={o} editing={editing} />
      </div>
    );
  }

  // rect / ellipse / shape
  return (
    <div ref={ref} className="obj" style={base} onPointerDown={select}>
      <ShapeContent o={o} />
    </div>
  );
});
