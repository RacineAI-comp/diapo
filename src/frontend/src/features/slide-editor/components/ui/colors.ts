// Shared color model for every picker in the editor (text color, shape fill/border, slide bg).
// Theme colors come from the active deck theme (schema v2); until a deck overrides them we use a
// neutral default palette. Recent colors persist in localStorage so they follow the user.

export const STANDARD_COLORS = [
  '#000000', '#1f2937', '#475569', '#94a3b8', '#cbd5e1', '#ffffff',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#78716c',
];

// Default theme accents (a neutral blue family plus neutrals). Decks may replace these via
// theme.palette.
export const DEFAULT_THEME_COLORS = [
  '#1167d4',
  '#0f172a',
  '#64748b',
  '#0891b2',
  '#15803d',
  '#f0f1f2',
];

const RECENTS_KEY = 'slides.recentColors';
const MAX_RECENTS = 8;

export function getRecentColors(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function pushRecentColor(color: string): void {
  if (!color) return;
  const norm = color.toLowerCase();
  try {
    const next = [norm, ...getRecentColors().filter((c) => c !== norm)].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* localStorage unavailable, recents are best-effort */
  }
}

// EyeDropper is supported in Chromium-based browsers; feature-detect so other browsers degrade.
export function hasEyeDropper(): boolean {
  return typeof (globalThis as { EyeDropper?: unknown }).EyeDropper === 'function';
}

export async function pickWithEyeDropper(): Promise<string | null> {
  const Ctor = (globalThis as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } })
    .EyeDropper;
  if (!Ctor) return null;
  try {
    const res = await new Ctor().open();
    return res.sRGBHex;
  } catch {
    return null; // user pressed Esc
  }
}
