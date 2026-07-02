import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import {
  STANDARD_COLORS,
  getRecentColors,
  pushRecentColor,
  hasEyeDropper,
  pickWithEyeDropper,
} from './colors';
import './ColorPopover.css';

interface Props {
  value?: string;
  onChange: (color: string) => void;
  /** Theme colors for the top row (from the active deck theme). */
  themeColors?: string[];
  /** Allow a "no fill" / transparent choice (shapes, slide bg). */
  allowNone?: boolean;
  title?: string;
  /** Small swatch trigger (toolbars) vs. full-width (inspector). */
  compact?: boolean;
}

// Shared color popover: theme row + standard grid + recents + custom hex + eyedropper.
// One component, used by text color, shape fill/border and slide background, so the palette and
// recent-colors behaviour are identical everywhere.
export function ColorPopover({ value, onChange, themeColors, allowNone, title, compact }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (open) setRecents(getRecentColors());
  }, [open]);

  // Portaled to <body> so it escapes inspector/floatbar overflow and sits above Moveable handles.
  const place = () => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 236) });
  };
  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onScroll = () => place();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const choose = (color: string) => {
    pushRecentColor(color);
    onChange(color);
    setOpen(false);
  };

  const swatchBg =
    value && value !== 'transparent'
      ? value
      : 'repeating-conic-gradient(#cbd5e1 0% 25%, #fff 0% 50%) 50% / 10px 10px';

  return (
    <div className="cp-root">
      <button
        ref={triggerRef}
        type="button"
        className={`cp-trigger${compact ? ' cp-compact' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title || t('Couleur')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="cp-trigger-swatch" style={{ background: swatchBg }} />
        {!compact && <span className="cp-trigger-label">{value || t('Couleur')}</span>}
        <Icon name="arrow_drop_down" />
      </button>

      {open &&
        pos &&
        createPortal(
        <div ref={panelRef} className="cp-panel cp-portal" role="dialog" aria-label={title || t('Choisir une couleur')} style={{ top: pos.top, left: pos.left }} onMouseDown={(e) => e.preventDefault()}>
          {(themeColors?.length ?? 0) > 0 && (
            <>
              <div className="cp-section-title">{t('Couleurs du thème')}</div>
              <div className="cp-grid cp-theme">
                {themeColors!.map((c) => (
                  <Swatch key={c} color={c} active={c === value} onClick={() => choose(c)} />
                ))}
              </div>
            </>
          )}

          <div className="cp-section-title">{t('Couleurs standard')}</div>
          <div className="cp-grid">
            {STANDARD_COLORS.map((c) => (
              <Swatch key={c} color={c} active={c === value} onClick={() => choose(c)} />
            ))}
          </div>

          {recents.length > 0 && (
            <>
              <div className="cp-section-title">{t('Récentes')}</div>
              <div className="cp-grid">
                {recents.map((c) => (
                  <Swatch key={c} color={c} active={c === value} onClick={() => choose(c)} />
                ))}
              </div>
            </>
          )}

          <div className="cp-footer">
            <label className="cp-custom" title={t('Couleur personnalisée')}>
              <Icon name="palette" />
              <span>{t('Perso')}</span>
              <input
                type="color"
                value={value && value.startsWith('#') ? value : '#000000'}
                onChange={(e) => choose(e.target.value)}
              />
            </label>
            {hasEyeDropper() && (
              <button
                type="button"
                className="cp-tool"
                title={t('Pipette')}
                onClick={async () => {
                  const c = await pickWithEyeDropper();
                  if (c) choose(c);
                }}
              >
                <Icon name="colorize" />
              </button>
            )}
            {allowNone && (
              <button type="button" className="cp-tool cp-none" onClick={() => choose('transparent')}>
                {t('Aucune')}
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Swatch({ color, active, onClick }: { color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`cp-swatch${active ? ' is-active' : ''}`}
      style={{ background: color }}
      title={color}
      aria-label={color}
      onClick={onClick}
    />
  );
}
