import { useTranslation } from 'react-i18next';
import { useEditorCtx } from '../../state/editorContext';
import { align, distribute, groupObjects, ungroupObjects } from '../../lib/align';
import { deleteObject } from '../../crdt/scene.js';
import { Icon } from '../ui/Icon';
import { Section } from './controls';

// Inspector panel shown when several objects are selected: align, distribute, group, delete.
export function MultiPanel() {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { slide, selectedIds, objects } = ctx;
  if (!slide) return null;
  const anyGrouped = objects.some((o) => selectedIds.includes(o.id) && o.group);

  const A = ({ edge, icon, label }: { edge: Parameters<typeof align>[2]; icon: string; label: string }) => (
    <button className="ins-btn" title={label} onClick={() => align(slide, selectedIds, edge)}>
      <Icon name={icon} />
    </button>
  );

  return (
    <div className="ins-body">
      <Section title={t('{{count}} objets sélectionnés', { count: selectedIds.length })}>
        <p className="ins-hint">{t('Maintenez ⇧ et cliquez pour ajouter/retirer de la sélection.')}</p>
      </Section>
      <Section title={t('Aligner')}>
        <div className="ins-btnrow">
          <A edge="left" icon="align_horizontal_left" label={t('Gauche')} />
          <A edge="centerH" icon="align_horizontal_center" label={t('Centre')} />
          <A edge="right" icon="align_horizontal_right" label={t('Droite')} />
        </div>
        <div className="ins-btnrow">
          <A edge="top" icon="align_vertical_top" label={t('Haut')} />
          <A edge="middle" icon="align_vertical_center" label={t('Milieu')} />
          <A edge="bottom" icon="align_vertical_bottom" label={t('Bas')} />
        </div>
      </Section>
      <Section title={t('Répartir')}>
        <div className="ins-btnrow">
          <button className="ins-btn" title={t('Répartir horizontalement')} onClick={() => distribute(slide, selectedIds, 'h')} disabled={selectedIds.length < 3}>
            <Icon name="horizontal_distribute" />
          </button>
          <button className="ins-btn" title={t('Répartir verticalement')} onClick={() => distribute(slide, selectedIds, 'v')} disabled={selectedIds.length < 3}>
            <Icon name="vertical_distribute" />
          </button>
        </div>
      </Section>
      <Section title={t('Grouper')}>
        <div className="ins-btnrow">
          <button className="ins-btn" onClick={() => groupObjects(slide, selectedIds)}>
            <Icon name="join_full" /> {t('Grouper')}
          </button>
          <button className="ins-btn" disabled={!anyGrouped} onClick={() => ungroupObjects(slide, selectedIds)}>
            <Icon name="join_inner" /> {t('Dégrouper')}
          </button>
        </div>
      </Section>
      <Section>
        <button className="ins-btn" onClick={() => { selectedIds.forEach((id) => deleteObject(slide, id)); ctx.setSelected(null); }}>
          <Icon name="delete" /> {t('Tout supprimer')}
        </button>
      </Section>
    </div>
  );
}
