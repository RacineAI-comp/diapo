import { useTranslation } from 'react-i18next';
import { useEditorCtx } from '../state/editorContext';
import { deleteObject, setProp, reorder } from '../crdt/scene.js';
import { duplicateObject } from '../lib/insert';
import { addThread } from '../crdt/comments.js';
import { ColorPopover } from './ui/ColorPopover';
import { Icon } from './ui/Icon';
import './FloatingToolbar.css';

interface Props {
  anchor: { top: number; left: number; width: number; height: number } | null;
}

const BAR_H = 40; // approx toolbar height
const ROTATE_CLEARANCE = 46; // space the rotate handle occupies above the object

// Contextual toolbar that floats just above the selected object. Quick actions only, deep options
// live in the inspector. Hidden while editing text (the text box shows its own format toolbar).
export function FloatingToolbar({ anchor }: Props) {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { slide, selectedObj: o, editingId } = ctx;
  if (!slide || !o || !anchor || editingId === o.id) return null;

  const isShape = o.type === 'shape' || o.type === 'rect' || o.type === 'ellipse';
  const idx = ctx.objects.findIndex((x) => x.id === o.id);
  const last = ctx.objects.length - 1;

  const addComment = () => {
    const text = window.prompt(t('Commentaire :'));
    if (!text) return;
    const user = (ctx.awareness as { getLocalState?: () => { user?: { name?: string; color?: string } } } | null)?.getLocalState?.()?.user;
    addThread(ctx.doc, { slideId: slide.get('id') as string, objectId: o.id, author: user?.name || t('Moi'), color: user?.color || '#1167d4', text });
    ctx.setOverlay('comments');
  };

  // The rotate handle sits above the object, so default to placing the toolbar BELOW it. Flip to
  // above (clearing the rotate handle) only when there isn't room below.
  const belowTop = anchor.top + anchor.height + 12;
  const roomBelow = belowTop + BAR_H < window.innerHeight - 36; // keep clear of the status bar
  const top = roomBelow ? belowTop : Math.max(8, anchor.top - ROTATE_CLEARANCE - BAR_H);

  return (
    <div className="floatbar" style={{ top, left: anchor.left }} onPointerDown={(e) => e.stopPropagation()}>
      {o.type === 'text' && (
        <button className="fb-btn" title={t('Modifier le texte')} onClick={() => ctx.setEditingId(o.id)}>
          <Icon name="edit" />
        </button>
      )}
      {isShape && (
        <span className="fb-color">
          <ColorPopover compact value={o.fill} themeColors={ctx.theme?.palette} title={t('Remplissage')} onChange={(c) => setProp(slide, o.id, 'fill', c)} />
        </span>
      )}
      {(o.type === 'line' || o.type === 'icon') && (
        <span className="fb-color">
          <ColorPopover compact value={o.type === 'line' ? o.stroke : o.fill} themeColors={ctx.theme?.palette} title={t('Couleur')} onChange={(c) => setProp(slide, o.id, o.type === 'line' ? 'stroke' : 'fill', c)} />
        </span>
      )}
      <button className="fb-btn" title={t('Dupliquer')} onClick={() => { const id = duplicateObject(slide, o.id); if (id) ctx.setSelected(id); }}>
        <Icon name="content_copy" />
      </button>
      <button className="fb-btn" title={t('Avancer')} disabled={idx >= last} onClick={() => reorder(slide, o.id, idx + 1)}>
        <Icon name="flip_to_front" />
      </button>
      <button className="fb-btn" title={t('Reculer')} disabled={idx <= 0} onClick={() => reorder(slide, o.id, idx - 1)}>
        <Icon name="flip_to_back" />
      </button>
      <button className={`fb-btn${o.locked ? ' is-on' : ''}`} title={o.locked ? t('Déverrouiller') : t('Verrouiller')} onClick={() => setProp(slide, o.id, 'locked', !o.locked)}>
        <Icon name={o.locked ? 'lock' : 'lock_open'} />
      </button>
      <button className="fb-btn" title={t('Commenter')} onClick={addComment}>
        <Icon name="add_comment" />
      </button>
      <button className="fb-btn fb-danger" title={t('Supprimer')} onClick={() => { deleteObject(slide, o.id); ctx.setSelected(null); }}>
        <Icon name="delete" />
      </button>
    </div>
  );
}
