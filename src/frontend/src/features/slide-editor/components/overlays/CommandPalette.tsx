import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorCtx } from '../../state/editorContext';
import { Icon } from '../ui/Icon';
import { addSlide, duplicateSlide, deleteSlide } from '../../crdt/slides.js';
import { setTheme } from '../../crdt/deck.js';
import { insertText, insertTable, insertChart, applyLayout } from '../../lib/insert';
import { exportDeckToPdf } from '../../lib/exportPdf';
import { exportDeckToPptx } from '../../lib/exportPptx';
import { THEMES } from '../../data/themes';
import { LAYOUTS } from '../../data/layouts';
import './CommandPalette.css';

interface Cmd {
  id: string;
  label: string;
  icon: string;
  hint?: string;
  run: () => void;
}

// Ctrl/⌘+K command palette, a fast keyboard path to every editor action.
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { doc, slide, activeIndex, setActiveIndex } = ctx;
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  const commands = useMemo<Cmd[]>(() => {
    const ro = ctx.readOnly;
    const exportFailed = () => ctx.setExportError(t('L’export a échoué. Veuillez réessayer.'));
    // Mutating commands are hidden entirely in read-only sessions.
    const mutating: Cmd[] = ro
      ? []
      : [
          { id: 'slide-new', label: t('Nouvelle diapositive'), icon: 'add', run: () => setActiveIndex(addSlide(doc, activeIndex + 1)) },
          { id: 'slide-dup', label: t('Dupliquer la diapositive'), icon: 'content_copy', run: () => setActiveIndex(duplicateSlide(doc, activeIndex)) },
          { id: 'slide-del', label: t('Supprimer la diapositive'), icon: 'delete', run: () => deleteSlide(doc, activeIndex) },
          { id: 'ins-text', label: t('Insérer une zone de texte'), icon: 'title', run: () => slide && ctx.setSelected(insertText(slide)) },
          { id: 'ins-table', label: t('Insérer un tableau'), icon: 'table_chart', run: () => slide && ctx.setSelected(insertTable(slide)) },
          { id: 'ins-chart', label: t('Insérer un graphique'), icon: 'insert_chart', run: () => slide && ctx.setSelected(insertChart(slide)) },
        ];
    const list: Cmd[] = [
      ...mutating,
      { id: 'next', label: t('Diapositive suivante'), icon: 'arrow_forward', run: () => setActiveIndex(activeIndex + 1) },
      { id: 'prev', label: t('Diapositive précédente'), icon: 'arrow_back', run: () => setActiveIndex(Math.max(0, activeIndex - 1)) },
      { id: 'present', label: t('Lancer la présentation'), icon: 'slideshow', run: () => ctx.setOverlay('present') },
      { id: 'export-pdf', label: t('Exporter en PDF'), icon: 'picture_as_pdf', run: () => { try { exportDeckToPdf(doc); } catch { exportFailed(); } } },
      { id: 'export-pptx', label: t('Exporter en PPTX'), icon: 'slideshow', run: () => { exportDeckToPptx(doc).catch(exportFailed); } },
      { id: 'grid', label: t('Afficher/masquer la grille'), icon: 'grid_4x4', run: () => ctx.setShowGrid(!ctx.showGrid) },
      { id: 'notes', label: t('Afficher/masquer les notes'), icon: 'sticky_note_2', run: () => ctx.setShowNotes(!ctx.showNotes) },
      { id: 'comments', label: t('Commentaires'), icon: 'comment', run: () => ctx.setOverlay('comments') },
      { id: 'versions', label: t('Historique des versions'), icon: 'history', run: () => ctx.setOverlay('versions') },
      { id: 'find', label: t('Rechercher / Remplacer'), icon: 'search', run: () => ctx.setOverlay('find') },
      { id: 'a11y', label: t('Vérifier l’accessibilité'), icon: 'accessibility_new', run: () => ctx.setOverlay('a11y') },
      ...(ro ? [] : [{ id: 'import', label: t('Importer (.pptx)'), icon: 'upload_file', run: () => ctx.setOverlay('import') } as Cmd]),
      { id: 'dark', label: t('Mode sombre'), icon: 'dark_mode', run: () => ctx.setDark(!ctx.dark) },
      { id: 'outline', label: t('Plan (vue plan)'), icon: 'segment', run: () => ctx.setShowOutline(!ctx.showOutline) },
      { id: 'rulers', label: t('Règles'), icon: 'straighten', run: () => ctx.setShowRulers(!ctx.showRulers) },
      { id: 'shortcuts', label: t('Raccourcis clavier'), icon: 'keyboard', run: () => ctx.setOverlay('shortcuts') },
    ];
    if (!ro) {
      for (const th of THEMES) list.push({ id: 'theme-' + th.id, label: t('Thème : {{label}}', { label: t(th.label) }), icon: 'palette', hint: t('Conception'), run: () => setTheme(doc, th) });
      for (const l of LAYOUTS) list.push({ id: 'layout-' + l.id, label: t('Disposition : {{label}}', { label: t(l.label) }), icon: l.icon, hint: t('Accueil'), run: () => slide && applyLayout(slide, l.id) });
    }
    return list;
  }, [doc, slide, activeIndex, setActiveIndex, ctx, t]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(s));
  }, [q, commands]);

  const exec = (c?: Cmd) => {
    if (!c) return;
    c.run();
    onClose();
  };

  return (
    <div className="cmd-scrim" onMouseDown={onClose}>
      <div className="cmd-card" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={t('Palette de commandes')}>
        <div className="cmd-input">
          <Icon name="search" />
          <input
            autoFocus
            placeholder={t('Rechercher une commande…')}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(filtered.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                exec(filtered[active]);
              }
            }}
          />
        </div>
        <ul className="cmd-list">
          {filtered.length === 0 && <li className="cmd-empty">{t('Aucune commande')}</li>}
          {filtered.map((c, i) => (
            <li key={c.id}>
              <button className={`cmd-item${i === active ? ' is-active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => exec(c)}>
                <Icon name={c.icon} />
                <span className="cmd-label">{c.label}</span>
                {c.hint && <span className="cmd-hint">{c.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
