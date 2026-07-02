// Build-time public config. Next inlines `process.env.NEXT_PUBLIC_*` LITERALS into the client
// bundle, so they must be accessed directly here (reading them off an aliased `process.env`
// object would NOT be inlined, leaving them undefined in the browser). In Node (verify scripts)
// these are plain process.env reads and resolve to undefined → the defaults below.
export const API_URL: string = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1.0';
export const COLLAB_URL: string | undefined = process.env.NEXT_PUBLIC_COLLAB_URL;
export const SUITE_APPS: string | undefined = process.env.NEXT_PUBLIC_SUITE_APPS;
