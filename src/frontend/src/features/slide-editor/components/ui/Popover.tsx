import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import './Popover.css';

interface Props {
  /** Trigger label (text). */
  label?: string;
  /** Trigger icon (material name). */
  icon?: string;
  title?: string;
  disabled?: boolean;
  /** Hide the dropdown caret. */
  noCaret?: boolean;
  /** Render the trigger as a compact icon button. */
  compact?: boolean;
  align?: 'left' | 'right';
  className?: string;
  /** children receive a `close` callback so menu items can dismiss the popover. */
  children: (close: () => void) => ReactNode;
}

// Reusable popover/menu primitive: a trigger button + a panel that closes on outside-click / Esc.
// Ribbon menus, shape/icon flyouts and overflow menus all build on this.
export function Popover({ label, icon, title, disabled, noCaret, compact, align = 'left', className, children }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);

  // The panel is portaled to <body> so it escapes the ribbon's overflow clipping and any
  // stacking context, positioned with fixed coords from the trigger rect.
  const place = () => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    setPos(
      align === 'right'
        ? { top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) }
        : { top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 240) },
    );
  };
  useLayoutEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className={`pop-root${className ? ' ' + className : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`pop-trigger${compact ? ' pop-compact' : ''}${open ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title || label}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {icon && <Icon name={icon} />}
        {label && <span className="pop-label">{label}</span>}
        {!noCaret && <Icon name="arrow_drop_down" className="pop-caret" />}
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={panelRef} className="pop-panel pop-portal" role="menu" style={{ top: pos.top, left: pos.left, right: pos.right }}>
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function MenuItem({
  icon,
  label,
  shortcut,
  onClick,
  danger,
  active,
}: {
  icon?: string;
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`pop-item${danger ? ' is-danger' : ''}${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      {icon && <Icon name={icon} />}
      <span className="pop-item-label">{label}</span>
      {shortcut && <span className="pop-item-shortcut">{shortcut}</span>}
    </button>
  );
}
