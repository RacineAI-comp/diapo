import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorCtx } from '../../state/editorContext';
import {
  applyTheme,
  setSlideSize,
  setFooter,
  getCustomTheme,
  setCustomTheme,
  applyCustomBackground,
  resetCustomTheme,
  getLogo,
  setLogo,
} from '../../crdt/deck.js';
import type { LogoPos, LogoSize } from '../../crdt/deck';
import { setTransition, getTransition, setLayout, getLayout } from '../../crdt/slides.js';
import { applyLayout } from '../../lib/insert';
import { uploadImage } from '../../lib/upload';
import { THEMES, DEFAULT_THEME } from '../../data/themes';
import { LAYOUTS } from '../../data/layouts';
import { ColorPopover } from '../ui/ColorPopover';
import { Icon } from '../ui/Icon';
import { Section, Row, Seg, Check } from './controls';
import { FONTS, fontStack } from '../../data/fonts';

const TRANSITIONS = ['none', 'fade', 'slide', 'push', 'zoom'];

// The Conception (design) tab, slide-level + deck-level design. This is the default panel when
// nothing is selected, so the inspector is never empty.
export function DesignPanel() {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { doc, slide, theme, slideSize, footer, readOnly } = ctx;
  // Effective theme (built-in + custom overrides) for picker values; raw overrides for state.
  const eff = theme ?? DEFAULT_THEME;
  const custom = getCustomTheme(doc);
  const logo = getLogo(doc);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="ins-body">
      {slide && (
        <Section title={t('Arrière-plan de la diapositive')}>
          <Row>
            <div className={readOnly ? 'ins-stack ins-ro' : 'ins-stack'}>
              <ColorPopover value={(slide.get('background') as string) || '#ffffff'} themeColors={theme?.palette} onChange={(c) => !readOnly && slide.set('background', c)} />
            </div>
          </Row>
        </Section>
      )}

      <Section title={t('Thème')}>
        <div className="ins-themes">
          {THEMES.map((th) => (
            <button
              key={th.id}
              className={`ins-theme${theme?.name === th.name ? ' is-active' : ''}`}
              title={t(th.label)}
              onClick={() => applyTheme(doc, th)}
              style={{ background: th.bg, fontFamily: fontStack(th.fontHeading) }}
            >
              <span className="ins-theme-sw">
                {th.palette.slice(0, 4).map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              <span className="ins-theme-name">{t(th.label)}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('Thème personnalisé')}>
        <div className={readOnly ? 'ins-stack ins-ro' : 'ins-stack'}>
          <Row label={t('Accent')}>
            <ColorPopover
              value={custom.accent || eff.palette[0] || '#1167d4'}
              themeColors={eff.palette}
              onChange={(c) => setCustomTheme(doc, { accent: c })}
            />
          </Row>
          <Row label={t('Couleur du texte')}>
            <ColorPopover
              value={custom.text || '#0f172a'}
              themeColors={eff.palette}
              onChange={(c) => setCustomTheme(doc, { text: c })}
            />
          </Row>
          <Row label={t('Fond')}>
            <ColorPopover
              value={custom.bg || eff.bg}
              themeColors={eff.palette}
              onChange={(c) => applyCustomBackground(doc, c)}
            />
          </Row>
          <Row label={t('Titres')}>
            <select
              className="ins-text"
              value={eff.fontHeading || 'Inter'}
              disabled={readOnly}
              onChange={(e) => setCustomTheme(doc, { fontHeading: e.target.value })}
            >
              {FONTS.map((f) => (
                <option key={f.family} value={f.family} style={{ fontFamily: f.stack }}>
                  {f.family}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t('Corps')}>
            <select
              className="ins-text"
              value={eff.fontBody || 'Inter'}
              disabled={readOnly}
              onChange={(e) => setCustomTheme(doc, { fontBody: e.target.value })}
            >
              {FONTS.map((f) => (
                <option key={f.family} value={f.family} style={{ fontFamily: f.stack }}>
                  {f.family}
                </option>
              ))}
            </select>
          </Row>
          <button className="ins-btn" disabled={readOnly} onClick={() => bgFileRef.current?.click()}>
            <Icon name="wallpaper" /> {custom.bgImage ? t('Remplacer l’image de fond') : t('Image de fond')}
          </button>
          {custom.bgImage && (
            <button className="ins-btn" disabled={readOnly} onClick={() => setCustomTheme(doc, { bgImage: '' })}>
              <Icon name="hide_image" /> {t('Retirer l’image de fond')}
            </button>
          )}
          <input
            ref={bgFileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f || readOnly) return;
              setCustomTheme(doc, { bgImage: await uploadImage(f) });
            }}
          />
          <button className="ins-btn" disabled={readOnly} onClick={() => resetCustomTheme(doc)}>
            <Icon name="restart_alt" /> {t('Réinitialiser le thème')}
          </button>
        </div>
      </Section>

      <Section title={t('Logo')}>
        <div className={readOnly ? 'ins-stack ins-ro' : 'ins-stack'}>
          <button className="ins-btn" disabled={readOnly} onClick={() => logoFileRef.current?.click()}>
            <Icon name="add_photo_alternate" /> {logo.url ? t('Remplacer le logo') : t('Importer un logo')}
          </button>
          <input
            ref={logoFileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f || readOnly) return;
              setLogo(doc, { url: await uploadImage(f) });
            }}
          />
          {logo.url && (
            <>
              <Row label={t('Position')}>
                <Seg<LogoPos>
                  value={logo.pos}
                  onChange={(v) => setLogo(doc, { pos: v })}
                  options={[
                    { value: 'tl', icon: 'north_west', title: t('En haut à gauche') },
                    { value: 'tr', icon: 'north_east', title: t('En haut à droite') },
                    { value: 'bl', icon: 'south_west', title: t('En bas à gauche') },
                    { value: 'br', icon: 'south_east', title: t('En bas à droite') },
                  ]}
                />
              </Row>
              <Row label={t('Taille')}>
                <Seg<LogoSize>
                  value={logo.size}
                  onChange={(v) => setLogo(doc, { size: v })}
                  options={[
                    { value: 's', label: 'S' },
                    { value: 'm', label: 'M' },
                  ]}
                />
              </Row>
              <button className="ins-btn" disabled={readOnly} onClick={() => setLogo(doc, { url: '' })}>
                <Icon name="delete" /> {t('Retirer le logo')}
              </button>
            </>
          )}
        </div>
      </Section>

      {slide && (
        <Section title={t('Disposition')}>
          <div className="ins-layouts">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                className={`ins-layout${getLayout(slide) === l.id ? ' is-active' : ''}`}
                title={t(l.label)}
                onClick={() => {
                  if (l.placeholders.length) applyLayout(slide, l.id);
                  else setLayout(slide, l.id);
                }}
              >
                <span className="material-icons">{l.icon}</span>
                <span>{t(l.label)}</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {slide && (
        <Section title={t('Transition')}>
          <Seg
            value={getTransition(slide).type}
            onChange={(tr) => setTransition(slide, { type: tr, duration: 400 })}
            options={TRANSITIONS.map((tr) => ({ value: tr, label: tr === 'none' ? t('Aucune') : tr }))}
          />
        </Section>
      )}

      <Section title={t('Taille des diapositives')}>
        <Seg
          value={`${slideSize.w}`}
          onChange={(v) => {
            if (v === '960') setSlideSize(doc, 960, 540);
            else if (v === '800') setSlideSize(doc, 800, 600);
            else setSlideSize(doc, 1000, 625);
          }}
          options={[
            { value: '960', label: '16:9' },
            { value: '800', label: '4:3' },
            { value: '1000', label: '16:10' },
          ]}
        />
      </Section>

      <Section title={t('Pied de page')}>
        <div className={readOnly ? 'ins-stack ins-ro' : 'ins-stack'}>
          <Check label={t('Numéro de diapositive')} checked={footer.showNumber} onChange={(b) => setFooter(doc, { showNumber: b })} />
          <Check label={t('Date')} checked={footer.showDate} onChange={(b) => setFooter(doc, { showDate: b })} />
          <Row label={t('Texte')}>
            <input className="ins-text" value={footer.text} placeholder={t('Texte du pied de page')} disabled={readOnly} onChange={(e) => setFooter(doc, { text: e.target.value })} />
          </Row>
        </div>
      </Section>
    </div>
  );
}
