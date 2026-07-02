import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { listObjects } from '../crdt/scene.js';
import { getFooter, getSlideSize } from '../crdt/deck.js';
import { themeVars, MasterBackground, MasterLogo } from '../lib/deckTheme';
import type { SlideObjectView as ObjView, YSlide } from '../crdt/scene';
import { SlideObjectView } from './SlideObjectView';

interface Props {
  slide: YSlide;
  /** Pixel width to render at; height derives from the deck aspect ratio. */
  width: number;
  slideNumber?: number;
  /** Per-object visibility (animation reveal). Defaults to all visible. */
  isVisible?: (o: ObjView) => boolean;
  /** Per-object animation class for the current build step. */
  animClass?: (o: ObjView) => string | undefined;
  /** Inline animation style (duration/delay/transform-origin) for the current build step. */
  animStyle?: (o: ObjView) => CSSProperties | undefined;
  /** Wrapper key; changing it remounts the object so a re-fired CSS animation restarts. */
  animKey?: (o: ObjView) => string;
}

// Read-only render of a slide, reusing the object renderers (so present mode and previews look
// exactly like the editor). No selection chrome, no interaction.
export function SlideStatic({ slide, width, slideNumber, isVisible, animClass, animStyle, animKey }: Props) {
  const { i18n } = useTranslation();
  const doc = slide.doc;
  const size = doc ? getSlideSize(doc) : { w: 960, h: 540 };
  const scale = width / size.w;
  const objects = listObjects(slide);
  const footer = doc ? getFooter(doc) : { text: '', showNumber: false, showDate: false };
  const footerText = [
    footer.text,
    footer.showDate ? new Date().toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'fr-FR') : '',
    footer.showNumber && slideNumber ? `${slideNumber}` : '',
  ]
    .filter(Boolean)
    .join('   ·   ');

  return (
    <div className="slide-static" style={{ width: size.w * scale, height: size.h * scale }}>
      <div
        className="slide"
        style={{
          ...(doc ? themeVars(doc) : undefined),
          width: size.w,
          height: size.h,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          background: (slide.get('background') as string) || '#ffffff',
        }}
      >
        {doc && <MasterBackground doc={doc} />}
        {objects.map((o) =>
          isVisible && !isVisible(o) ? null : (
            <div key={animKey ? animKey(o) : o.id} className={animClass?.(o)} style={animStyle?.(o)}>
              <SlideObjectView
                slide={slide}
                o={o}
                selected={false}
                editing={false}
                presenting
                onSelect={() => {}}
                onStartEdit={() => {}}
              />
            </div>
          ),
        )}
        {footerText && <div className="slide-footer">{footerText}</div>}
        {doc && <MasterLogo doc={doc} />}
      </div>
    </div>
  );
}
