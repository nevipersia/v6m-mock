// Shared by the Edge Functions: a service-role client, the app's own store
// running on it, and JSON/CORS plumbing.
//
// ./core is the app's compiled src/core (copied here by `npm run build:functions`),
// so these functions run exactly the same booking rules as the desk.

import { createClient } from '@supabase/supabase-js';
import { createSupabaseBackend } from './core/backends/supabase.js';
import { flush, onSaveError, reloadStore, useBackend } from './core/store.js';

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');

/** Bypasses row-level security. Never send it, or anything it reads unfiltered, to a browser. */
export const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

let saveError: Error | null = null;
onSaveError((error: Error) => {
  saveError = error;
});

let queue: Promise<unknown> = Promise.resolve();

/**
 * Loads fresh state from the given tables, runs `run` against it through the
 * app's actions, and waits for every change to be saved. Requests run one at
 * a time, because the store is a single in-memory state per function instance.
 */
export function withState<T>(tables: string[], run: (state: any) => T | Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    saveError = null;
    useBackend(createSupabaseBackend(admin, { tables }));
    const state = await reloadStore();
    const result = await run(state);
    await flush();
    if (saveError) throw saveError;
    return result;
  });
  queue = next.catch(() => {});
  return next;
}

const corsHeaders = {
  // Set SITE_URL (e.g. https://v6m-desk.vercel.app) to accept calls from the site only.
  'Access-Control-Allow-Origin': Deno.env.get('SITE_URL') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/**
 * Serves a JSON POST endpoint. Problems the person can fix come back as
 * 200 with { error }; anything unexpected is logged and returns a plain 500.
 */
export function serve(handler: (body: Record<string, unknown>) => Promise<unknown>): void {
  Deno.serve(async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'The request was not valid JSON.' }, 400);
    }
    try {
      return json(await handler(body));
    } catch (error) {
      console.error(error);
      return json({ error: 'Something went wrong on our side. Please try again in a moment.' }, 500);
    }
  });
}
