// Font registry. Fonts are either system stacks or self-hosted open-license files served from
// /fonts (no third-party font CDN, so no external requests at runtime). The editor font picker
// reads this list; export maps these to the closest PPTX font.
export interface FontDef {
  /** Family name used in CSS font-family and stored on objects. */
  family: string;
  /** Full CSS stack with fallbacks. */
  stack: string;
  /** Whether the family is self-hosted (an @font-face exists) vs. a pure system stack. */
  selfHosted: boolean;
  category: 'sans' | 'serif' | 'mono' | 'display';
}

export const FONTS: FontDef[] = [
  { family: 'Inter', stack: '"Inter", system-ui, sans-serif', selfHosted: true, category: 'sans' },
  { family: 'Spectral', stack: '"Spectral", Georgia, serif', selfHosted: true, category: 'serif' },
  { family: 'System', stack: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', selfHosted: false, category: 'sans' },
  // Georgia/Courier resolve to their self-hosted metric clones (Gelasio/Cousine) so the picker and
  // imported decks render the same widths as the LibreOffice ground truth. Real MS font kept as fallback.
  { family: 'Georgia', stack: '"Gelasio", Georgia, "Times New Roman", serif', selfHosted: true, category: 'serif' },
  { family: 'Courier', stack: '"Cousine", "Courier New", ui-monospace, monospace', selfHosted: true, category: 'mono' },
];

export const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 72, 96];

/**
 * Metric-compatible OFL/Apache substitutes for the Microsoft fonts that imported .pptx decks
 * request. The clones (Carlito/Gelasio/Arimo/Tinos/Cousine) are self-hosted (see cunningham-style.css
 * @fontsource imports) AND installed on the host, so LibreOffice (the fidelity ground truth) and our
 * Chromium render wrap text identically. Each entry keeps the original MS name as a fallback (so a
 * machine that actually has the real font still uses it) ending in the right generic family.
 * Keys are lowercased for case-insensitive matching.
 */
const METRIC_CLONES: Record<string, string> = {
  calibri: '"Carlito", "Calibri", sans-serif',
  'calibri light': '"Carlito", "Calibri Light", "Calibri", sans-serif',
  arial: '"Arimo", Arial, sans-serif',
  helvetica: '"Arimo", Helvetica, Arial, sans-serif',
  georgia: '"Gelasio", Georgia, serif',
  'times new roman': '"Tinos", "Times New Roman", serif',
  times: '"Tinos", Times, "Times New Roman", serif',
  'courier new': '"Cousine", "Courier New", monospace',
  courier: '"Cousine", Courier, "Courier New", monospace',
  // Display faces with no metric clone → the closest self-hosted open substitute.
  'segoe ui': '"Arimo", "Segoe UI", sans-serif',
  impact: '"Anton", Impact, sans-serif',
  'arial black': '"Archivo Black", "Arial Black", sans-serif',
  // CJK: map the Microsoft / platform East-Asian families onto self-hosted Noto Sans SC so imported
  // Chinese decks render with the same glyphs everywhere (and match the LibreOffice ground truth).
  'microsoft yahei': '"Noto Sans SC", sans-serif',
  微软雅黑: '"Noto Sans SC", sans-serif',
  simsun: '"Noto Sans SC", serif',
  宋体: '"Noto Sans SC", serif',
  simhei: '"Noto Sans SC", sans-serif',
  黑体: '"Noto Sans SC", sans-serif',
  dengxian: '"Noto Sans SC", sans-serif',
  等线: '"Noto Sans SC", sans-serif',
  'pingfang sc': '"Noto Sans SC", sans-serif',
  'source han sans sc': '"Noto Sans SC", sans-serif',
  思源黑体: '"Noto Sans SC", sans-serif',
  新細明體: '"Noto Sans SC", serif',
  nsimsun: '"Noto Sans SC", serif',
};

export function fontStack(family: string | undefined): string {
  if (!family) return 'inherit';
  const key = family.trim().toLowerCase();
  // Exact (case-insensitive) match against the editor's own picker families first, so e.g.
  // "Georgia"/"Courier" keep their existing FONTS stacks.
  const f = FONTS.find((x) => x.family.toLowerCase() === key);
  if (f) return f.stack;
  // Then map a requested MS font name to its metric-compatible clone.
  const clone = METRIC_CLONES[key];
  if (clone) return clone;
  // Unknown family: pass through unchanged.
  return family;
}
