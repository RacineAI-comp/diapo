import type { CSSProperties } from 'react';
import type { SlideObjectView as ObjView } from '../../crdt/scene';

interface Props {
  o: ObjView;
  /** Player controls receive pointer events (double-click edit in the canvas, or present mode). */
  interactive: boolean;
  /** Present/static mode: honour autoplay; the editor canvas never autoplays. */
  presenting: boolean;
}

// A <video> filling the object box. pointer-events stay off until the object is being "edited"
// (double-click, like TextBox) or presented, so Moveable keeps owning drag/resize on the frame.
// Events are stopped so player clicks don't bubble into presenter navigation.
export function VideoObject({ o, interactive, presenting }: Props) {
  const objectFit: CSSProperties['objectFit'] =
    o.fit === 'cover' ? 'cover' : o.fit === 'fill' ? 'fill' : 'contain';
  return (
    <video
      key={o.src}
      src={o.src}
      poster={o.poster || undefined}
      controls={o.controls !== false}
      autoPlay={presenting && !!o.autoplay}
      loop={!!o.loop}
      muted={!!o.muted}
      playsInline
      preload="metadata"
      aria-label={o.alt || undefined}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        objectFit,
        background: '#000',
        borderRadius: o.radius || undefined,
        pointerEvents: interactive ? 'auto' : 'none',
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}
