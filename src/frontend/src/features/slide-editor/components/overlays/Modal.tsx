import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../ui/Icon';
import './Modal.css';

interface Props {
  title: string;
  icon?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

// Reusable modal shell: scrim + centered card, Esc to close, focus-trapped enough for our needs.
export function Modal({ title, icon, onClose, children, footer, width = 560 }: Props) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal-card" style={{ width }} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          {icon && <Icon name={icon} />}
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label={t('Fermer')}>
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}
