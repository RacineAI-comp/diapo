import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorCtx } from '../state/editorContext';
import { setTitle } from '../crdt/deck.js';
import { AppLauncher } from './AppLauncher';
import { Presence } from './Presence';
import { Popover, MenuItem } from './ui/Popover';
import { Icon } from './ui/Icon';
import { exportDeckToPdf } from '../lib/exportPdf';
import { exportDeckToPptx } from '../lib/exportPptx';
import './TopBar.css';

// Editor header: launcher · brand · inline title + autosave · presence · export · present · overflow.
export function TopBar() {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { doc, title, status, slide, awareness, readOnly, exportError, setExportError } = ctx;
  const [draft, setDraft] = useState(title);

  // Keep the local draft in sync with remote title edits when not focused.
  useEffect(() => setDraft(title), [title]);

  // Export failures (PDF is sync, PPTX async) surface in the dismissible alert below the bar.
  const runExport = async (fn: () => void | Promise<void>) => {
    setExportError(null);
    try {
      await fn();
    } catch {
      setExportError(t('L’export a échoué. Veuillez réessayer.'));
    }
  };

  const saved = status === 'connected';
  const offline = status === 'disconnected';
  const saveLabel = saved ? t('Enregistré') : offline ? t('Hors ligne, reconnexion…') : t('Connexion…');
  const saveIcon = saved ? 'cloud_done' : offline ? 'cloud_off' : 'cloud_sync';

  return (
    <>
    <header className="topbar">
      <AppLauncher />
      <a className="brand-link" href="/" title={t('Mes présentations')}>
        <strong>Diapo</strong>
      </a>

      <input
        className="topbar-title"
        value={draft}
        placeholder={t('Présentation sans titre')}
        aria-label={t('Titre de la présentation')}
        readOnly={readOnly}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => !readOnly && setTitle(doc, draft)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <span
        className={`topbar-save${saved ? ' is-saved' : ''}${offline ? ' is-offline' : ''}`}
        title={saveLabel}
        role="status"
        aria-live="polite"
      >
        <Icon name={saveIcon} />
        {saveLabel}
      </span>

      <span className="topbar-right">
        <Presence awareness={awareness} />

        <Popover label={t('Exporter')} icon="download" align="right" noCaret>
          {(close) => (
            <>
              <MenuItem icon="picture_as_pdf" label={t('Exporter en PDF')} onClick={() => { void runExport(() => exportDeckToPdf(doc)); close(); }} />
              <MenuItem icon="slideshow" label={t('Exporter en PPTX')} onClick={() => { void runExport(() => exportDeckToPptx(doc)); close(); }} />
            </>
          )}
        </Popover>

        <button className="topbar-btn" onClick={() => ctx.setOverlay('share')}>
          <Icon name="share" /> {t('Partager')}
        </button>

        <button className="topbar-btn topbar-primary" disabled={!slide} onClick={() => ctx.setOverlay('present')}>
          <Icon name="play_arrow" /> {t('Présenter')}
        </button>

        <Popover icon="more_vert" align="right" noCaret title={t('Plus')}>
          {(close) => (
            <>
              <MenuItem icon="history" label={t('Historique des versions')} onClick={() => { ctx.setOverlay('versions'); close(); }} />
              <MenuItem icon="search" label={t('Rechercher / Remplacer')} shortcut="Ctrl+F" onClick={() => { ctx.setOverlay('find'); close(); }} />
              {!readOnly && <MenuItem icon="upload_file" label={t('Importer (.pptx)')} onClick={() => { ctx.setOverlay('import'); close(); }} />}
              <MenuItem icon="accessibility_new" label={t('Vérifier l’accessibilité')} onClick={() => { ctx.setOverlay('a11y'); close(); }} />
              <MenuItem icon="keyboard" label={t('Raccourcis clavier')} shortcut="?" onClick={() => { ctx.setOverlay('shortcuts'); close(); }} />
              <MenuItem icon="terminal" label={t('Palette de commandes')} shortcut="Ctrl+K" onClick={() => { ctx.setOverlay('palette'); close(); }} />
            </>
          )}
        </Popover>
      </span>
    </header>
    {exportError && (
      <div className="topbar-alert" role="alert">
        <Icon name="error_outline" />
        <span>{exportError}</span>
        <button className="topbar-alert-close" aria-label={t('Fermer')} onClick={() => setExportError(null)}>
          <Icon name="close" />
        </button>
      </div>
    )}
    </>
  );
}
