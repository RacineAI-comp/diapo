'use client';

// `/` is the Slides app: the deck dashboard, and the editor when ?doc=<id> is present.
// Client-only mount, same providers as the rest. Cross-app navigation is the header
// launcher, fed by NEXT_PUBLIC_SUITE_APPS in a suite deployment.
import { CunninghamProvider } from '@gouvfr-lasuite/cunningham-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import '../i18n'; // initialise react-i18next on the client
import { LangSync } from '../i18n/LangSync';

const App = dynamic(() => import('../App').then((m) => m.App), { ssr: false });

const queryClient = new QueryClient();

export default function Page() {
  return (
    <QueryClientProvider client={queryClient}>
      <CunninghamProvider theme="default">
        <LangSync />
        <App />
      </CunninghamProvider>
    </QueryClientProvider>
  );
}
