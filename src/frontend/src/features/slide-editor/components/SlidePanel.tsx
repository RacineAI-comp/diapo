import { useEffect, useReducer, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@gouvfr-lasuite/cunningham-react';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import {
  getSlides,
  addSlide,
  deleteSlide,
  duplicateSlide,
  moveSlide,
  getSection,
  setSection,
} from '../crdt/slides.js';
import { listObjects } from '../crdt/scene.js';
import { getSlideSize } from '../crdt/deck.js';
import type { ChartData, YSlide } from '../crdt/scene';
import { useEditorCtx } from '../state/editorContext';
import './SlidePanel.css';

const icon = (name: string) => (
  <span className="material-icons" aria-hidden="true">
    {name}
  </span>
);

// The thumbnail rail: a live, scaled mini-preview of every
// slide. Click a thumbnail to navigate; the buttons add / duplicate / delete / reorder slides.
interface Props {
  provider: HocuspocusProvider;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
}

// The stage is 960x540 (see SlideCanvas). Thumbnails scale that down by THUMB_SCALE.
const STAGE_W = 960;
const STAGE_H = 540;
const THUMB_SCALE = 0.15; // -> 144x81 thumbnail, fits the rail with margin

export function SlidePanel({ provider, activeIndex, setActiveIndex }: Props) {
  const { t } = useTranslation();
  const { readOnly } = useEditorCtx();
  const doc = provider.document;
  const [, force] = useReducer((c: number) => c + 1, 0);

  // Re-render whenever the deck changes shape (add/delete/move) OR any slide's contents
  // change (objects moved, recoloured, etc.) so the previews stay live. observeDeep covers
  // the whole slides subtree on both the local peer and remote updates.
  useEffect(() => {
    const slides = getSlides(doc);
    const fn = () => force();
    slides.observeDeep(fn);
    return () => slides.unobserveDeep(fn);
  }, [doc]);

  const slides = getSlides(doc);
  const count = slides.length;
  const active = Math.max(0, Math.min(activeIndex, count - 1));

  const onAdd = () => {
    // Insert after the active slide and navigate to it.
    const at = addSlide(doc, active + 1);
    setActiveIndex(at);
  };

  const onDuplicate = () => {
    if (count === 0) return;
    const at = duplicateSlide(doc, active);
    if (at >= 0) setActiveIndex(at);
  };

  const onDelete = () => {
    if (count <= 1) return; // keep at least one slide
    deleteSlide(doc, active);
    // Clamp the active index into the shrunken deck.
    setActiveIndex(Math.max(0, Math.min(active, count - 2)));
  };

  const onMoveUp = () => {
    if (active <= 0) return;
    moveSlide(doc, active, active - 1);
    setActiveIndex(active - 1);
  };

  const onMoveDown = () => {
    if (active >= count - 1) return;
    moveSlide(doc, active, active + 1);
    setActiveIndex(active + 1);
  };

  const onAddSection = () => {
    const s = getSlides(doc).get(active) as YSlide | undefined;
    if (s) setSection(s, t('Nouvelle section'));
  };

  return (
    <aside className="slide-panel" aria-label={t('Diapositives')}>
      <div className="slide-panel__toolbar">
        <Button size="nano" variant="tertiary" color="neutral" icon={icon('add')} onClick={onAdd} disabled={readOnly} aria-label={t('Ajouter une diapositive')} />
        <Button size="nano" variant="tertiary" color="neutral" icon={icon('content_copy')} onClick={onDuplicate} disabled={readOnly || count === 0} aria-label={t('Dupliquer la diapositive')} />
        <Button size="nano" variant="tertiary" color="neutral" icon={icon('delete')} onClick={onDelete} disabled={readOnly || count <= 1} aria-label={t('Supprimer la diapositive')} />
        <span className="slide-panel__sep" />
        <Button size="nano" variant="tertiary" color="neutral" icon={icon('arrow_upward')} onClick={onMoveUp} disabled={readOnly || active <= 0} aria-label={t('Monter')} />
        <Button size="nano" variant="tertiary" color="neutral" icon={icon('arrow_downward')} onClick={onMoveDown} disabled={readOnly || active >= count - 1} aria-label={t('Descendre')} />
        <span className="slide-panel__sep" />
        <Button size="nano" variant="tertiary" color="neutral" icon={icon('segment')} onClick={onAddSection} disabled={readOnly} aria-label={t('Ajouter une section')} />
      </div>

      <ol className="slide-panel__list">
        {slides.map((slide, i) => {
          const section = getSection(slide);
          return (
            <li key={(slide.get('id') as string) ?? i} className="slide-panel__row">
              {section && (
                <div className="slide-section">
                  <span className="material-icons" aria-hidden="true">expand_more</span>
                  <input
                    className="slide-section__title"
                    value={section}
                    readOnly={readOnly}
                    onChange={(e) => setSection(slide, e.target.value)}
                    aria-label={t('Titre de section')}
                  />
                  {!readOnly && (
                    <button className="slide-section__del" title={t('Supprimer la section')} onClick={() => setSection(slide, null)}>
                      <span className="material-icons" aria-hidden="true">close</span>
                    </button>
                  )}
                </div>
              )}
              <SlideThumb slide={slide} index={i} active={i === active} onSelect={() => setActiveIndex(i)} />
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

interface ThumbProps {
  slide: YSlide;
  index: number;
  active: boolean;
  onSelect: () => void;
}

// Tiny bar sketch of a chart's real data for the thumbnail (a solid box read as a bug).
function ChartSketch({ data }: { data: ChartData }) {
  const series = data.series || [];
  const n = data.categories?.length || series[0]?.values?.length || 0;
  const max = Math.max(1, ...series.flatMap((s) => s.values || []));
  const bars: ReactNode[] = [];
  for (let ci = 0; ci < n; ci++) {
    series.forEach((s, si) => {
      bars.push(
        <span
          key={`${ci}-${si}`}
          style={{
            flex: 1,
            height: `${Math.max(4, (100 * (s.values?.[ci] || 0)) / max)}%`,
            background: s.color || '#60a5fa',
            borderRadius: 2,
          }}
        />,
      );
    });
    if (ci < n - 1) bars.push(<span key={`gap-${ci}`} style={{ flex: 0.6 }} />);
  }
  return <span className="slide-thumb__chart">{bars}</span>;
}

// Same auto-contrast rule as SlideObjectView: dark slide background → light default text.
function isDark(color: string): boolean {
  if (!color || !color.startsWith('#')) return false;
  let h = color.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return false;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

function SlideThumb({ slide, index, active, onSelect }: ThumbProps) {
  const { t } = useTranslation();
  const objects = listObjects(slide);
  const background = (slide.get('background') as string) ?? '#ffffff';
  const defaultInk = isDark(background) ? '#f8fafc' : '#0f172a';
  const size = slide.doc ? getSlideSize(slide.doc) : { w: STAGE_W, h: STAGE_H };

  return (
    <div className={`slide-thumb${active ? ' is-active' : ''}`}>
      <button
        type="button"
        className="slide-thumb__btn"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        aria-label={t('Diapositive {{n}}', { n: index + 1 })}
      >
        <span
          className="slide-thumb__frame"
          style={{ width: size.w * THUMB_SCALE, height: size.h * THUMB_SCALE }}
        >
          <span className="slide-thumb__num">{index + 1}</span>
          <span
            className="slide-thumb__canvas"
            style={{
              width: size.w,
              height: size.h,
              background,
              transform: `scale(${THUMB_SCALE})`,
            }}
          >
            {objects.map((o) => (
              <span
                key={o.id}
                className={`slide-thumb__obj${o.type === 'text' ? ' is-text' : ''}`}
                style={{
                  left: o.x,
                  top: o.y,
                  width: o.w,
                  height: o.h,
                  transform: `rotate(${o.rotation || 0}deg)`,
                  opacity: o.opacity ?? 1,
                  background:
                    o.type === 'text' || o.type === 'image' || o.type === 'chart'
                      ? 'transparent'
                      : o.fill || '#dbeafe',
                  borderRadius: o.type === 'ellipse' ? '50%' : 8,
                  // Text: per-box colour/size when set, else contrast the slide background
                  // (the CSS default is the app ink, wrong on dark slides).
                  ...(o.type === 'text'
                    ? { color: o.fill || defaultInk, fontSize: o.fontSize || undefined }
                    : {}),
                }}
              >
                {o.type === 'text' ? (
                  o.text
                ) : o.type === 'image' && o.src ? (
                  <img
                    src={o.src}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : o.type === 'chart' && o.data?.series?.length ? (
                  <ChartSketch data={o.data} />
                ) : null}
              </span>
            ))}
          </span>
        </span>
      </button>
    </div>
  );
}
