import { useEffect, useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18next from '../../../../i18n';
import { useEditorCtx } from '../../state/editorContext';
import { getComments, listThreads, addThread, addReply, setResolved, deleteThread, parseMentions } from '../../crdt/comments.js';
import { Icon } from '../ui/Icon';
import './CommentsPanel.css';

function localUser(awareness: unknown): { name: string; color: string } {
  const u = (awareness as { getLocalState?: () => { user?: { name?: string; color?: string } } } | null)?.getLocalState?.()?.user;
  return { name: u?.name || i18next.t('Moi'), color: u?.color || '#1167d4' };
}

// Comments side panel (replaces the inspector when Commentaires is on). Threads anchor to the
// current slide / selected object; supports replies, @mentions (parsed), resolve and delete.
export function CommentsPanel() {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { doc, slide } = ctx;
  const [, bump] = useReducer((c: number) => c + 1, 0);
  const [draft, setDraft] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    const map = getComments(doc);
    const fn = () => bump();
    map.observeDeep(fn);
    return () => map.unobserveDeep(fn);
  }, [doc]);

  const slideId = slide?.get('id') as string | undefined;
  const all = slideId ? listThreads(doc, { slideId }) : [];
  const threads = all.filter((th) => showResolved || !th.resolved);

  const post = () => {
    if (!draft.trim() || !slideId) return;
    const u = localUser(ctx.awareness);
    addThread(doc, { slideId, objectId: ctx.selected, author: u.name, color: u.color, text: draft.trim() });
    setDraft('');
  };

  return (
    <aside className="comments" aria-label={t('Commentaires')}>
      <div className="comments-head">
        <strong>{t('Commentaires')}</strong>
        <div className="comments-head-actions">
          <button className={`comments-filter${showResolved ? ' is-on' : ''}`} onClick={() => setShowResolved((s) => !s)} title={t('Afficher les résolus')}>
            <Icon name="done_all" />
          </button>
          <button className="comments-filter" onClick={() => ctx.setOverlay(null)} title={t('Fermer')}>
            <Icon name="close" />
          </button>
        </div>
      </div>

      <div className="comments-list">
        {threads.length === 0 && <p className="comments-empty">{t('Aucun commentaire sur cette diapositive.')}</p>}
        {threads.map((th) => (
          <div key={th.id} className={`thread${th.resolved ? ' is-resolved' : ''}`}>
            {th.items.map((it) => (
              <div key={it.id} className="thread-item">
                <span className="thread-avatar" style={{ background: it.color }}>
                  {it.author.slice(0, 1).toUpperCase()}
                </span>
                <div className="thread-body">
                  <div className="thread-author">{it.author}</div>
                  <div className="thread-text">{renderMentions(it.text)}</div>
                </div>
              </div>
            ))}
            <div className="thread-actions">
              <ReplyBox onReply={(text) => { const u = localUser(ctx.awareness); addReply(doc, th.id, { author: u.name, color: u.color, text }); }} />
              <button onClick={() => setResolved(doc, th.id, !th.resolved)} title={th.resolved ? t('Rouvrir') : t('Résoudre')}>
                <Icon name={th.resolved ? 'replay' : 'check_circle'} />
              </button>
              <button onClick={() => deleteThread(doc, th.id)} title={t('Supprimer')}>
                <Icon name="delete" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="comments-new">
        <textarea placeholder={ctx.selected ? t('Commenter l’objet sélectionné… (@ pour mentionner)') : t('Commenter la diapositive…')} value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} />
        <button className="comments-post" onClick={post} disabled={!draft.trim()}>
          <Icon name="send" /> {t('Publier')}
        </button>
      </div>
    </aside>
  );
}

function ReplyBox({ onReply }: { onReply: (text: string) => void }) {
  const { t } = useTranslation();
  const [v, setV] = useState('');
  return (
    <input
      className="thread-reply"
      placeholder={t('Répondre…')}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && v.trim()) {
          onReply(v.trim());
          setV('');
        }
      }}
    />
  );
}

function renderMentions(text: string) {
  const mentions = new Set(parseMentions(text));
  if (!mentions.size) return text;
  return text.split(/(@[\p{L}\p{N}_.-]+)/u).map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="mention">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
