// Built-in deck themes. A theme sets the slide background, a 6-color accent palette (fed to every
// ColorPopover as "theme colors"), and heading/body font families. Decks store the resolved theme
// in meta.theme (deck.js); this registry is the gallery users pick from.
import type { DeckTheme } from '../crdt/deck';

export interface ThemePreset extends DeckTheme {
  id: string;
  label: string;
}

export const THEMES: ThemePreset[] = [
  {
    id: 'default',
    label: 'Clair',
    name: 'default',
    bg: '#ffffff',
    palette: ['#1167d4', '#0f172a', '#64748b', '#0891b2', '#15803d', '#f0f1f2'],
    fontHeading: 'Inter',
    fontBody: 'Inter',
  },
  {
    id: 'midnight',
    label: 'Minuit',
    name: 'midnight',
    bg: '#0b1220',
    palette: ['#60a5fa', '#a78bfa', '#34d399', '#f472b6', '#e2e8f0', '#1e293b'],
    fontHeading: 'Inter',
    fontBody: 'Inter',
  },
  {
    id: 'editorial',
    label: 'Éditorial',
    name: 'editorial',
    bg: '#fbf7ef',
    palette: ['#1f2937', '#b91c1c', '#a16207', '#15803d', '#0e7490', '#e7e0d3'],
    fontHeading: 'Spectral',
    fontBody: 'Inter',
  },
  {
    id: 'mono',
    label: 'Mono',
    name: 'mono',
    bg: '#ffffff',
    palette: ['#111827', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#f3f4f6'],
    fontHeading: 'Inter',
    fontBody: 'Inter',
  },
  {
    id: 'vivid',
    label: 'Vif',
    name: 'vivid',
    bg: '#ffffff',
    palette: ['#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#111827'],
    fontHeading: 'Inter',
    fontBody: 'Inter',
  },
];

export const DEFAULT_THEME = THEMES[0];

export function themeById(id: string | undefined): ThemePreset {
  return THEMES.find((t) => t.id === id || t.name === id) ?? DEFAULT_THEME;
}
