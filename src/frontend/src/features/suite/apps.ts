// The suite app list feeding the header launcher (gaufre). Per-tenant config is injected via
// NEXT_PUBLIC_SUITE_APPS (JSON) or window.__SUITE_APPS__; with neither, standalone Slides only.
import { SUITE_APPS } from '../../env';

export interface SuiteApp {
  name: string;
  icon: string; // material icon name
  url?: string; // present => navigable; absent => not deployed yet (disabled)
  current?: boolean; // the app you're currently in
  description?: string;
}

export const DEFAULT_APPS: SuiteApp[] = [
  { name: 'Diapo', icon: 'slideshow', url: '/', current: true, description: 'Présentations' },
];

export function loadSuiteApps(): SuiteApp[] {
  if (typeof window !== 'undefined') {
    const injected = (window as unknown as { __SUITE_APPS__?: SuiteApp[] }).__SUITE_APPS__;
    if (Array.isArray(injected) && injected.length) return injected;
  }
  try {
    if (SUITE_APPS) return JSON.parse(SUITE_APPS) as SuiteApp[];
  } catch {
    /* fall through to defaults */
  }
  return DEFAULT_APPS;
}
