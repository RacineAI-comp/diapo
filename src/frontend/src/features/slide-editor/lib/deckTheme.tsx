// Effective deck theme applied at the slide root. themeVars turns the merged theme (built-in +
// custom overrides, see deck.js getTheme) into CSS variables plus inheritable defaults, so master
// styling reaches the editor canvas AND every static render (thumbnails, presenter, previews)
// through the same code path. MasterBackground / MasterLogo are the non-interactive master layers
// drawn on every slide.
import type { CSSProperties } from 'react';
import type * as Y from 'yjs';
import { getTheme, getCustomTheme, getLogo } from '../crdt/deck.js';
import type { LogoPos } from '../crdt/deck';
import { fontStack } from '../data/fonts';

export function themeVars(doc: Y.Doc): CSSProperties {
  const theme = getTheme(doc);
  const custom = getCustomTheme(doc);
  const style: Record<string, string> = {};
  if (!theme) return style;
  const accent = theme.palette[0];
  if (accent) style['--theme-accent'] = accent;
  if (theme.fontHeading) style['--theme-font-heading'] = fontStack(theme.fontHeading);
  if (theme.fontBody) {
    style['--theme-font-body'] = fontStack(theme.fontBody);
    // Text boxes without an explicit fontFamily inherit (fontStack(undefined) = 'inherit').
    style.fontFamily = fontStack(theme.fontBody);
  }
  if (custom.text) {
    style['--theme-ink'] = custom.text;
    // Muted variant consumed by the slide footer.
    style['--theme-ink-muted'] = `color-mix(in srgb, ${custom.text} 60%, transparent)`;
    style.color = custom.text;
  }
  return style as CSSProperties;
}

// Deck-wide background image, under every object (objects come later in DOM order).
export function MasterBackground({ doc }: { doc: Y.Doc }) {
  const { bgImage } = getCustomTheme(doc);
  if (!bgImage) return null;
  return <div className="slide-master-bg" style={{ backgroundImage: `url(${bgImage})` }} />;
}

const LOGO_POS: Record<LogoPos, CSSProperties> = {
  tl: { top: 16, left: 16 },
  tr: { top: 16, right: 16 },
  bl: { bottom: 16, left: 16 },
  br: { bottom: 16, right: 16 },
};

// Deck-wide logo, drawn above objects like the footer, never selectable or movable.
export function MasterLogo({ doc }: { doc: Y.Doc }) {
  const logo = getLogo(doc);
  if (!logo.url) return null;
  return (
    <img
      className="slide-master-logo"
      src={logo.url}
      alt=""
      draggable={false}
      style={{ ...(LOGO_POS[logo.pos as LogoPos] ?? LOGO_POS.br), height: logo.size === 'm' ? 72 : 40 }}
    />
  );
}
