'use client';

// Minimal accessible language switcher (FR/EN), shown in the suite home and dashboard headers
// (where upstream Docs puts its language setting). The i18next browser language detector caches
// the choice in localStorage, so it persists across sessions; LangSync updates <html lang>.
import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];

export function LanguagePicker() {
  const { t, i18n } = useTranslation();
  return (
    <select
      className="lang-picker"
      aria-label={t('Choix de la langue')}
      value={i18n.resolvedLanguage || 'fr'}
      onChange={(e) => void i18n.changeLanguage(e.target.value)}
    >
      {LANGUAGES.map((l) => (
        <option key={l.value} value={l.value}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
