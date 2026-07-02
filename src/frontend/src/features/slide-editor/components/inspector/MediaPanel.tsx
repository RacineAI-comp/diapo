import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorCtx } from '../../state/editorContext';
import { setProp } from '../../crdt/scene.js';
import { uploadImage, uploadMedia } from '../../lib/upload';
import type { SlideObjectView } from '../../crdt/scene';
import { Icon } from '../ui/Icon';
import { Section, Row, Slider, Seg, Check } from './controls';

// Format tab for video/audio objects: playback toggles, replace-file, and (video) poster image.
// Same building blocks and write path (scene.js setProp) as FormatPanel.
export function MediaPanel() {
  const { t } = useTranslation();
  const ctx = useEditorCtx();
  const { slide, selectedObj: o } = ctx;
  const fileRef = useRef<HTMLInputElement>(null);
  const posterRef = useRef<HTMLInputElement>(null);
  if (!slide || !o) return null;

  const set = <K extends keyof SlideObjectView>(k: K, v: SlideObjectView[K]) => setProp(slide, o.id, k, v);
  const isVideo = o.type === 'video';

  const onReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      set('src', await uploadMedia(f));
      set('alt', f.name);
    } catch {
      ctx.setExportError(t('Le téléversement du média a échoué. Veuillez réessayer.'));
    }
  };

  const onPoster = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    set('poster', await uploadImage(f)); // images keep their data-URL fallback
  };

  return (
    <div className="ins-body">
      <Section title={t('Fichier')}>
        <button className="ins-btn" onClick={() => fileRef.current?.click()}>
          <Icon name="swap_horiz" /> {t('Remplacer le fichier')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={isVideo ? 'video/mp4,video/webm,.mp4,.webm' : 'audio/mpeg,audio/ogg,audio/wav,audio/mp4,.mp3,.ogg,.wav,.m4a'}
          hidden
          onChange={(e) => void onReplace(e)}
        />
      </Section>

      <Section title={t('Lecture')}>
        <Check label={t('Afficher les commandes')} checked={o.controls !== false} onChange={(b) => set('controls', b)} />
        <Check label={t('Lecture automatique')} checked={!!o.autoplay} onChange={(b) => set('autoplay', b || undefined)} />
        <Check label={t('Lecture en boucle')} checked={!!o.loop} onChange={(b) => set('loop', b || undefined)} />
        <Check label={t('Sourdine')} checked={!!o.muted} onChange={(b) => set('muted', b || undefined)} />
        {!!o.autoplay && !o.muted && isVideo && (
          <p className="ins-hint">{t('Les navigateurs bloquent la lecture automatique avec le son. Activez la sourdine pour un démarrage fiable.')}</p>
        )}
      </Section>

      {isVideo && (
        <>
          <Section title={t('Affichage')}>
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
            <Row label={t('Coins')}>
              <Slider value={o.radius ?? 0} min={0} max={80} onChange={(n) => set('radius', n)} format={(n) => `${n}px`} />
            </Row>
          </Section>
          <Section title={t('Affiche')}>
            <button className="ins-btn" onClick={() => posterRef.current?.click()}>
              <Icon name="image" /> {o.poster ? t('Changer l’affiche') : t('Choisir une affiche')}
            </button>
            {o.poster && (
              <button className="ins-btn" onClick={() => set('poster', undefined)}>
                <Icon name="close" /> {t('Retirer l’affiche')}
              </button>
            )}
            <input ref={posterRef} type="file" accept="image/*" hidden onChange={(e) => void onPoster(e)} />
          </Section>
        </>
      )}

      <Section title={t('Opacité')}>
        <Row>
          <Slider value={o.opacity ?? 1} min={0} max={1} step={0.05} onChange={(n) => set('opacity', n)} format={(n) => `${Math.round(n * 100)}%`} />
        </Row>
      </Section>

      <Section title={t('Options')}>
        <Check label={t('Verrouiller la position')} checked={!!o.locked} onChange={(b) => set('locked', b)} />
        <Row label={t('Alt')}>
          <input className="ins-text" value={o.alt || ''} placeholder={t('Texte alternatif (a11y)')} onChange={(e) => set('alt', e.target.value)} />
        </Row>
      </Section>
    </div>
  );
}
