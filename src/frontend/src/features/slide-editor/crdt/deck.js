// Deck-level metadata (SCHEMA v2). Everything that describes the whole presentation rather than a
// single slide lives under doc.getMap('meta'):
//
//   meta: Y.Map {
//     title:       string,
//     theme:       Y.Map { name, palette(JSON string[]), fontHeading, fontBody, bg },
//     customTheme: Y.Map { accent, text, bg, bgImage, fontHeading, fontBody },  // master lite, '' = no override
//     logo:        Y.Map { url, pos(tl|tr|bl|br), size(s|m) },                  // shown on every slide
//     settings:    Y.Map { w, h },                       // slide size (px of the design canvas)
//     footer:      Y.Map { text, showNumber, showDate },
//     sections:    Y.Array<Y.Map{ id, title, afterSlideId }>,
//   }
//
// Comments live in their own top-level map (see comments.js). Per-slide props (transition, layout,
// section) live on the slide Y.Map (see slides.js). Per-object props live on the object Y.Map
// (see scene.js). This file owns only deck-wide metadata.
import * as Y from 'yjs';
import { isDocReadOnly } from './guard.js';

export const DEFAULT_SLIDE = { w: 960, h: 540 };
const uuid = () => globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2);

export function getMeta(doc) {
  return doc.getMap('meta');
}

/* ---- title ---- */
export function getTitle(doc) {
  return getMeta(doc).get('title') || '';
}
export function setTitle(doc, title) {
  if (isDocReadOnly(doc)) return;
  getMeta(doc).set('title', String(title ?? ''));
}

/* ---- slide size ---- */
function settingsMap(doc) {
  const meta = getMeta(doc);
  let s = meta.get('settings');
  if (!(s instanceof Y.Map)) {
    s = new Y.Map();
    meta.set('settings', s);
  }
  return s;
}
export function getSlideSize(doc) {
  const s = getMeta(doc).get('settings');
  if (s instanceof Y.Map) {
    const w = s.get('w');
    const h = s.get('h');
    if (typeof w === 'number' && typeof h === 'number') return { w, h };
  }
  return { ...DEFAULT_SLIDE };
}
export function setSlideSize(doc, w, h) {
  if (isDocReadOnly(doc)) return;
  const s = settingsMap(doc);
  doc.transact(() => {
    s.set('w', Math.round(w));
    s.set('h', Math.round(h));
  });
}

/* ---- theme ---- */
function themeMap(doc) {
  const meta = getMeta(doc);
  let t = meta.get('theme');
  if (!(t instanceof Y.Map)) {
    t = new Y.Map();
    meta.set('theme', t);
  }
  return t;
}
// Effective theme = stored built-in theme overlaid with the deck's custom overrides (master lite).
// The custom accent replaces palette[0] so every ColorPopover theme row picks it up. A deck that
// never picked a built-in theme but has custom overrides still yields a usable theme.
export function getTheme(doc) {
  const t = getMeta(doc).get('theme');
  const c = getCustomTheme(doc);
  const hasCustom = Object.values(c).some(Boolean);
  if (!(t instanceof Y.Map) && !hasCustom) return null;
  let palette = [];
  if (t instanceof Y.Map) {
    try {
      palette = JSON.parse(t.get('palette') || '[]');
    } catch {
      palette = [];
    }
  }
  const base = {
    name: (t instanceof Y.Map && t.get('name')) || 'default',
    palette,
    fontHeading: (t instanceof Y.Map && t.get('fontHeading')) || '',
    fontBody: (t instanceof Y.Map && t.get('fontBody')) || '',
    bg: (t instanceof Y.Map && t.get('bg')) || '#ffffff',
  };
  if (c.accent) base.palette = [c.accent, ...base.palette.slice(1)];
  if (c.fontHeading) base.fontHeading = c.fontHeading;
  if (c.fontBody) base.fontBody = c.fontBody;
  if (c.bg) base.bg = c.bg;
  return base;
}
export function setTheme(doc, theme) {
  if (isDocReadOnly(doc)) return;
  const t = themeMap(doc);
  doc.transact(() => {
    if (theme.name != null) t.set('name', theme.name);
    if (theme.palette != null) t.set('palette', JSON.stringify(theme.palette));
    if (theme.fontHeading != null) t.set('fontHeading', theme.fontHeading);
    if (theme.fontBody != null) t.set('fontBody', theme.fontBody);
    if (theme.bg != null) t.set('bg', theme.bg);
  });
}

// Apply a theme to the WHOLE deck: store it AND paint every slide's background with the theme bg
// (so picking a theme visibly restyles the deck, like PowerPoint). Per-object text auto-contrasts
// the slide background at render time, so dark themes get light text automatically. Picking a
// built-in theme also drops custom overrides, a fresh master baseline (like switching masters).
export function applyTheme(doc, theme) {
  if (isDocReadOnly(doc)) return;
  setTheme(doc, theme);
  const slides = doc.getArray('slides');
  doc.transact(() => {
    clearCustomTheme(doc);
    for (let i = 0; i < slides.length; i++) {
      const s = slides.get(i);
      if (s && typeof s.set === 'function') s.set('background', theme.bg || '#ffffff');
    }
  });
}

/* ---- custom theme (master lite overrides over the built-in theme) ---- */
const CUSTOM_KEYS = ['accent', 'text', 'bg', 'bgImage', 'fontHeading', 'fontBody'];
function customThemeMap(doc) {
  const meta = getMeta(doc);
  let c = meta.get('customTheme');
  if (!(c instanceof Y.Map)) {
    c = new Y.Map();
    meta.set('customTheme', c);
  }
  return c;
}
export function getCustomTheme(doc) {
  const out = { accent: '', text: '', bg: '', bgImage: '', fontHeading: '', fontBody: '' };
  const c = getMeta(doc).get('customTheme');
  if (c instanceof Y.Map) {
    for (const k of CUSTOM_KEYS) {
      const v = c.get(k);
      if (typeof v === 'string') out[k] = v;
    }
  }
  return out;
}
// Patch semantics like setFooter: only keys present in the patch change; '' clears an override.
export function setCustomTheme(doc, patch) {
  if (isDocReadOnly(doc)) return;
  const c = customThemeMap(doc);
  doc.transact(() => {
    for (const k of CUSTOM_KEYS) {
      if (patch[k] != null) c.set(k, String(patch[k]));
    }
  });
}
function clearCustomTheme(doc) {
  const c = getMeta(doc).get('customTheme');
  if (c instanceof Y.Map) for (const k of [...c.keys()]) c.delete(k);
}
// Custom default slide background: store the override AND paint every slide with it, mirroring
// applyTheme so the whole deck restyles at once.
export function applyCustomBackground(doc, bg) {
  if (isDocReadOnly(doc)) return;
  const c = customThemeMap(doc);
  const slides = doc.getArray('slides');
  doc.transact(() => {
    c.set('bg', String(bg ?? ''));
    if (bg) {
      for (let i = 0; i < slides.length; i++) {
        const s = slides.get(i);
        if (s && typeof s.set === 'function') s.set('background', bg);
      }
    }
  });
}
// Drop every custom override and repaint slide backgrounds with the base theme bg.
export function resetCustomTheme(doc) {
  if (isDocReadOnly(doc)) return;
  const meta = getMeta(doc);
  const t = meta.get('theme');
  const baseBg = (t instanceof Y.Map && t.get('bg')) || '#ffffff';
  const slides = doc.getArray('slides');
  doc.transact(() => {
    clearCustomTheme(doc);
    for (let i = 0; i < slides.length; i++) {
      const s = slides.get(i);
      if (s && typeof s.set === 'function') s.set('background', baseBg);
    }
  });
}
// Background for NEW slides: custom override wins, then the stored theme bg, then white.
export function getDefaultBackground(doc) {
  const c = getCustomTheme(doc);
  if (c.bg) return c.bg;
  const t = getMeta(doc).get('theme');
  return ((t instanceof Y.Map && t.get('bg')) || '#ffffff');
}

/* ---- logo (master element shown on every slide) ---- */
function logoMap(doc) {
  const meta = getMeta(doc);
  let l = meta.get('logo');
  if (!(l instanceof Y.Map)) {
    l = new Y.Map();
    meta.set('logo', l);
  }
  return l;
}
export function getLogo(doc) {
  const l = getMeta(doc).get('logo');
  if (!(l instanceof Y.Map)) return { url: '', pos: 'br', size: 's' };
  return {
    url: l.get('url') || '',
    pos: l.get('pos') || 'br',
    size: l.get('size') || 's',
  };
}
export function setLogo(doc, patch) {
  if (isDocReadOnly(doc)) return;
  const l = logoMap(doc);
  doc.transact(() => {
    if (patch.url != null) l.set('url', String(patch.url));
    if (patch.pos != null) l.set('pos', String(patch.pos));
    if (patch.size != null) l.set('size', String(patch.size));
  });
}

/* ---- footer (slide number / date / free text) ---- */
function footerMap(doc) {
  const meta = getMeta(doc);
  let f = meta.get('footer');
  if (!(f instanceof Y.Map)) {
    f = new Y.Map();
    meta.set('footer', f);
  }
  return f;
}
export function getFooter(doc) {
  const f = getMeta(doc).get('footer');
  if (!(f instanceof Y.Map)) return { text: '', showNumber: false, showDate: false };
  return {
    text: f.get('text') || '',
    showNumber: !!f.get('showNumber'),
    showDate: !!f.get('showDate'),
  };
}
export function setFooter(doc, patch) {
  if (isDocReadOnly(doc)) return;
  const f = footerMap(doc);
  doc.transact(() => {
    if (patch.text != null) f.set('text', String(patch.text));
    if (patch.showNumber != null) f.set('showNumber', !!patch.showNumber);
    if (patch.showDate != null) f.set('showDate', !!patch.showDate);
  });
}

/* ---- sections (group consecutive slides) ---- */
function sectionsArr(doc) {
  const meta = getMeta(doc);
  let a = meta.get('sections');
  if (!(a instanceof Y.Array)) {
    a = new Y.Array();
    meta.set('sections', a);
  }
  return a;
}
export function getSections(doc) {
  const a = getMeta(doc).get('sections');
  if (!(a instanceof Y.Array)) return [];
  return a.map((m) => ({ id: m.get('id'), title: m.get('title') || 'Section' }));
}
export function addSection(doc, title, afterSlideId) {
  if (isDocReadOnly(doc)) return '';
  const a = sectionsArr(doc);
  const m = new Y.Map();
  const id = uuid();
  doc.transact(() => {
    m.set('id', id);
    m.set('title', title || 'Nouvelle section');
    if (afterSlideId != null) m.set('afterSlideId', afterSlideId);
    a.push([m]);
  });
  return id;
}
export function renameSection(doc, id, title) {
  if (isDocReadOnly(doc)) return;
  const a = sectionsArr(doc);
  for (let i = 0; i < a.length; i++) {
    const m = a.get(i);
    if (m.get('id') === id) {
      m.set('title', title);
      return;
    }
  }
}
export function deleteSection(doc, id) {
  if (isDocReadOnly(doc)) return;
  const a = sectionsArr(doc);
  for (let i = 0; i < a.length; i++) {
    if (a.get(i).get('id') === id) {
      a.delete(i, 1);
      return;
    }
  }
}
