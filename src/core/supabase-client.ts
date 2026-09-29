// The browser's Supabase client, created once and only in a Supabase build.
// The library loads from the CDN through the import map in each page's HTML,
// so the demo never downloads it.

import type { SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.js';

let client: Promise<SupabaseClient> | null = null;

export function supabaseClient(): Promise<SupabaseClient> {
  if (config.backend !== 'supabase') return Promise.reject(new Error('This build is not set up for Supabase'));
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'v6m-desk-auth' },
    }));
  return client;
}
