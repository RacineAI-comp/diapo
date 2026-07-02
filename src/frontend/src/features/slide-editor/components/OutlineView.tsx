import { useEffect, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorCtx } from '../state/editorContext';
import { getSlides } from '../crdt/slides.js';
import { listObjects } from '../crdt/scene.js';
import { getPlainText, setPlainText } from '../crdt/text.js';
import { Icon } from './ui/Icon';
import './OutlineView.css';

// Outline / plan view (View → Plan). Lists every slide by its title + body text; editing the title
// writes straight back to the title placeholder. A fast way to draft and restructure a deck.
export function OutlineView() {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { doc } = ctx;
  const [, bump] = useReducer((c: number) => c + 1, 0);

  useEffect(() => {
    const slides = getSlides(doc);
    const fn = () => bump();
    slides.observeDeep(fn);
    return () => slides.unobserveDeep(fn);
  }, [doc]);

  const slides = getSlides(doc);

  return (
    <aside className="outline" aria-label={t('Plan')}>
      <div className="outline-head">
        <strong>{t('Plan')}</strong>
        <button className="outline-close" title={t('Fermer le plan')} onClick={() => ctx.setShowOutline(false)}>
          <Icon name="close" />
        </button>
      </div>
      <ol className="outline-list">
        {slides.map((slide, i) => {
          const objs = listObjects(slide);
          const objMap = slide.get('objects') as { get(id: string): unknown };
          const titleObj = objs.find((o) => o.type === 'text' && o.ph === 'title') || objs.find((o) => o.type === 'text');
          const title = titleObj ? getPlainText(objMap.get(titleObj.id) as never) : '';
          const body = objs
            .filter((o) => o.type === 'text' && o.id !== titleObj?.id)
            .map((o) => getPlainText(objMap.get(o.id) as never))
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={(slide.get('id') as string) || i} className={`outline-item${i === ctx.activeIndex ? ' is-active' : ''}`}>
              <button className="outline-num" onClick={() => ctx.setActiveIndex(i)}>
                {i + 1}
              </button>
              <div className="outline-text">
                <input
                  className="outline-title"
                  value={title}
                  placeholder={t('Titre de la diapositive')}
                  onFocus={() => ctx.setActiveIndex(i)}
                  onChange={(e) => titleObj && setPlainText(objMap.get(titleObj.id) as never, e.target.value)}
                />
                {body && <div className="outline-body">{body}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
