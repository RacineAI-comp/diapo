// i18n setup (react-i18next, like upstream Docs). French is the source language (keys = the FR
// text); English is a translation. Import this once on
// the client (the providers do), useTranslation() / <Trans> then work app-wide.
import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import fr from './locales/fr.json';

if (!i18next.isInitialized) {
  void i18next
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: { fr: { translation: fr }, en: { translation: en } },
      fallbackLng: 'fr', // French is the source; missing translation falls back to the FR key
      supportedLngs: ['fr', 'en'],
      interpolation: { escapeValue: false }, // React already escapes
      detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
      react: { useSuspense: false },
    });
}

export default i18next;
