// Upload an image to the backend object-store endpoint (sovereign S3/MinIO seam) and return its
// URL. Falls back to an inline data-URL if the endpoint is unavailable (offline/local), so image
// insert always works. The base mirrors the dashboard API base.
import { API_URL } from '../../../env';
import { csrfHeaders } from '../../../lib/csrf';

const API = API_URL;

export async function uploadImage(file: File): Promise<string> {
  try {
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch(`${API}/upload/`, {
      method: 'POST',
      body: fd,
      credentials: 'include',
      headers: csrfHeaders(),
    });
    if (resp.ok) {
      const data = (await resp.json()) as { url?: string };
      if (data.url) return data.url;
    }
  } catch {
    /* fall through to data-URL */
  }
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Upload a video/audio file. NO data-URL fallback (media is far too large to inline in the Yjs
// doc), so this throws on failure and the caller surfaces the error.
export async function uploadMedia(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const resp = await fetch(`${API}/upload/`, {
    method: 'POST',
    body: fd,
    credentials: 'include',
    headers: csrfHeaders(),
  });
  if (resp.ok) {
    const data = (await resp.json()) as { url?: string };
    if (data.url) return data.url;
    throw new Error('upload failed (no url)');
  }
  let detail = '';
  try {
    detail = ((await resp.json()) as { detail?: string }).detail || '';
  } catch {
    /* non-JSON error body */
  }
  throw new Error(detail || `upload failed (${resp.status})`);
}
