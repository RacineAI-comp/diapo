import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorCtx } from '../../state/editorContext';
import { getSlideSize } from '../../crdt/deck.js';
import { parseDiagramText, layoutDiagram, DIAGRAM_MAX_ITEMS, type DiagramType } from '../../lib/diagram';
import { insertDiagram } from '../../lib/insert';
import { Modal } from './Modal';

// SmartArt-style generator: an indented text list becomes a diagram made of ordinary grouped
// objects (text cards + connector lines). One-shot: after insertion everything is edited with the
// normal tools, there is no live binding back to the source text.

// Labels are natural i18n keys (French source), translated at render time with t().
const TYPES: { id: DiagramType; label: string }[] = [
  { id: 'process', label: 'Processus' },
  { id: 'cycle', label: 'Cycle' },
  { id: 'hierarchy', label: 'Hiérarchie' },
  { id: 'pyramid', label: 'Pyramide' },
  { id: 'list', label: 'Liste' },
];

// Tiny schematic previews, one per type. Inline SVG, tinted by the button's currentColor.
function Preview({ type }: { type: DiagramType }) {
  const dim = { opacity: 0.4 };
  if (type === 'process')
    return (
      <svg width="56" height="36" viewBox="0 0 56 36" aria-hidden="true">
        <rect x="1" y="12" width="14" height="12" rx="2" fill="currentColor" />
        <rect x="21" y="12" width="14" height="12" rx="2" fill="currentColor" />
        <rect x="41" y="12" width="14" height="12" rx="2" fill="currentColor" />
        <path d="M15 18h6M35 18h6" stroke="currentColor" strokeWidth="1.5" style={dim} />
      </svg>
    );
  if (type === 'cycle')
    return (
      <svg width="56" height="36" viewBox="0 0 56 36" aria-hidden="true">
        <circle cx="28" cy="18" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" style={dim} />
        <rect x="23" y="1" width="10" height="7" rx="2" fill="currentColor" />
        <rect x="41" y="14" width="10" height="7" rx="2" fill="currentColor" />
        <rect x="23" y="28" width="10" height="7" rx="2" fill="currentColor" />
        <rect x="5" y="14" width="10" height="7" rx="2" fill="currentColor" />
      </svg>
    );
  if (type === 'hierarchy')
    return (
      <svg width="56" height="36" viewBox="0 0 56 36" aria-hidden="true">
        <rect x="21" y="2" width="14" height="10" rx="2" fill="currentColor" />
        <rect x="7" y="23" width="14" height="10" rx="2" fill="currentColor" style={dim} />
        <rect x="35" y="23" width="14" height="10" rx="2" fill="currentColor" style={dim} />
        <path d="M28 12L14 23M28 12l14 11" stroke="currentColor" strokeWidth="1.5" fill="none" style={dim} />
      </svg>
    );
  if (type === 'pyramid')
    return (
      <svg width="56" height="36" viewBox="0 0 56 36" aria-hidden="true">
        <rect x="20" y="2" width="16" height="9" rx="1" fill="currentColor" />
        <rect x="13" y="13" width="30" height="9" rx="1" fill="currentColor" style={{ opacity: 0.7 }} />
        <rect x="6" y="24" width="44" height="9" rx="1" fill="currentColor" style={dim} />
      </svg>
    );
  return (
    <svg width="56" height="36" viewBox="0 0 56 36" aria-hidden="true">
      {[0, 1].map((r) =>
        [0, 1].map((c) => (
          <g key={`${r}${c}`}>
            <rect x={2 + c * 28} y={2 + r * 18} width="3" height="14" fill="currentColor" />
            <rect x={5 + c * 28} y={2 + r * 18} width="21" height="14" fill="currentColor" style={dim} />
          </g>
        )),
      )}
    </svg>
  );
}

export function DiagramDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { doc, slide } = ctx;

  const flatExample = [t('Analyse'), t('Conception'), t('Développement'), t('Déploiement')].join('\n');
  const hierExample = [t('Direction'), '  ' + t('Pôle études'), '  ' + t('Pôle projets'), '    ' + t('Équipe web')].join('\n');

  const [type, setType] = useState<DiagramType>('process');
  const [text, setText] = useState(flatExample);
  const [touched, setTouched] = useState(false);

  // Swap the sample for a nested one when hierarchy is picked, as long as the user hasn't typed.
  const pickType = (id: DiagramType) => {
    setType(id);
    if (!touched) setText(id === 'hierarchy' ? hierExample : flatExample);
  };

  const items = parseDiagramText(text);
  const levels = items.length ? Math.max(...items.map((i) => i.level)) + 1 : 0;

  const insert = () => {
    if (!slide || ctx.readOnly || !items.length) return;
    const specs = layoutDiagram(type, items, getSlideSize(doc), ctx.theme?.palette);
    const ids = insertDiagram(slide, specs);
    ctx.setSelectedIds(ids); // select the whole new group
    onClose();
  };

  return (
    <Modal
      title={t('Insérer un diagramme')}
      icon="account_tree"
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="modal-btn" onClick={onClose}>
            {t('Annuler')}
          </button>
          <button className="modal-btn primary" disabled={!items.length} onClick={insert}>
            {t('Insérer')}
          </button>
        </>
      }
    >
      <div className="diag-types" role="radiogroup" aria-label={t('Type de diagramme')}>
        {TYPES.map((d) => (
          <button
            key={d.id}
            role="radio"
            aria-checked={type === d.id}
            className={`diag-type${type === d.id ? ' is-active' : ''}`}
            onClick={() => pickType(d.id)}
          >
            <Preview type={d.id} />
            <span>{t(d.label)}</span>
          </button>
        ))}
      </div>
      <label className="diag-label" htmlFor="diag-src">
        {t('Un élément par ligne. Indentez de deux espaces pour créer un sous-niveau (hiérarchie).')}
      </label>
      <textarea
        id="diag-src"
        className="diag-src"
        rows={7}
        autoFocus
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setTouched(true);
        }}
      />
      <p className="diag-meta">
        {t('{{n}} éléments · {{l}} niveaux', { n: items.length, l: levels })}
        {' · '}
        {t('{{max}} éléments au maximum', { max: DIAGRAM_MAX_ITEMS })}
      </p>
    </Modal>
  );
}
