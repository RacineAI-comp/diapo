import { useEffect, useMemo, useState } from 'react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { COLLAB_URL } from '../../../env';
import { getCurrentUser } from '../../dashboard/auth';

const COLORS = ['#e6194B', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0891b2', '#db2777'];
const ANIMALS = ['Renard', 'Loutre', 'Hibou', 'Lynx', 'Héron', 'Blaireau', 'Martin', 'Belette'];
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

// Connect to the collaboration WebSocket via NEXT_PUBLIC_COLLAB_URL (falls back to same origin).
// This is what makes two browsers actually meet, regardless of how the app was reached.
function defaultCollabUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:1234';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/collab`;
}

export interface LocalUser {
  name: string;
  color: string;
}

// Connects to the local Hocuspocus collab server (same pattern as upstream Docs' y-provider).
export function useCollab(room: string) {
  // Start with an animal pseudonym; authenticated users get their real name below.
  const [user, setUser] = useState<LocalUser>(() => ({
    name: `${pick(ANIMALS)}-${Math.floor(Math.random() * 90 + 10)}`,
    color: pick(COLORS),
  }));

  // Real identity for presence: display name, else the email local-part, else the username.
  // Anonymous visitors (and local demo mode) keep the pseudonym. Color stays random either way.
  useEffect(() => {
    let cancelled = false;
    void getCurrentUser().then((u) => {
      if (cancelled || !u.is_authenticated) return;
      const name = (u.full_name || '').trim() || u.email?.split('@')[0] || u.username || '';
      if (name) setUser((prev) => ({ ...prev, name }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const provider = useMemo(
    () =>
      new HocuspocusProvider({
        url: COLLAB_URL ?? defaultCollabUrl(),
        name: room,
      }),
    [room],
  );

  const [status, setStatus] = useState<string>('connecting');

  useEffect(() => {
    const onStatus = (e: { status: string }) => setStatus(e.status);
    provider.on('status', onStatus);
    return () => {
      provider.off('status', onStatus);
      provider.destroy();
    };
  }, [provider]);

  // Separate effect: re-publishing the awareness user must NOT tear the provider down.
  useEffect(() => {
    provider.awareness?.setLocalStateField('user', user);
  }, [provider, user]);

  return { provider, doc: provider.document, awareness: provider.awareness, user, status };
}
