import { useEffect, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { getNotes, setNotes } from '../crdt/slides.js';
import type { YSlide } from '../crdt/scene';
import { useEditorCtx } from '../state/editorContext';
import './NotesBar.css';

// Per-slide speaker notes (v0.3). Synced over Yjs; shown to the presenter in present mode.
export function NotesBar({ slide }: { slide: YSlide | null }) {
  const { t } = useTranslation();
  const { readOnly } = useEditorCtx();
  const [, bump] = useReducer((c: number) => c + 1, 0);
  useEffect(() => {
    if (!slide) return;
    const fn = () => bump();
    slide.observe(fn);
    return () => slide.unobserve(fn);
  }, [slide]);

  if (!slide) return null;
  return (
    <div className="notes-bar">
      <span className="notes-bar__icon material-icons" aria-hidden="true">
        sticky_note_2
      </span>
      <textarea
        className="notes-bar__input"
        placeholder={t('Notes du présentateur (visibles uniquement en mode présentation)…')}
        value={getNotes(slide)}
        readOnly={readOnly}
        onChange={(e) => setNotes(slide, e.target.value)}
        rows={2}
        aria-label={t('Notes du présentateur')}
      />
    </div>
  );
}
