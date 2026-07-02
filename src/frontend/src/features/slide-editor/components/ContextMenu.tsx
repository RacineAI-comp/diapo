import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorCtx } from '../state/editorContext';
import { addObject, deleteObject, reorder, setProp } from '../crdt/scene.js';
import { duplicateObject } from '../lib/insert';
import { parseSheet } from '../lib/parseSheet';
import { groupObjects, ungroupObjects } from '../lib/align';
import { addThread } from '../crdt/comments.js';
import { MenuItem } from './ui/Popover';

interface Props {
  x: number;
  y: number;
  onClose: () => void;
}

// Right-click menu on the canvas. Acts on the current selection (the canvas selects the
// right-clicked object first). Uses the shared MenuItem styling in a fixed-position panel.
export function ContextMenu({ x, y, onClose }: Props) {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { slide, selectedIds, objects } = ctx;

  useEffect(() => {
    const close = () => onClose();
    document.addEventListener('mousedown', close);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [onClose]);

  if (!slide) return null;
  // Read-only: only non-mutating entries (selection, view toggles).
  const has = selectedIds.length > 0 && !ctx.readOnly;
  const primary = selectedIds[0];
  const idx = objects.findIndex((o) => o.id === primary);
  const last = objects.length - 1;
  const grouped = objects.some((o) => selectedIds.includes(o.id) && o.group);
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  // Paste spreadsheet cells (Excel/Calc clipboard is TSV) as a table object at the
  // right-click point. Needs the async Clipboard API; hidden when unavailable and in
  // read-only mode. Failures surface through the TopBar alert (same as export errors).
  const canPasteTable = !ctx.readOnly && typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;
  const pasteTable = async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      ctx.setExportError(t('Lecture du presse-papiers impossible : autorisez l’accès au presse-papiers puis réessayez.'));
      return;
    }
    const grid = parseSheet(text);
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    if (rows * cols < 2) {
      ctx.setExportError(t('Le presse-papiers ne contient pas de données de tableau.'));
      return;
    }
    // Same caps as resizeTable, same default styling as the ribbon's insertTable.
    const r = Math.min(rows, 20);
    const c = Math.min(cols, 12);
    const cells = grid.slice(0, r).map((row) => row.slice(0, c));
    const size = ctx.slideSize;
    const w = Math.min(Math.max(c * 120, 240), Math.round(size.w * 0.9));
    const h = Math.min(Math.max(r * 36, 80), Math.round(size.h * 0.9));
    // Menu coords are screen px; map them onto the (scaled) slide, else center.
    let px = Math.round((size.w - w) / 2);
    let py = Math.round((size.h - h) / 2);
    const el = document.querySelector('.slide');
    if (el) {
      const rect = el.getBoundingClientRect();
      const s = rect.width / size.w;
      if (s > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        px = Math.round((x - rect.left) / s);
        py = Math.round((y - rect.top) / s);
      }
    }
    px = Math.max(0, Math.min(px, size.w - w));
    py = Math.max(0, Math.min(py, size.h - h));
    const id = addObject(slide, { type: 'table', rows: r, cols: c, cells, banding: true, fill: '#f1f5f9', stroke: '#cbd5e1', x: px, y: py, w, h });
    if (id) ctx.setSelected(id);
  };

  return (
    <div className="pop-panel" style={{ position: 'fixed', top: y, left: x, zIndex: 5000 }} role="menu" onMouseDown={(e) => e.stopPropagation()}>
      {has ? (
        <>
          <MenuItem icon="content_copy" label={t('Dupliquer')} shortcut="Ctrl+D" onClick={run(() => { const id = duplicateObject(slide, primary); if (id) ctx.setSelected(id); })} />
          <MenuItem icon="flip_to_front" label={t('Premier plan')} onClick={run(() => reorder(slide, primary, last))} />
          <MenuItem icon="flip_to_back" label={t('Mettre à l’arrière-plan')} onClick={run(() => reorder(slide, primary, 0))} />
          <div className="pop-sep" />
          {selectedIds.length > 1 && <MenuItem icon="join_full" label={t('Grouper')} onClick={run(() => groupObjects(slide, selectedIds))} />}
          {grouped && <MenuItem icon="join_inner" label={t('Dégrouper')} onClick={run(() => ungroupObjects(slide, selectedIds))} />}
          <MenuItem icon="lock" label={t('Verrouiller / Déverrouiller')} onClick={run(() => selectedIds.forEach((id) => { const o = objects.find((x) => x.id === id); setProp(slide, id, 'locked', !o?.locked); }))} />
          <MenuItem
            icon="add_comment"
            label={t('Commenter')}
            onClick={run(() => {
              const text = window.prompt(t('Commentaire :'));
              if (!text) return;
              const u = (ctx.awareness as { getLocalState?: () => { user?: { name?: string; color?: string } } } | null)?.getLocalState?.()?.user;
              addThread(ctx.doc, { slideId: slide.get('id') as string, objectId: primary, author: u?.name || t('Moi'), color: u?.color || '#1167d4', text });
              ctx.setOverlay('comments');
            })}
          />
          <div className="pop-sep" />
          <MenuItem icon="delete" label={t('Supprimer')} shortcut={t('Suppr')} danger onClick={run(() => { selectedIds.forEach((id) => deleteObject(slide, id)); ctx.setSelected(null); })} />
        </>
      ) : (
        <>
          <MenuItem icon="select_all" label={t('Tout sélectionner')} shortcut="Ctrl+A" onClick={run(() => ctx.setSelectedIds(objects.map((o) => o.id)))} />
          {canPasteTable && <MenuItem icon="grid_on" label={t('Coller un tableau')} onClick={run(() => { void pasteTable(); })} />}
          <MenuItem icon="grid_4x4" label={ctx.showGrid ? t('Masquer la grille') : t('Afficher la grille')} onClick={run(() => ctx.setShowGrid(!ctx.showGrid))} />
        </>
      )}
    </div>
  );
}
