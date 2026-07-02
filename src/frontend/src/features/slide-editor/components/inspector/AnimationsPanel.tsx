import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorCtx } from '../../state/editorContext';
import { setProp, effectiveAnims } from '../../crdt/scene.js';
import type { Anim, AnimKind } from '../../crdt/scene';
import { Icon } from '../ui/Icon';
import { Section, Row, Slider, Seg, NumberInput } from './controls';

// Labels are natural i18n keys (French source); translated at render time with t().
const KINDS: { value: AnimKind; label: string }[] = [
  { value: 'entrance', label: 'Entrée' },
  { value: 'emphasis', label: 'Emphase' },
  { value: 'exit', label: 'Sortie' },
];

const TYPES: Record<AnimKind, { value: string; label: string }[]> = {
  entrance: [
    { value: 'fade', label: 'Fondu' },
    { value: 'slide-up', label: 'Montée' },
    { value: 'zoom', label: 'Zoom' },
    { value: 'wipe', label: 'Balayage' },
  ],
  emphasis: [
    { value: 'pulse', label: 'Impulsion' },
    { value: 'tint', label: 'Teinte' },
    { value: 'shake', label: 'Secousse' },
    { value: 'grow', label: 'Agrandissement' },
  ],
  exit: [
    { value: 'fade-out', label: 'Fondu sortant' },
    { value: 'slide-down', label: 'Descente' },
    { value: 'zoom-out', label: 'Zoom arrière' },
    { value: 'wipe-out', label: 'Balayage sortant' },
  ],
};

const TRIGGERS: { value: NonNullable<Anim['trigger']>; label: string }[] = [
  { value: 'click', label: 'Au clic' },
  { value: 'with', label: 'Avec la précédente' },
  { value: 'after', label: 'Après la précédente' },
];

// The Animations tab for the selected object: an ordered list of entrance/emphasis/exit effects.
// Reads through effectiveAnims (legacy single `anim` shows as a one-item list); the first edit
// migrates the object to `anims` and clears the legacy key. Writes go through scene.js setProp,
// which enforces the doc read-only guard like every other panel.
export function AnimationsPanel() {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { slide, selectedObj: o } = ctx;
  const [newKind, setNewKind] = useState<AnimKind>('entrance');
  if (!slide || !o) return null;

  const list = effectiveAnims(o);

  const commit = (next: Anim[]) => {
    setProp(slide, o.id, 'anims', next.length ? next : undefined);
    if (o.anim) setProp(slide, o.id, 'anim', undefined); // lazy migration off the legacy key
  };
  const patch = (i: number, p: Partial<Anim>) => commit(list.map((a, j) => (j === i ? { ...a, ...p } : a)));
  const remove = (i: number) => commit(list.filter((_, j) => j !== i));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const add = (type: string) => {
    const maxOrder = list.reduce((m, a) => Math.max(m, a.order ?? 0), -1);
    commit([...list, { type, kind: newKind, duration: 500, order: maxOrder + 1, trigger: 'click' }]);
  };

  return (
    <div className="ins-body">
      {list.length === 0 && (
        <Section title={t('Animations')}>
          <p className="ins-hint">{t('Aucune animation sur cet objet.')}</p>
        </Section>
      )}
      {list.map((a, i) => {
        const kind: AnimKind = a.kind ?? 'entrance';
        const types = TYPES[kind];
        const kindLabel = KINDS.find((k) => k.value === kind)?.label ?? kind;
        const typeLabel = types.find((tp) => tp.value === a.type)?.label ?? a.type;
        return (
          <Section key={i} title={`${i + 1}. ${t(kindLabel)} · ${t(typeLabel)}`}>
            <Row label={t('Effet')}>
              <select className="ins-text" value={a.type} aria-label={t('Effet')} onChange={(e) => patch(i, { type: e.target.value })}>
                {types.map((tp) => (
                  <option key={tp.value} value={tp.value}>
                    {t(tp.label)}
                  </option>
                ))}
              </select>
            </Row>
            <Row label={t('Durée')}>
              <Slider value={a.duration ?? 500} min={100} max={2000} step={50} onChange={(n) => patch(i, { duration: n })} format={(n) => `${n} ms`} />
            </Row>
            <Row label={t('Délai')}>
              <Slider value={a.delay ?? 0} min={0} max={2000} step={50} onChange={(n) => patch(i, { delay: n || undefined })} format={(n) => `${n} ms`} />
            </Row>
            <Row label={t('Ordre')}>
              <NumberInput value={a.order ?? 0} min={0} max={99} onChange={(n) => patch(i, { order: n })} />
            </Row>
            <Row label={t('Déclencheur')}>
              <select
                className="ins-text"
                value={a.trigger ?? 'click'}
                aria-label={t('Déclencheur')}
                onChange={(e) => patch(i, { trigger: e.target.value as Anim['trigger'] })}
              >
                {TRIGGERS.map((tr) => (
                  <option key={tr.value} value={tr.value}>
                    {t(tr.label)}
                  </option>
                ))}
              </select>
            </Row>
            <div className="ins-btnrow">
              <button className="ins-btn" disabled={i === 0} title={t('Monter')} aria-label={t('Monter')} onClick={() => move(i, -1)}>
                <Icon name="arrow_upward" />
              </button>
              <button className="ins-btn" disabled={i === list.length - 1} title={t('Descendre')} aria-label={t('Descendre')} onClick={() => move(i, 1)}>
                <Icon name="arrow_downward" />
              </button>
              <button className="ins-btn" title={t('Supprimer l’animation')} aria-label={t('Supprimer l’animation')} onClick={() => remove(i)}>
                <Icon name="delete" />
              </button>
            </div>
          </Section>
        );
      })}

      <Section title={t('Ajouter une animation')}>
        <Seg value={newKind} onChange={setNewKind} options={KINDS.map((k) => ({ value: k.value, label: t(k.label) }))} />
        <div className="ins-btnrow">
          {TYPES[newKind].map((tp) => (
            <button key={tp.value} className="ins-btn" onClick={() => add(tp.value)}>
              <Icon name="add" /> {t(tp.label)}
            </button>
          ))}
        </div>
      </Section>
      <p className="ins-hint">{t('Les animations sont jouées en mode Présentation (clic ou flèche).')}</p>
    </div>
  );
}
