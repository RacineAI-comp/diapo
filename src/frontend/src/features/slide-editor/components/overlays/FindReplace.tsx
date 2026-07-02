import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorCtx } from '../../state/editorContext';
import { getSlides } from '../../crdt/slides.js';
import { listObjects } from '../../crdt/scene.js';
import { getPlainText, setPlainText } from '../../crdt/text.js';
import { Icon } from '../ui/Icon';
import './FindReplace.css';

interface Match {
  slideIndex: number;
  objectId: string;
}

// Find & Replace across every text object in the deck (operates on the plain-text mirror, then
// rewrites the rich body via setPlainText). Sovereign + local, no external service.
export function FindReplace({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { doc } = ctx;
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [cursor, setCursor] = useState(0);

  const matches = useMemo<Match[]>(() => {
    if (!find) return [];
    const out: Match[] = [];
    const needle = find.toLowerCase();
    getSlides(doc).forEach((slide, slideIndex) => {
      const objects = slide.get('objects') as { get(id: string): unknown };
      for (const o of listObjects(slide)) {
        if (o.type !== 'text') continue;
        const text = getPlainText(objects.get(o.id) as never).toLowerCase();
        if (text.includes(needle)) out.push({ slideIndex, objectId: o.id });
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find, doc, ctx.objects]);

  const goTo = (i: number) => {
    const m = matches[(i + matches.length) % matches.length];
    if (!m) return;
    setCursor((i + matches.length) % matches.length);
    ctx.setActiveIndex(m.slideIndex);
    ctx.setSelected(m.objectId);
  };

  const replaceAll = () => {
    if (!find) return;
    const re = new RegExp(escapeRegExp(find), 'gi');
    doc.transact(() => {
      getSlides(doc).forEach((slide) => {
        const objects = slide.get('objects') as { get(id: string): unknown };
        for (const o of listObjects(slide)) {
          if (o.type !== 'text') continue;
          const map = objects.get(o.id) as never;
          const text = getPlainText(map);
          if (re.test(text)) setPlainText(map, text.replace(re, replace));
          re.lastIndex = 0;
        }
      });
    });
  };

  return (
    <div className="find-panel" role="dialog" aria-label={t('Rechercher et remplacer')}>
      <div className="find-row">
        <Icon name="search" />
        <input autoFocus placeholder={t('Rechercher')} value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && goTo(cursor + 1)} />
        <span className="find-count">{matches.length ? `${Math.min(cursor + 1, matches.length)}/${matches.length}` : '0'}</span>
        <button className="find-btn" title={t('Précédent')} onClick={() => goTo(cursor - 1)} disabled={!matches.length}>
          <Icon name="keyboard_arrow_up" />
        </button>
        <button className="find-btn" title={t('Suivant')} onClick={() => goTo(cursor + 1)} disabled={!matches.length}>
          <Icon name="keyboard_arrow_down" />
        </button>
        <button className="find-btn" title={t('Fermer')} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="find-row">
        <Icon name="find_replace" />
        <input placeholder={t('Remplacer par')} value={replace} onChange={(e) => setReplace(e.target.value)} />
        <button className="find-replace-btn" onClick={replaceAll} disabled={!matches.length}>
          {t('Tout remplacer')}
        </button>
      </div>
    </div>
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
