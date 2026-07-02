import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorCtx, type InspectorTab } from '../state/editorContext';
import { FormatPanel } from './inspector/FormatPanel';
import { MediaPanel } from './inspector/MediaPanel';
import { ArrangePanel } from './inspector/ArrangePanel';
import { AnimationsPanel } from './inspector/AnimationsPanel';
import { DesignPanel } from './inspector/DesignPanel';
import { MultiPanel } from './inspector/MultiPanel';
import './Inspector.css';

const OBJ_TABS: { id: InspectorTab; label: string }[] = [
  { id: 'format', label: 'Format' },
  { id: 'arrange', label: 'Disposition' },
  { id: 'animations', label: 'Animations' },
];

// Tabbed inspector. With a selection it shows Format / Disposition / Animations for the object;
// with no selection it shows "Conception" (slide + deck design) so the panel is never empty.
export function Inspector() {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { selectedObj, inspectorTab, setInspectorTab, selectedIds } = ctx;
  const multi = selectedIds.length > 1;

  // When the selection appears/clears, snap to a sensible tab.
  useEffect(() => {
    if (selectedObj && inspectorTab === 'design') setInspectorTab('format');
    if (!selectedObj && inspectorTab !== 'design') setInspectorTab('design');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!selectedObj]);

  const tab = selectedObj ? inspectorTab : 'design';

  if (multi) {
    return (
      <aside className="inspector" aria-label={t('Propriétés')}>
        <div className="inspector-objtype">
          <span className="material-icons">select_all</span>
          {t('Sélection multiple')}
        </div>
        <div className="inspector-scroll">
          <MultiPanel />
        </div>
      </aside>
    );
  }

  return (
    <aside className="inspector" aria-label={t('Propriétés')}>
      <div className="inspector-tabs" role="tablist">
        {selectedObj ? (
          OBJ_TABS.map((tabDef) => (
            <button
              key={tabDef.id}
              role="tab"
              aria-selected={tab === tabDef.id}
              className={`inspector-tab${tab === tabDef.id ? ' is-active' : ''}`}
              onClick={() => setInspectorTab(tabDef.id)}
            >
              {t(tabDef.label)}
            </button>
          ))
        ) : (
          <span className="inspector-tab is-active" aria-selected>
            {t('Conception')}
          </span>
        )}
      </div>

      {selectedObj && (
        <div className="inspector-objtype">
          <span className="material-icons">{typeIcon(selectedObj.type)}</span>
          {t(typeLabel(selectedObj.type))}
        </div>
      )}

      <div className="inspector-scroll">
        {tab === 'format' &&
          (selectedObj && (selectedObj.type === 'video' || selectedObj.type === 'audio') ? <MediaPanel /> : <FormatPanel />)}
        {tab === 'arrange' && <ArrangePanel />}
        {tab === 'animations' && <AnimationsPanel />}
        {tab === 'design' && <DesignPanel />}
      </div>
    </aside>
  );
}

function typeLabel(t: string): string {
  return (
    {
      text: 'Zone de texte',
      rect: 'Rectangle',
      ellipse: 'Ellipse',
      shape: 'Forme',
      image: 'Image',
      line: 'Trait',
      table: 'Tableau',
      chart: 'Graphique',
      icon: 'Icône',
      video: 'Vidéo',
      audio: 'Audio',
    } as Record<string, string>
  )[t] || t;
}
function typeIcon(t: string): string {
  return (
    {
      text: 'title',
      rect: 'crop_square',
      ellipse: 'circle',
      shape: 'category',
      image: 'image',
      line: 'horizontal_rule',
      table: 'table_chart',
      chart: 'insert_chart',
      icon: 'emoji_symbols',
      video: 'videocam',
      audio: 'audiotrack',
    } as Record<string, string>
  )[t] || 'widgets';
}
