import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@gouvfr-lasuite/cunningham-react';
import { type SuiteApp, loadSuiteApps } from '../../suite/apps';
import './AppLauncher.css';

// App launcher (the "gaufre" pattern), rendering this suite's own app list from
// features/suite/apps (shared with the suite home/portal). It intentionally does not use
// @gouvfr-lasuite/integration's <Gaufre>, which is wired to a specific hosted deployment.
export type { SuiteApp };

const mi = (name: string) => (
  <span className="app-launcher__icon material-icons" aria-hidden="true">
    {name}
  </span>
);

export function AppLauncher({ apps }: { apps?: SuiteApp[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const list = apps ?? loadSuiteApps();

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="app-launcher" ref={ref}>
      <Button
        size="small"
        variant="tertiary"
        color="neutral"
        icon={<span className="material-icons" aria-hidden="true">apps</span>}
        aria-label={t('Applications')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div className="app-launcher__menu" role="menu">
          <p className="app-launcher__title">{t('Applications')}</p>
          <div className="app-launcher__grid">
            {list.map((a) => {
              // Current app: highlighted, no navigation. Other deployed apps: real link (new
              // tab so you don't lose your deck). Not-deployed apps: disabled "coming soon".
              if (a.current) {
                return (
                  <button
                    key={a.name}
                    type="button"
                    className="app-launcher__item is-current"
                    onClick={() => setOpen(false)}
                    role="menuitem"
                  >
                    {mi(a.icon)}
                    <span className="app-launcher__name">{a.name}</span>
                  </button>
                );
              }
              if (a.url) {
                const external = /^https?:\/\//.test(a.url);
                return (
                  <a
                    key={a.name}
                    className="app-launcher__item"
                    href={a.url}
                    target={external ? '_blank' : undefined}
                    rel={external ? 'noopener noreferrer' : undefined}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    {mi(a.icon)}
                    <span className="app-launcher__name">{a.name}</span>
                  </a>
                );
              }
              return (
                <span
                  key={a.name}
                  className="app-launcher__item is-soon"
                  aria-disabled="true"
                  title={t('Bientôt disponible')}
                >
                  {mi(a.icon)}
                  <span className="app-launcher__name">{a.name}</span>
                  <span className="app-launcher__soon">{t('Bientôt')}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
