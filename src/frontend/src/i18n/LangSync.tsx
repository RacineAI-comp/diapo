'use client';

// Keeps <html lang> in sync with the active i18next language (RGAA 4.1 criterion 8.3/8.4: the
// declared page language must match the rendered language). layout.tsx ships lang="fr" (the
// source language); this client component corrects it on mount and on every language change.
import { useEffect } from 'react';
import i18next from './index';

export function LangSync() {
  useEffect(() => {
    const apply = (lng?: string) => {
      document.documentElement.lang = lng || i18next.resolvedLanguage || 'fr';
    };
    apply(i18next.resolvedLanguage);
    i18next.on('languageChanged', apply);
    return () => i18next.off('languageChanged', apply);
  }, []);
  return null;
}
