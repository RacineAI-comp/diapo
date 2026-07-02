// Auth client. The backend is AllowAny in local mode and OIDC (our own Keycloak realm) when
// configured. `/users/me/` reports BOTH the current user and whether auth is even enabled, so the
// UI shows the right affordance: nothing in local mode, "Se connecter" when logged out, the user's
// name + "Se déconnecter" when logged in.
import { API_URL } from '../../env';

const API = API_URL;

export interface CurrentUser {
  is_authenticated: boolean;
  /** Whether OIDC is configured on the backend. False → hide login UI entirely (local mode). */
  auth_enabled: boolean;
  id?: string;
  username?: string;
  email?: string;
  full_name?: string;
}

const ANON: CurrentUser = { is_authenticated: false, auth_enabled: false };

export async function getCurrentUser(): Promise<CurrentUser> {
  try {
    const res = await fetch(`${API}/users/me/`, { credentials: 'include' });
    if (!res.ok) return ANON;
    return (await res.json()) as CurrentUser;
  } catch {
    return ANON;
  }
}

// Login/logout are cross-origin 302s to the IdP, they MUST be full-page navigations, not fetch().
// The routes (authenticate/, logout/) come from django-lasuite's oidc_login urls, mounted under the
// same API base; `next` brings the browser back here afterwards.
export function login(): void {
  window.location.href = `${API}/authenticate/?next=${encodeURIComponent(window.location.href)}`;
}

export function logout(): void {
  window.location.href = `${API}/logout/?next=${encodeURIComponent(window.location.origin + '/')}`;
}
