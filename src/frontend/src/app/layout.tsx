import type { ReactNode } from 'react';
// Global styles (design-system base + white-label tokens, then app CSS). In the App Router,
// global CSS lives in the root layout.
import '../cunningham-style.css';
import '../styles.css';

export const metadata = {
  title: 'Diapo',
};

// Explicit mobile viewport: without it, phones lay the app out at desktop width and zoom out.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
