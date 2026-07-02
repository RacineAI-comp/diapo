// Next.js config. The /api path is rewritten to the Django backend over HTTP. The collaboration
// WebSocket is not rewritten here (Next rewrites do not proxy WebSocket cleanly); the client
// connects directly via NEXT_PUBLIC_COLLAB_URL (see src/env.ts and useCollab).
const backend = process.env.API_PROXY_TARGET || 'http://localhost:8000';

// Extra hosts the dev server may be reached on (comma-separated), for when it is served on a LAN
// address rather than localhost. Next blocks cross-origin dev chunks/HMR otherwise.
const devOrigins = (process.env.NEXT_DEV_ORIGINS || '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

/** @type {import('next').NextConfig} */
export default {
  output: 'standalone', // self-contained Node server for the production image
  reactStrictMode: false, // the collaboration provider must not be double-mounted in development
  allowedDevOrigins: ['localhost', ...devOrigins],
  // DRF routes end in a trailing slash. Do not let Next normalize/redirect it, and re-append it on
  // the rewrite destination so Django sees the slash (avoids the APPEND_SLASH redirect loop).
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: '/api/:path*/', destination: `${backend}/api/:path*/` },
      // Uploaded media (dev serves it from Django; production uses object storage directly).
      { source: '/media/:path*', destination: `${backend}/media/:path*` },
    ];
  },
};
