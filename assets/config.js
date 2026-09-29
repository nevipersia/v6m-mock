// Which backend the app talks to. This copy runs the local demo on mock data.
// `npm run build` rewrites dist/assets/config.js for Supabase when the
// SUPABASE_URL and SUPABASE_ANON_KEY environment variables are set.
globalThis.V6M_CONFIG = { backend: 'mock' };
