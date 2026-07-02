import { useTranslation } from 'react-i18next';
import type { SlideObjectView as ObjView } from '../../crdt/scene';
import { Icon } from '../ui/Icon';

interface Props {
  o: ObjView;
  /** Player controls receive pointer events (double-click edit in the canvas, or present mode). */
  interactive: boolean;
  /** Present/static mode: honour autoplay; the editor canvas never autoplays. */
  presenting: boolean;
}

// Last URL path segment, decoded, without the query string: a readable default label.
function fileLabel(src?: string): string {
  if (!src || src.startsWith('data:')) return '';
  try {
    const seg = src.split('?')[0].split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(seg);
  } catch {
    return '';
  }
}

// Compact audio player chrome: an icon + filename row above the native <audio> controls. Same
// pointer-events gating as VideoObject so Moveable owns the frame until edit/present.
export function AudioObject({ o, interactive, presenting }: Props) {
  const { t } = useTranslation();
  const label = o.alt || fileLabel(o.src) || t('Audio');
  const showLabel = o.h >= 72; // compact boxes show only the player bar
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 4,
        padding: '4px 8px',
        boxSizing: 'border-box',
        background: 'var(--panel, #f1f5f9)',
        border: '1px solid rgba(15,23,42,.12)',
        borderRadius: o.radius ?? 10,
        overflow: 'hidden',
        pointerEvents: interactive ? 'auto' : 'none',
      }}
      onClick={(e) => interactive && e.stopPropagation()}
      onPointerDown={(e) => interactive && e.stopPropagation()}
    >
      {showLabel && (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--ink, #0f172a)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <Icon name="audiotrack" />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        </span>
      )}
      <audio
        key={o.src}
        src={o.src}
        controls={o.controls !== false}
        autoPlay={presenting && !!o.autoplay}
        loop={!!o.loop}
        muted={!!o.muted}
        preload="metadata"
        aria-label={label}
        style={{ width: '100%', height: showLabel ? undefined : '100%', minHeight: 0 }}
      />
    </div>
  );
}
