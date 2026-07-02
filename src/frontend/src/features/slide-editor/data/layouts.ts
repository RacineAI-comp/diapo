// Slide layouts. A layout is a named set of placeholders (positioned in slide coordinates against
// the DEFAULT 960x540 design canvas; scaled to the real slide size at apply time). Applying a
// layout to a slide stamps the placeholder objects (with a `ph` role) so the deck has real
// title/body structure, the keystone for outline view, accessibility and import.
export interface PlaceholderSpec {
  ph: 'title' | 'subtitle' | 'body' | 'caption';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Prompt text shown until the user types. */
  prompt: string;
  align?: 'left' | 'center' | 'right';
  fontSize?: number;
}
export interface LayoutDef {
  id: string;
  label: string;
  icon: string;
  placeholders: PlaceholderSpec[];
}

// Coordinates assume the 960x540 design canvas (DEFAULT_SLIDE).
export const LAYOUTS: LayoutDef[] = [
  { id: 'blank', label: 'Vierge', icon: 'crop_landscape', placeholders: [] },
  {
    id: 'title',
    label: 'Diapositive de titre',
    icon: 'title',
    placeholders: [
      { ph: 'title', x: 120, y: 200, w: 720, h: 90, prompt: 'Titre de la présentation', align: 'center', fontSize: 44 },
      { ph: 'subtitle', x: 160, y: 300, w: 640, h: 50, prompt: 'Sous-titre', align: 'center', fontSize: 22 },
    ],
  },
  {
    id: 'titleBody',
    label: 'Titre et contenu',
    icon: 'view_agenda',
    placeholders: [
      { ph: 'title', x: 60, y: 48, w: 840, h: 70, prompt: 'Titre', fontSize: 32 },
      { ph: 'body', x: 60, y: 140, w: 840, h: 340, prompt: 'Cliquez pour ajouter du texte', fontSize: 20 },
    ],
  },
  {
    id: 'twoContent',
    label: 'Deux contenus',
    icon: 'view_column',
    placeholders: [
      { ph: 'title', x: 60, y: 48, w: 840, h: 70, prompt: 'Titre', fontSize: 32 },
      { ph: 'body', x: 60, y: 140, w: 405, h: 340, prompt: 'Colonne gauche', fontSize: 20 },
      { ph: 'body', x: 495, y: 140, w: 405, h: 340, prompt: 'Colonne droite', fontSize: 20 },
    ],
  },
  {
    id: 'sectionHeader',
    label: 'En-tête de section',
    icon: 'segment',
    placeholders: [
      { ph: 'title', x: 80, y: 220, w: 800, h: 90, prompt: 'Titre de section', fontSize: 40 },
      { ph: 'caption', x: 80, y: 320, w: 800, h: 40, prompt: 'Description', fontSize: 18 },
    ],
  },
  {
    id: 'caption',
    label: 'Image légendée',
    icon: 'image',
    placeholders: [
      { ph: 'title', x: 60, y: 420, w: 840, h: 50, prompt: 'Légende', fontSize: 24 },
    ],
  },
];

export function layoutById(id: string | undefined): LayoutDef {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}
