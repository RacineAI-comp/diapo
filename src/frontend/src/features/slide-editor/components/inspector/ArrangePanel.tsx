import { useTranslation } from 'react-i18next';
import { useEditorCtx } from '../../state/editorContext';
import { setProps, reorder } from '../../crdt/scene.js';
import type { SlideObjectView } from '../../crdt/scene';
import { Icon } from '../ui/Icon';
import { Section, Row, NumberInput, Slider } from './controls';

// The Disposition (arrange) tab: precise geometry, alignment to the slide, and z-order. Direct
// manipulation on the canvas is primary; this is the precise/secondary path.
export function ArrangePanel() {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { slide, selectedObj: o, slideSize, objects } = ctx;
  if (!slide || !o) return null;

  const set = (patch: Partial<SlideObjectView>) => setProps(slide, o.id, patch);
  const index = objects.findIndex((x) => x.id === o.id);
  const last = objects.length - 1;

  const centerH = () => set({ x: Math.round((slideSize.w - o.w) / 2) });
  const centerV = () => set({ y: Math.round((slideSize.h - o.h) / 2) });

  return (
    <div className="ins-body">
      <Section title={t('Position & taille')}>
        <div className="ins-grid2">
          <Row label="X">
            <NumberInput value={Math.round(o.x)} onChange={(n) => set({ x: n })} suffix="px" />
          </Row>
          <Row label="Y">
            <NumberInput value={Math.round(o.y)} onChange={(n) => set({ y: n })} suffix="px" />
          </Row>
          <Row label={t('L')}>
            <NumberInput value={Math.round(o.w)} min={1} onChange={(n) => set({ w: n })} suffix="px" />
          </Row>
          <Row label={t('H')}>
            <NumberInput value={Math.round(o.h)} min={1} onChange={(n) => set({ h: n })} suffix="px" />
          </Row>
        </div>
      </Section>

      <Section title={t('Rotation')}>
        <Row>
          <Slider value={o.rotation ?? 0} min={0} max={360} onChange={(n) => set({ rotation: n })} format={(n) => `${n}°`} />
        </Row>
      </Section>

      <Section title={t('Aligner sur la diapositive')}>
        <div className="ins-btnrow">
          <button className="ins-btn" onClick={centerH} title={t('Centrer horizontalement')}>
            <Icon name="align_horizontal_center" />
          </button>
          <button className="ins-btn" onClick={centerV} title={t('Centrer verticalement')}>
            <Icon name="align_vertical_center" />
          </button>
          <button className="ins-btn" onClick={() => set({ x: 0 })} title={t('Bord gauche')}>
            <Icon name="align_horizontal_left" />
          </button>
          <button className="ins-btn" onClick={() => set({ x: slideSize.w - o.w })} title={t('Bord droit')}>
            <Icon name="align_horizontal_right" />
          </button>
        </div>
      </Section>

      <Section title={t('Ordre')}>
        <div className="ins-btnrow">
          <button className="ins-btn" disabled={index >= last} onClick={() => reorder(slide, o.id, last)} title={t('Premier plan')}>
            <Icon name="flip_to_front" />
          </button>
          <button className="ins-btn" disabled={index >= last} onClick={() => reorder(slide, o.id, index + 1)} title={t('Avancer')}>
            <Icon name="arrow_upward" />
          </button>
          <button className="ins-btn" disabled={index <= 0} onClick={() => reorder(slide, o.id, index - 1)} title={t('Reculer')}>
            <Icon name="arrow_downward" />
          </button>
          <button className="ins-btn" disabled={index <= 0} onClick={() => reorder(slide, o.id, 0)} title={t('Mettre à l’arrière-plan')}>
            <Icon name="flip_to_back" />
          </button>
        </div>
      </Section>
    </div>
  );
}
