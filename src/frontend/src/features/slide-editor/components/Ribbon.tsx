import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorCtx, type RibbonTab } from '../state/editorContext';
import { Icon } from './ui/Icon';
import { Popover, MenuItem } from './ui/Popover';
import { TextFormatControls } from './TextFormatControls';
import { addSlide, deleteSlide, duplicateSlide, setTransition } from '../crdt/slides.js';
import { setProp, reorder } from '../crdt/scene.js';
import { setTheme, applyTheme, setSlideSize, setFooter } from '../crdt/deck.js';
import {
  insertText,
  insertShape,
  insertLine,
  insertImage,
  insertVideo,
  insertAudio,
  insertTable,
  insertChart,
  insertIcon,
  applyLayout,
} from '../lib/insert';
import { uploadImage, uploadMedia } from '../lib/upload';
import { DiagramDialog } from './overlays/DiagramDialog';
import { THEMES, themeById } from '../data/themes';
import { LAYOUTS } from '../data/layouts';
import { TEMPLATES } from '../data/templates';
import { SHAPES } from '../data/shapes';
import { ICON_NAMES, EMOJI } from '../data/icons';
import { fontStack } from '../data/fonts';
import './Ribbon.css';

// Labels below are natural i18n keys (French source); translated at render time with t().
const TABS: { id: RibbonTab; label: string }[] = [
  { id: 'home', label: 'Accueil' },
  { id: 'insert', label: 'Insertion' },
  { id: 'design', label: 'Création' },
  { id: 'transitions', label: 'Transitions' },
  { id: 'animations', label: 'Animations' },
  { id: 'view', label: 'Affichage' },
];

const TRANSITIONS = [
  { type: 'none', label: 'Aucune', icon: 'block' },
  { type: 'fade', label: 'Fondu', icon: 'gradient' },
  { type: 'slide', label: 'Glissement', icon: 'swipe_left' },
  { type: 'push', label: 'Poussée', icon: 'east' },
  { type: 'zoom', label: 'Zoom', icon: 'zoom_out_map' },
];
const ANIMS = [
  { type: 'none', label: 'Aucune' },
  { type: 'fade', label: 'Fondu' },
  { type: 'slide-up', label: 'Montée' },
  { type: 'zoom', label: 'Zoom' },
  { type: 'wipe', label: 'Balayage' },
];
const CHARTS = [
  { type: 'column', label: 'Histogramme', icon: 'bar_chart' },
  { type: 'bar', label: 'Barres', icon: 'align_horizontal_left' },
  { type: 'line', label: 'Courbes', icon: 'show_chart' },
  { type: 'area', label: 'Aires', icon: 'area_chart' },
  { type: 'pie', label: 'Secteurs', icon: 'pie_chart' },
] as const;

export function Ribbon() {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { doc, slide, activeIndex, setActiveIndex, ribbonTab, setRibbonTab, selected, selectedObj } = ctx;
  const fileRef = useRef<HTMLInputElement>(null);
  const [showDiagram, setShowDiagram] = useState(false);
  // The ribbon body can be collapsed to a tab strip (office-suite style); short screens
  // (landscape phones) start collapsed so the canvas keeps most of the height.
  const [bodyOpen, setBodyOpen] = useState(
    () => typeof window === 'undefined' || !window.matchMedia('(max-height: 500px)').matches,
  );
  const videoRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const ro = ctx.readOnly;
  const enabled = !!slide && !ro;

  const select = (id: string) => ctx.setSelected(id);

  const onImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !slide) return;
    const src = await uploadImage(file); // object-store URL, or data-URL fallback
    const probe = new Image();
    probe.onload = () => {
      const fit = Math.min(480 / probe.naturalWidth, 360 / probe.naturalHeight, 1);
      select(insertImage(slide, src, Math.max(40, Math.round(probe.naturalWidth * fit)), Math.max(40, Math.round(probe.naturalHeight * fit))));
    };
    probe.src = src;
  };

  // Video/audio go through the object-store upload only (no data-URL fallback: too large for the
  // Yjs doc). Failures surface in the TopBar alert, the same surface as export errors.
  const onMediaFile = async (e: React.ChangeEvent<HTMLInputElement>, kind: 'video' | 'audio') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !slide) return;
    try {
      const src = await uploadMedia(file);
      select(kind === 'video' ? insertVideo(slide, src, file.name) : insertAudio(slide, src, file.name));
    } catch {
      ctx.setExportError(t('Le téléversement du média a échoué. Veuillez réessayer.'));
    }
  };

  return (
    <div className="ribbon">
      <div className="ribbon-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={ribbonTab === tab.id}
            className={`ribbon-tab${ribbonTab === tab.id ? ' is-active' : ''}`}
            onClick={() => {
              if (tab.id === ribbonTab) setBodyOpen(!bodyOpen);
              else {
                setRibbonTab(tab.id);
                setBodyOpen(true);
              }
            }}
          >
            {t(tab.label)}
          </button>
        ))}
        <button
          className="ribbon-collapse"
          title={bodyOpen ? t('Réduire le ruban') : t('Développer le ruban')}
          aria-label={bodyOpen ? t('Réduire le ruban') : t('Développer le ruban')}
          aria-expanded={bodyOpen}
          onClick={() => setBodyOpen(!bodyOpen)}
        >
          <Icon name={bodyOpen ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} />
        </button>
      </div>

      {bodyOpen && (
      <div className="ribbon-body">
        {ribbonTab === 'home' && (
          <>
            <Group label={t('Diapositive')}>
              <BigBtn icon="add" label={t('Nouvelle')} disabled={!enabled} onClick={() => setActiveIndex(addSlide(doc, activeIndex + 1))} />
              <Popover label={t('Disposition')} icon="dashboard" disabled={!enabled}>
                {(close) => (
                  <>
                    {LAYOUTS.map((l) => (
                      <MenuItem key={l.id} icon={l.icon} label={t(l.label)} onClick={() => { if (slide) applyLayout(slide, l.id); close(); }} />
                    ))}
                  </>
                )}
              </Popover>
              <IconBtn icon="content_copy" label={t('Dupliquer')} disabled={!enabled} onClick={() => setActiveIndex(duplicateSlide(doc, activeIndex))} />
              <IconBtn icon="delete" label={t('Supprimer')} disabled={!enabled || ctx.count <= 1} onClick={() => deleteSlide(doc, activeIndex)} />
            </Group>

            <Group label={t('Annuler')}>
              <IconBtn icon="undo" label={t('Annuler')} disabled={ro || !ctx.undo.canUndo} onClick={ctx.undo.undo} />
              <IconBtn icon="redo" label={t('Rétablir')} disabled={ro || !ctx.undo.canRedo} onClick={ctx.undo.redo} />
            </Group>

            <Group label={t('Texte')} grow>
              {ctx.activeEditor ? (
                <TextFormatControls editor={ctx.activeEditor} variant="full" themeColors={ctx.theme?.palette} />
              ) : (
                <span className="ribbon-hint">{t('Double-cliquez une zone de texte pour la mettre en forme')}</span>
              )}
            </Group>

            {selected && !ro && (
              <Group label={t('Organiser')}>
                <IconBtn icon="flip_to_front" label={t('Avancer')} onClick={() => slide && reorder(slide, selected, ctx.objects.length)} />
                <IconBtn icon="flip_to_back" label={t('Reculer')} onClick={() => slide && reorder(slide, selected, 0)} />
              </Group>
            )}
          </>
        )}

        {ribbonTab === 'insert' && (
          <>
            <Group label={t('Texte')}>
              <BigBtn icon="title" label={t('Zone de texte')} disabled={!enabled} onClick={() => slide && select(insertText(slide))} />
            </Group>
            <Group label={t('Illustrations')}>
              <BigBtn icon="image" label={t('Image')} disabled={!enabled} onClick={() => fileRef.current?.click()} />
              <Popover label={t('Formes')} icon="category" disabled={!enabled}>
                {(close) => (
                  <div className="pop-flyout-grid">
                    {SHAPES.map((s) => (
                      <button key={s.kind} className="pop-flyout-cell" title={t(s.label)} onClick={() => { if (slide) select(insertShape(slide, s.kind)); close(); }}>
                        <Icon name={s.icon} />
                      </button>
                    ))}
                  </div>
                )}
              </Popover>
              <Popover label={t('Trait')} icon="horizontal_rule" disabled={!enabled}>
                {(close) => (
                  <>
                    <MenuItem icon="horizontal_rule" label={t('Ligne')} onClick={() => { if (slide) select(insertLine(slide, false)); close(); }} />
                    <MenuItem icon="arrow_right_alt" label={t('Flèche')} onClick={() => { if (slide) select(insertLine(slide, true)); close(); }} />
                  </>
                )}
              </Popover>
              <Popover label={t('Icône')} icon="emoji_symbols" disabled={!enabled}>
                {(close) => (
                  <div className="pop-flyout-grid">
                    {ICON_NAMES.map((n, i) => (
                      <button key={n + i} className="pop-flyout-cell" title={n} onClick={() => { if (slide) select(insertIcon(slide, n)); close(); }}>
                        <Icon name={n} />
                      </button>
                    ))}
                  </div>
                )}
              </Popover>
              <BigBtn icon="account_tree" label={t('Diagramme')} disabled={!enabled} onClick={() => setShowDiagram(true)} />
              <Popover label={t('Emoji')} icon="mood" disabled={!enabled}>
                {(close) => (
                  <div className="pop-flyout-grid">
                    {EMOJI.map((e, i) => (
                      <button key={e + i} className="pop-flyout-cell" style={{ fontSize: 20 }} onClick={() => { if (slide) select(insertIcon(slide, e)); close(); }}>
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </Popover>
            </Group>
            <Group label={t('Média')}>
              <BigBtn icon="videocam" label={t('Vidéo')} disabled={!enabled} onClick={() => videoRef.current?.click()} />
              <BigBtn icon="audiotrack" label={t('Audio')} disabled={!enabled} onClick={() => audioRef.current?.click()} />
            </Group>
            <Group label={t('Données')}>
              <Popover label={t('Tableau')} icon="table_chart" disabled={!enabled}>
                {(close) => <TableGridPicker onPick={(r, c) => { if (slide) select(insertTable(slide, r, c)); close(); }} />}
              </Popover>
              <Popover label={t('Graphique')} icon="insert_chart" disabled={!enabled}>
                {(close) => (
                  <>
                    {CHARTS.map((c) => (
                      <MenuItem key={c.type} icon={c.icon} label={t(c.label)} onClick={() => { if (slide) select(insertChart(slide, c.type)); close(); }} />
                    ))}
                  </>
                )}
              </Popover>
            </Group>
          </>
        )}

        {ribbonTab === 'design' && (
          <>
            <Group label={t('Modèles')}>
              <Popover label={t('Modèles')} icon="dashboard_customize" disabled={!enabled}>
                {(close) => (
                  <>
                    {TEMPLATES.map((tpl) => (
                      <MenuItem
                        key={tpl.id}
                        icon={tpl.icon}
                        label={t(tpl.label)}
                        onClick={() => {
                          const theme = themeById(tpl.themeId);
                          setTheme(doc, theme);
                          if (slide) {
                            slide.set('background', theme.bg);
                            applyLayout(slide, tpl.layoutId);
                          }
                          close();
                        }}
                      />
                    ))}
                  </>
                )}
              </Popover>
            </Group>
            <Group label={t('Thèmes')} grow>
              <div className="ribbon-themes">
                {THEMES.map((th) => (
                  <button
                    key={th.id}
                    className={`theme-chip${ctx.theme?.name === th.name ? ' is-active' : ''}`}
                    title={t(th.label)}
                    disabled={ro}
                    onClick={() => applyTheme(doc, th)}
                    style={{ background: th.bg, fontFamily: fontStack(th.fontHeading) }}
                  >
                    <span className="theme-chip-name">{t(th.label)}</span>
                    <span className="theme-chip-swatches">
                      {th.palette.slice(0, 4).map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </Group>
            <Group label={t('Diapositive')}>
              <Popover label={t('Taille')} icon="aspect_ratio" disabled={ro}>
                {(close) => (
                  <>
                    <MenuItem label="16:9 (960×540)" onClick={() => { setSlideSize(doc, 960, 540); close(); }} active={ctx.slideSize.w === 960} />
                    <MenuItem label="4:3 (800×600)" onClick={() => { setSlideSize(doc, 800, 600); close(); }} active={ctx.slideSize.w === 800} />
                    <MenuItem label="16:10 (1000×625)" onClick={() => { setSlideSize(doc, 1000, 625); close(); }} active={ctx.slideSize.w === 1000} />
                  </>
                )}
              </Popover>
              <ColorField label={t('Arrière-plan')} value={(slide?.get('background') as string) || '#ffffff'} disabled={ro} onChange={(c) => slide && !ro && slide.set('background', c)} />
            </Group>
            <Group label={t('Pied de page')}>
              <Toggle label={t('N° diapo')} on={ctx.footer.showNumber} disabled={ro} onClick={() => setFooter(doc, { showNumber: !ctx.footer.showNumber })} />
              <Toggle label={t('Date')} on={ctx.footer.showDate} disabled={ro} onClick={() => setFooter(doc, { showDate: !ctx.footer.showDate })} />
            </Group>
          </>
        )}

        {ribbonTab === 'transitions' && (
          <Group label={t('Transition de la diapositive')} grow>
            {TRANSITIONS.map((tr) => {
              const cur = slide?.get('transition') as { type?: string } | undefined;
              const on = (cur?.type || 'none') === tr.type;
              return (
                <BigBtn key={tr.type} icon={tr.icon} label={t(tr.label)} active={on} disabled={!enabled} onClick={() => slide && setTransition(slide, { type: tr.type, duration: 400 })} />
              );
            })}
          </Group>
        )}

        {ribbonTab === 'animations' && (
          <Group label={t('Animation de l’objet')} grow>
            {!selectedObj && <span className="ribbon-hint">{t('Sélectionnez un objet pour l’animer')}</span>}
            {selectedObj &&
              ANIMS.map((a) => {
                const on = (selectedObj.anim?.type || 'none') === a.type;
                return (
                  <BigBtn
                    key={a.type}
                    icon={a.type === 'none' ? 'block' : 'animation'}
                    label={t(a.label)}
                    active={on}
                    disabled={ro}
                    onClick={() => slide && setProp(slide, selectedObj.id, 'anim', a.type === 'none' ? undefined : { type: a.type, duration: 500, order: ctx.objects.length })}
                  />
                );
              })}
          </Group>
        )}

        {ribbonTab === 'view' && (
          <>
            <Group label={t('Zoom')}>
              <IconBtn icon="zoom_out" label={t('Dézoomer')} onClick={() => { ctx.setFit(false); ctx.setZoom(Math.max(0.25, ctx.zoom - 0.1)); }} />
              <span className="ribbon-zoom">{Math.round(ctx.zoom * 100)}%</span>
              <IconBtn icon="zoom_in" label={t('Zoomer')} onClick={() => { ctx.setFit(false); ctx.setZoom(Math.min(3, ctx.zoom + 0.1)); }} />
              <IconBtn icon="fit_screen" label={t('Ajuster')} onClick={() => { ctx.setFit(true); ctx.setZoom(1); }} />
            </Group>
            <Group label={t('Afficher')}>
              <Toggle label={t('Plan')} on={ctx.showOutline} onClick={() => ctx.setShowOutline(!ctx.showOutline)} />
              <Toggle label={t('Grille')} on={ctx.showGrid} onClick={() => ctx.setShowGrid(!ctx.showGrid)} />
              <Toggle label={t('Règles')} on={ctx.showRulers} onClick={() => ctx.setShowRulers(!ctx.showRulers)} />
              <Toggle label={t('Commentaires')} on={ctx.overlay === 'comments'} onClick={() => ctx.setOverlay(ctx.overlay === 'comments' ? null : 'comments')} />
              <Toggle label={t('Notes')} on={ctx.showNotes} onClick={() => ctx.setShowNotes(!ctx.showNotes)} />
              <Toggle label={t('Mode sombre')} on={ctx.dark} onClick={() => ctx.setDark(!ctx.dark)} />
            </Group>
            <Group label={t('Outils')}>
              <IconBtn icon="search" label={t('Rechercher')} onClick={() => ctx.setOverlay('find')} />
              <IconBtn icon="accessibility_new" label={t('Accessibilité')} onClick={() => ctx.setOverlay('a11y')} />
              <IconBtn icon="history" label={t('Historique')} onClick={() => ctx.setOverlay('versions')} />
              <IconBtn icon="slideshow" label={t('Présenter')} onClick={() => ctx.setOverlay('present')} />
            </Group>
          </>
        )}
      </div>
      )}

      {showDiagram && !ro && <DiagramDialog onClose={() => setShowDiagram(false)} />}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onImageFile(e)} />
      <input ref={videoRef} type="file" accept="video/mp4,video/webm,.mp4,.webm" hidden onChange={(e) => void onMediaFile(e, 'video')} />
      <input ref={audioRef} type="file" accept="audio/mpeg,audio/ogg,audio/wav,audio/mp4,.mp3,.ogg,.wav,.m4a" hidden onChange={(e) => void onMediaFile(e, 'audio')} />
    </div>
  );
}

/* ---- small ribbon building blocks ---- */
function Group({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <div className={`ribbon-group${grow ? ' grow' : ''}`}>
      <div className="ribbon-group-body">{children}</div>
      <div className="ribbon-group-label">{label}</div>
    </div>
  );
}
function BigBtn({ icon, label, onClick, disabled, active }: { icon: string; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button className={`ribbon-big${active ? ' is-active' : ''}`} disabled={disabled} onClick={onClick} title={label}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}
function IconBtn({ icon, label, onClick, disabled }: { icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button className="ribbon-icon" disabled={disabled} onClick={onClick} title={label} aria-label={label}>
      <Icon name={icon} />
    </button>
  );
}
function Toggle({ label, on, onClick, disabled }: { label: string; on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button className={`ribbon-toggle${on ? ' is-on' : ''}`} onClick={onClick} aria-pressed={on} disabled={disabled}>
      <Icon name={on ? 'check_box' : 'check_box_outline_blank'} />
      <span>{label}</span>
    </button>
  );
}
function ColorField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (c: string) => void; disabled?: boolean }) {
  return (
    <label className="ribbon-colorfield" title={label}>
      <span className="ribbon-colorfield-sw" style={{ background: value }} />
      <span>{label}</span>
      <input type="color" value={value.startsWith('#') ? value : '#ffffff'} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function TableGridPicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const { t } = useTranslation();
  const N = 6;
  return (
    <div className="tbl-picker">
      <div className="tbl-picker-grid">
        {Array.from({ length: N * N }, (_, i) => {
          const r = Math.floor(i / N) + 1;
          const c = (i % N) + 1;
          return <button key={i} className="tbl-picker-cell" onClick={() => onPick(r, c)} title={`${r} × ${c}`} />;
        })}
      </div>
      <div className="tbl-picker-hint">{t('Cliquez pour insérer un tableau')}</div>
    </div>
  );
}
