import { useEffect, useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorCtx } from '../../state/editorContext';
import { getVersions, listVersions, captureVersion, restoreVersion, deleteVersion } from '../../crdt/versions.js';
import { Modal } from './Modal';
import { Icon } from './../ui/Icon';
import './VersionHistory.css';

function fmt(ts: number, lang: string): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

// Version history: manual checkpoints (stored in our collab DB) with one-click restore.
export function VersionHistory({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const ctx = useEditorCtx();
  const { doc } = ctx;
  const [, bump] = useReducer((c: number) => c + 1, 0);
  const [label, setLabel] = useState('');

  useEffect(() => {
    const arr = getVersions(doc);
    const fn = () => bump();
    arr.observeDeep(fn);
    return () => arr.unobserveDeep(fn);
  }, [doc]);

  const versions = listVersions(doc);
  const author = (ctx.awareness as { getLocalState?: () => { user?: { name?: string } } } | null)?.getLocalState?.()?.user?.name || '';

  const capture = () => {
    captureVersion(doc, label.trim() || t('Version du {{date}}', { date: fmt(Date.now(), i18n.language) }), author);
    setLabel('');
  };

  return (
    <Modal title={t('Historique des versions')} icon="history" onClose={onClose} width={520}>
      <div className="vh-capture">
        <input placeholder={t('Nom du point de restauration…')} value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && capture()} />
        <button className="modal-btn primary" onClick={capture}>
          <Icon name="save" /> {t('Enregistrer une version')}
        </button>
      </div>
      {versions.length === 0 ? (
        <p className="vh-empty">{t('Aucune version enregistrée. Créez un point de restauration avant une modification importante.')}</p>
      ) : (
        <ul className="vh-list">
          {versions.map((v) => (
            <li key={v.id} className="vh-item">
              <div className="vh-meta">
                <strong>{v.label}</strong>
                <span>
                  {fmt(v.ts, i18n.language)}
                  {v.author ? ` · ${v.author}` : ''}
                </span>
              </div>
              <div className="vh-actions">
                <button
                  className="modal-btn"
                  onClick={() => {
                    if (window.confirm(t('Restaurer cette version ? L’état actuel sera remplacé (créez d’abord une version si besoin).'))) {
                      restoreVersion(doc, v.id);
                      onClose();
                    }
                  }}
                >
                  {t('Restaurer')}
                </button>
                <button className="vh-del" title={t('Supprimer')} onClick={() => deleteVersion(doc, v.id)}>
                  <Icon name="delete" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
