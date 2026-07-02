import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';

// Titles, key names and descriptions are natural i18n keys (French source), translated at render
// time with t(). Pure key combos (Ctrl/⌘ + Z…) are language-neutral and stay as-is.
const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Général',
    items: [
      ['Ctrl/⌘ + Z', 'Annuler'],
      ['Ctrl/⌘ + ⇧ + Z', 'Rétablir'],
      ['Ctrl/⌘ + K', 'Palette de commandes'],
      ['Ctrl/⌘ + F', 'Rechercher / Remplacer'],
      ['?', 'Cette aide'],
    ],
  },
  {
    title: 'Objets',
    items: [
      ['Ctrl/⌘ + C / V', 'Copier / Coller'],
      ['Ctrl/⌘ + D', 'Dupliquer'],
      ['Ctrl/⌘ + A', 'Tout sélectionner'],
      ['⇧ + clic', 'Sélection multiple'],
      ['Suppr', 'Supprimer'],
      ['Flèches', 'Déplacer (⇧ = 10px)'],
      ['⇧ pendant le redim.', 'Conserver les proportions'],
    ],
  },
  {
    title: 'Présentation',
    items: [
      ['→ / Espace', 'Diapositive suivante'],
      ['←', 'Diapositive précédente'],
      ['N', 'Afficher les notes'],
      ['Échap', 'Quitter'],
    ],
  },
];

// Key combos whose label carries language (translated); the rest are language-neutral symbols.
const TRANSLATED_KEYS = new Set(['⇧ + clic', 'Suppr', 'Flèches', '⇧ pendant le redim.', '→ / Espace', 'Échap']);

export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal title={t('Raccourcis clavier')} icon="keyboard" onClose={onClose} width={560}>
      <div className="shortcuts-grid">
        {GROUPS.map((g) => (
          <div key={g.title} className="shortcuts-col">
            <h4>{t(g.title)}</h4>
            {g.items.map(([k, label]) => (
              <div key={k} className="shortcut-row">
                <kbd>{TRANSLATED_KEYS.has(k) ? t(k) : k}</kbd>
                <span>{t(label)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
