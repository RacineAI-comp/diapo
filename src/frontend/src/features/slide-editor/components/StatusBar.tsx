import { useTranslation } from 'react-i18next';
import { useEditorCtx } from '../state/editorContext';
import { Icon } from './ui/Icon';
import './StatusBar.css';

// Bottom status bar: slide position, object count, zoom controls, grid + notes toggles.
export function StatusBar() {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { activeIndex, count, objects } = ctx;

  return (
    <div className="statusbar">
      <div className="sb-left">
        <span className="sb-item">
          {t('Diapo {{n}} / {{total}}', { n: count ? activeIndex + 1 : 0, total: count })}
        </span>
        <span className="sb-sep" />
        <span className="sb-item">{t('{{count}} objet', { count: objects.length })}</span>
      </div>

      <div className="sb-right">
        {/* Only rendered by the compact-layout media queries (hidden on desktop). */}
        <button
          className={`sb-toggle sb-drawer-toggle${ctx.inspectorOpen ? ' is-on' : ''}`}
          onClick={() => ctx.setInspectorOpen(!ctx.inspectorOpen)}
          title={t('Propriétés')}
          aria-label={t('Propriétés')}
          aria-expanded={ctx.inspectorOpen}
        >
          <Icon name="tune" />
        </button>
        <button className={`sb-toggle${ctx.showGrid ? ' is-on' : ''}`} onClick={() => ctx.setShowGrid(!ctx.showGrid)} title={t('Grille')}>
          <Icon name="grid_4x4" />
        </button>
        <button className={`sb-toggle${ctx.showNotes ? ' is-on' : ''}`} onClick={() => ctx.setShowNotes(!ctx.showNotes)} title={t('Notes')}>
          <Icon name="sticky_note_2" />
        </button>
        <button className={`sb-toggle${ctx.dark ? ' is-on' : ''}`} onClick={() => ctx.setDark(!ctx.dark)} title={t('Mode sombre')}>
          <Icon name={ctx.dark ? 'light_mode' : 'dark_mode'} />
        </button>
        <span className="sb-sep" />
        <button className="sb-zoom-btn" title={t('Dézoomer')} onClick={() => { ctx.setFit(false); ctx.setZoom(Math.max(0.25, +(ctx.zoom - 0.1).toFixed(2))); }}>
          <Icon name="remove" />
        </button>
        <button className="sb-zoom" title={t('Ajuster')} onClick={() => { ctx.setFit(true); ctx.setZoom(1); }}>
          {ctx.fit ? t('Ajuster') : `${Math.round(ctx.zoom * 100)}%`}
        </button>
        <button className="sb-zoom-btn" title={t('Zoomer')} onClick={() => { ctx.setFit(false); ctx.setZoom(Math.min(3, +(ctx.zoom + 0.1).toFixed(2))); }}>
          <Icon name="add" />
        </button>
      </div>
    </div>
  );
}
