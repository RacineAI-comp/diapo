// Starter templates = a theme + a starting layout. Applying one themes the deck and stamps a
// title layout on the current slide. The building blocks (themes, layouts, placeholders) are
// shared with the rest of the editor, so templates stay in lockstep with them.
export interface TemplateDef {
  id: string;
  label: string;
  themeId: string;
  layoutId: string;
  icon: string;
}

export const TEMPLATES: TemplateDef[] = [
  { id: 'pitch', label: 'Pitch', themeId: 'sovereign', layoutId: 'title', icon: 'rocket_launch' },
  { id: 'rapport', label: 'Rapport', themeId: 'editorial', layoutId: 'titleBody', icon: 'description' },
  { id: 'sombre', label: 'Keynote sombre', themeId: 'midnight', layoutId: 'title', icon: 'dark_mode' },
  { id: 'atelier', label: 'Atelier', themeId: 'vivid', layoutId: 'sectionHeader', icon: 'groups' },
  { id: 'minimal', label: 'Minimal', themeId: 'mono', layoutId: 'titleBody', icon: 'crop_square' },
];
