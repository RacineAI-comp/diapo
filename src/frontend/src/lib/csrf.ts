// Django/DRF SessionAuthentication enforces CSRF on unsafe methods (POST/PATCH/DELETE) once a user
// is logged in via OIDC. Read the csrftoken cookie, set by the backend's /users/me probe
// (@ensure_csrf_cookie), and send it as X-CSRFToken. No-op in local AllowAny mode (an anonymous
// request isn't CSRF-checked), so this is safe to apply unconditionally.
export function csrfHeaders(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? { 'X-CSRFToken': decodeURIComponent(match[1]) } : {};
}
