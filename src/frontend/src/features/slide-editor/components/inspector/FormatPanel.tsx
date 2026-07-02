import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorCtx } from '../../state/editorContext';
import { setProp } from '../../crdt/scene.js';
import { resizeTable } from '../../lib/insert';
import { uploadImage } from '../../lib/upload';
import type { ImageFilters, SlideObjectView } from '../../crdt/scene';
import { ColorPopover } from '../ui/ColorPopover';
import { Popover } from '../ui/Popover';
import { Icon } from '../ui/Icon';
import { FONTS, FONT_SIZES, fontStack } from '../../data/fonts';
import { SHAPES } from '../../data/shapes';
import { ICON_NAMES } from '../../data/icons';
import { TextFormatControls } from '../TextFormatControls';
import { ChartDataEditor } from './ChartDataEditor';
import { Section, Row, Slider, Seg, Check, NumberInput } from './controls';

// The Format tab. Renders type-specific controls for the selected object, all writing through
// scene.js. Per-run text formatting is delegated to TextFormatControls when a text box is editing.
export function FormatPanel() {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { slide, selectedObj: o, theme } = ctx;
  const fileRef = useRef<HTMLInputElement>(null);
  if (!slide || !o) return null;

  const set = <K extends keyof SlideObjectView>(k: K, v: SlideObjectView[K]) => setProp(slide, o.id, k, v);
  const themeColors = theme?.palette;

  const opacityRow = (
    <Section title={t('Opacité')}>
      <Row>
        <Slider value={o.opacity ?? 1} min={0} max={1} step={0.05} onChange={(n) => set('opacity', n)} format={(n) => `${Math.round(n * 100)}%`} />
      </Row>
    </Section>
  );

  const commonRow = (
    <Section title={t('Options')}>
      <Check label={t('Verrouiller la position')} checked={!!o.locked} onChange={(b) => set('locked', b)} />
      {o.type !== 'text' && (
        <Row label={t('Alt')}>
          <input className="ins-text" value={o.alt || ''} placeholder={t('Texte alternatif (a11y)')} onChange={(e) => set('alt', e.target.value)} />
        </Row>
      )}
      <Row label={t('Lien')}>
        <input className="ins-text" value={o.href || ''} placeholder="https://…" onChange={(e) => set('href', e.target.value)} />
      </Row>
    </Section>
  );

  return (
    <div className="ins-body">
      {/* ---------- TEXT ---------- */}
      {o.type === 'text' && (
        <>
          {ctx.activeEditor ? (
            <Section title={t('Texte sélectionné')}>
              <TextFormatControls editor={ctx.activeEditor} variant="full" themeColors={themeColors} />
            </Section>
          ) : (
            <Section>
              <p className="ins-hint">{t('Double-cliquez la zone pour la mise en forme du texte. Réglages de la zone ci-dessous.')}</p>
            </Section>
          )}
          <Section title={t('Police de la zone')}>
            <Row label={t('Police')}>
              <select className="ins-text" value={o.fontFamily || ''} onChange={(e) => set('fontFamily', e.target.value || undefined)}>
                <option value="">{t('Par défaut')}</option>
                {FONTS.map((f) => (
                  <option key={f.family} value={f.family} style={{ fontFamily: fontStack(f.family) }}>
                    {f.family}
                  </option>
                ))}
              </select>
            </Row>
            <Row label={t('Taille')}>
              <select className="ins-text" value={o.fontSize || ''} onChange={(e) => set('fontSize', e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">{t('Auto')}</option>
                {FONT_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Row>
            <Row label={t('Couleur')}>
              <ColorPopover value={o.fill} themeColors={themeColors} onChange={(c) => set('fill', c)} />
            </Row>
            <Row label={t('Interligne')}>
              <select className="ins-text" value={o.lineHeight || ''} onChange={(e) => set('lineHeight', e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">{t('Auto')}</option>
                <option value="1">1.0</option>
                <option value="1.15">1.15</option>
                <option value="1.5">1.5</option>
                <option value="2">2.0</option>
              </select>
            </Row>
          </Section>
          <Section title={t('Alignement')}>
            <Row label={t('Horizontal')}>
              <Seg
                value={o.align || 'left'}
                onChange={(v) => set('align', v)}
                options={[
                  { value: 'left', icon: 'format_align_left', title: t('Aligner à gauche') },
                  { value: 'center', icon: 'format_align_center', title: t('Centrer') },
                  { value: 'right', icon: 'format_align_right', title: t('Aligner à droite') },
                  { value: 'justify', icon: 'format_align_justify', title: t('Justifier') },
                ]}
              />
            </Row>
            <Row label={t('Vertical')}>
              <Seg
                value={o.valign || 'middle'}
                onChange={(v) => set('valign', v)}
                options={[
                  { value: 'top', icon: 'vertical_align_top', title: t('Haut') },
                  { value: 'middle', icon: 'vertical_align_center', title: t('Milieu') },
                  { value: 'bottom', icon: 'vertical_align_bottom', title: t('Bas') },
                ]}
              />
            </Row>
          </Section>
          {opacityRow}
          {commonRow}
        </>
      )}

      {/* ---------- SHAPE / RECT / ELLIPSE ---------- */}
      {(o.type === 'shape' || o.type === 'rect' || o.type === 'ellipse') && (
        <>
          <Section title={t('Remplissage')}>
            <Row>
              <ColorPopover value={o.fill} themeColors={themeColors} allowNone onChange={(c) => set('fill', c)} />
            </Row>
            <Check
              label={t('Dégradé')}
              checked={!!o.gradient}
              onChange={(b) =>
                set('gradient', b ? `linear-gradient(135deg, ${o.fill || '#1167d4'}, #ffffff)` : undefined)
              }
            />
          </Section>
          <Section title={t('Bordure')}>
            <Row label={t('Couleur')}>
              <ColorPopover value={o.stroke} themeColors={themeColors} allowNone onChange={(c) => set('stroke', c)} />
            </Row>
            <Row label={t('Épaisseur')}>
              <Slider value={o.strokeWidth ?? 0} min={0} max={20} onChange={(n) => set('strokeWidth', n)} format={(n) => `${n}px`} />
            </Row>
          </Section>
          {(o.shape === 'rect' || o.shape === 'roundRect' || o.type === 'rect') && (
            <Section title={t('Coins')}>
              <Row>
                <Slider value={o.radius ?? 8} min={0} max={80} onChange={(n) => set('radius', n)} format={(n) => `${n}px`} />
              </Row>
            </Section>
          )}
          <Section>
            <Check label={t('Ombre portée')} checked={!!o.shadow} onChange={(b) => set('shadow', b)} />
          </Section>
          {opacityRow}
          {commonRow}
        </>
      )}

      {/* ---------- LINE ---------- */}
      {o.type === 'line' && (
        <>
          <Section title={t('Trait')}>
            <Row label={t('Couleur')}>
              <ColorPopover value={o.stroke} themeColors={themeColors} onChange={(c) => set('stroke', c)} />
            </Row>
            <Row label={t('Épaisseur')}>
              <Slider value={o.strokeWidth ?? 3} min={1} max={24} onChange={(n) => set('strokeWidth', n)} format={(n) => `${n}px`} />
            </Row>
          </Section>
          <Section title={t('Flèches')}>
            <Check label={t('Flèche au début')} checked={!!o.arrowStart} onChange={(b) => set('arrowStart', b)} />
            <Check label={t('Flèche à la fin')} checked={!!o.arrowEnd} onChange={(b) => set('arrowEnd', b)} />
          </Section>
          {opacityRow}
          {commonRow}
        </>
      )}

      {/* ---------- IMAGE ---------- */}
      {o.type === 'image' && (
        <>
          <Section title={t('Image')}>
            <Row label={t('Ajustement')}>
              <Seg
                value={o.fit || 'contain'}
                onChange={(v) => set('fit', v)}
                options={[
                  { value: 'contain', label: t('Contenir') },
                  { value: 'cover', label: t('Remplir') },
                ]}
              />
            </Row>
            <button className="ins-btn" onClick={() => fileRef.current?.click()}>
              <Icon name="swap_horiz" /> {t('Remplacer l’image')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                set('src', await uploadImage(f));
              }}
            />
            <Row label={t('Coins')}>
              <Slider value={o.radius ?? 0} min={0} max={200} onChange={(n) => set('radius', n)} format={(n) => `${n}px`} />
            </Row>
            <Row label={t('Masque')}>
              <Seg
                value={o.mask || 'none'}
                onChange={(v) => set('mask', v)}
                options={[
                  { value: 'none', label: t('Aucun') },
                  { value: 'circle', label: t('Cercle') },
                  { value: 'rounded', label: t('Arrondi') },
                ]}
              />
            </Row>
          </Section>
          <Section title={t('Réglages')}>
            {(['brightness', 'contrast', 'saturate'] as const).map((k) => (
              <Row key={k} label={k === 'brightness' ? t('Lumière') : k === 'contrast' ? t('Contraste') : t('Saturation')}>
                <Slider
                  value={o.filters?.[k] ?? 100}
                  min={0}
                  max={200}
                  onChange={(n) => set('filters', { ...(o.filters as ImageFilters), [k]: n })}
                  format={(n) => `${n}%`}
                />
              </Row>
            ))}
            <Row label={t('N&B')}>
              <Slider value={o.filters?.grayscale ?? 0} min={0} max={100} onChange={(n) => set('filters', { ...(o.filters as ImageFilters), grayscale: n })} format={(n) => `${n}%`} />
            </Row>
          </Section>
          <Section title={t('Recadrage')}>
            {(['t', 'r', 'b', 'l'] as const).map((edge) => (
              <Row key={edge} label={{ t: t('Haut'), r: t('Droite'), b: t('Bas'), l: t('Gauche') }[edge]}>
                <Slider value={o.crop?.[edge] ?? 0} min={0} max={45} onChange={(n) => set('crop', { ...o.crop, [edge]: n })} format={(n) => `${n}%`} />
              </Row>
            ))}
          </Section>
          <Section>
            <Check label={t('Ombre portée')} checked={!!o.shadow} onChange={(b) => set('shadow', b)} />
          </Section>
          {opacityRow}
          {commonRow}
        </>
      )}

      {/* ---------- TABLE ---------- */}
      {o.type === 'table' && (
        <>
          <Section title={t('Tableau')}>
            <Row label={t('Lignes')}>
              <NumberInput value={o.rows ?? 2} min={1} max={20} onChange={(n) => resizeTable(slide, o.id, n, o.cols ?? 2)} />
            </Row>
            <Row label={t('Colonnes')}>
              <NumberInput value={o.cols ?? 2} min={1} max={12} onChange={(n) => resizeTable(slide, o.id, o.rows ?? 2, n)} />
            </Row>
            <Check label={t('Lignes alternées')} checked={!!o.banding} onChange={(b) => set('banding', b)} />
          </Section>
          <Section title={t('Couleurs')}>
            <Row label={t('En-tête')}>
              <ColorPopover value={o.fill} themeColors={themeColors} onChange={(c) => set('fill', c)} />
            </Row>
            <Row label={t('Bordure')}>
              <ColorPopover value={o.stroke} themeColors={themeColors} onChange={(c) => set('stroke', c)} />
            </Row>
          </Section>
          {opacityRow}
          {commonRow}
        </>
      )}

      {/* ---------- CHART ---------- */}
      {o.type === 'chart' && (
        <>
          <Section title={t('Type de graphique')}>
            <Seg
              value={o.chartType || 'column'}
              onChange={(v) => set('chartType', v)}
              options={[
                { value: 'column', icon: 'bar_chart', title: t('Histogramme') },
                { value: 'bar', icon: 'align_horizontal_left', title: t('Barres') },
                { value: 'line', icon: 'show_chart', title: t('Courbes') },
                { value: 'area', icon: 'area_chart', title: t('Aires') },
                { value: 'pie', icon: 'pie_chart', title: t('Secteurs') },
              ]}
            />
          </Section>
          <Section title={t('Données')}>
            <ChartDataEditor slide={slide} o={o} />
          </Section>
          {opacityRow}
          {commonRow}
        </>
      )}

      {/* ---------- ICON ---------- */}
      {o.type === 'icon' && (
        <>
          <Section title={t('Icône')}>
            <Popover label={t('Changer d’icône')} icon="apps">
              {(close) => (
                <div className="pop-flyout-grid">
                  {ICON_NAMES.map((n, i) => (
                    <button key={n + i} className="pop-flyout-cell" title={n} onClick={() => { set('icon', n); close(); }}>
                      <Icon name={n} />
                    </button>
                  ))}
                </div>
              )}
            </Popover>
            <Row label={t('Couleur')}>
              <ColorPopover value={o.fill} themeColors={themeColors} onChange={(c) => set('fill', c)} />
            </Row>
          </Section>
          {opacityRow}
          {commonRow}
        </>
      )}
    </div>
  );
}
