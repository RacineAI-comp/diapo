import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorCtx } from '../../state/editorContext';
import { getSlides } from '../../crdt/slides.js';
import { listObjects } from '../../crdt/scene.js';
import { getPlainText } from '../../crdt/text.js';
import { Modal } from './Modal';
import { Icon } from './../ui/Icon';

interface Issue {
  slideIndex: number;
  objectId?: string;
  level: 'error' | 'warn';
  message: string;
}

// Relative luminance + WCAG contrast ratio (RGAA references WCAG AA: 4.5:1 for normal text).
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length < 6) return 1;
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a: string, b: string): number {
  const la = luminance(a) + 0.05;
  const lb = luminance(b) + 0.05;
  return la > lb ? la / lb : lb / la;
}

// Accessibility checker (RGAA / WCAG AA). Sovereign, local, also a procurement gate.
export function AccessibilityChecker({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { doc } = ctx;

  const issues = useMemo<Issue[]>(() => {
    const out: Issue[] = [];
    getSlides(doc).forEach((slide, slideIndex) => {
      const bg = (slide.get('background') as string) || '#ffffff';
      const objs = listObjects(slide);
      const objMap = slide.get('objects') as { get(id: string): unknown };
      let hasText = false;
      for (const o of objs) {
        if (o.type === 'image' && !(o.alt && o.alt.trim())) {
          out.push({ slideIndex, objectId: o.id, level: 'error', message: t('Image sans texte alternatif') });
        }
        if (o.type === 'text') {
          const txt = getPlainText(objMap.get(o.id) as never).trim();
          if (txt) hasText = true;
          const fg = o.fill || '#0f172a';
          if (txt && contrast(fg, bg) < 4.5) {
            out.push({ slideIndex, objectId: o.id, level: 'warn', message: t('Contraste insuffisant ({{ratio}}:1, min 4.5:1)', { ratio: contrast(fg, bg).toFixed(1) }) });
          }
        }
      }
      if (!hasText && objs.length > 0) {
        out.push({ slideIndex, level: 'warn', message: t('Diapositive sans titre ni texte') });
      }
    });
    return out;
  }, [doc, ctx.objects, t]);

  const go = (it: Issue) => {
    ctx.setActiveIndex(it.slideIndex);
    if (it.objectId) ctx.setSelected(it.objectId);
    onClose();
  };

  return (
    <Modal title={t('Vérification de l’accessibilité (RGAA)')} icon="accessibility_new" onClose={onClose} width={520}>
      {issues.length === 0 ? (
        <div className="a11y-ok">
          <Icon name="verified" />
          <p>{t('Aucun problème détecté. Pensez tout de même à vérifier l’ordre de lecture.')}</p>
        </div>
      ) : (
        <ul className="a11y-list">
          {issues.map((it, i) => (
            <li key={i}>
              <button className={`a11y-item ${it.level}`} onClick={() => go(it)}>
                <Icon name={it.level === 'error' ? 'error' : 'warning'} />
                <span className="a11y-msg">{it.message}</span>
                <span className="a11y-slide">{t('Diapo {{n}}', { n: it.slideIndex + 1 })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
