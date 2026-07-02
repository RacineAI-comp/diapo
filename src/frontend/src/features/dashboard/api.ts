// Client for the Django Presentation API (rewritten at /api by Next -> :8000).
import { API_URL } from '../../env';
import { csrfHeaders } from '../../lib/csrf';

const API = API_URL;

export type LinkRole = 'reader' | 'editor';

export interface Presentation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  link_role?: LinkRole;
  abilities?: Record<string, boolean>;
}

const json = { 'content-type': 'application/json' };

async function ok<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

interface PresentationPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: Presentation[];
}

// The list endpoint is paginated (20/page): follow `next` links until exhausted so users with
// more than one page see every deck. Each next URL is rebuilt against our own API base (the
// backend's absolute host can differ behind the dev proxy). Capped at 10 pages as a safety valve.
export async function listPresentations(): Promise<Presentation[]> {
  const out: Presentation[] = [];
  let query = '';
  for (let page = 0; page < 10; page++) {
    const res = await fetch(`${API}/presentations/${query}`, { credentials: 'include' });
    const data = await ok<Presentation[] | PresentationPage>(res);
    if (Array.isArray(data)) return data; // unpaginated backend (older API)
    out.push(...(data.results ?? []));
    if (!data.next) break;
    query = new URL(data.next, 'http://relative').search;
    if (!query) break;
  }
  return out;
}

export async function createPresentation(title: string): Promise<Presentation> {
  return ok<Presentation>(
    await fetch(`${API}/presentations/`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...json, ...csrfHeaders() },
      body: JSON.stringify({ title }),
    }),
  );
}

export async function renamePresentation(id: string, title: string): Promise<Presentation> {
  return ok<Presentation>(
    await fetch(`${API}/presentations/${id}/`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { ...json, ...csrfHeaders() },
      body: JSON.stringify({ title }),
    }),
  );
}

export async function deletePresentation(id: string): Promise<void> {
  await ok<void>(
    await fetch(`${API}/presentations/${id}/`, {
      method: 'DELETE',
      credentials: 'include',
      headers: csrfHeaders(),
    }),
  );
}

export async function getPresentation(id: string): Promise<Presentation> {
  return ok<Presentation>(await fetch(`${API}/presentations/${id}/`, { credentials: 'include' }));
}

export async function setLinkRole(id: string, link_role: LinkRole): Promise<Presentation> {
  return ok<Presentation>(
    await fetch(`${API}/presentations/${id}/`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { ...json, ...csrfHeaders() },
      body: JSON.stringify({ link_role }),
    }),
  );
}

/** Navigate to the editor for a given presentation (room = its UUID): /?doc=<uuid>. */
export function openPresentation(id: string): void {
  window.location.href = `/?doc=${encodeURIComponent(id)}`;
}
