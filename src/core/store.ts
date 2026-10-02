// Shared data store for V6M Desk and the booking page.
//
// Holds the whole state in memory. Every change goes through update(), which
// re-renders subscribers straight away and hands the change to the backend:
// the demo keeps it in localStorage (backends/local.ts), a Supabase build
// writes the changed rows (backends/supabase.ts). config.ts picks which.

import type { Backend } from './backend.js';
import { createLocalBackend } from './backends/local.js';
import { createSupabaseBackend } from './backends/supabase.js';
import { config } from './config.js';
import { supabaseClient } from './supabase-client.js';
import type { Role, State } from './types.js';

type Listener = (state: State) => void;
type ErrorListener = (error: Error) => void;

let backend: Backend | null = null;
let state: State | null = null;
let saving: Promise<void> = Promise.resolve();
const listeners = new Set<Listener>();
const errorListeners = new Set<ErrorListener>();

const ROLES: Role[] = ['owner', 'manager'];

/** Tidies data saved by older versions so the rest of the app can trust its shape. */
function normalize(loaded: State): State {
  for (const person of loaded.staff ?? []) {
    // The Staff role was removed; anyone saved with it keeps their permissions as a Manager.
    if (!ROLES.includes(person.role)) person.role = 'manager';
  }
  loaded.bookingLinks ??= [];
  loaded.invites ??= [];
  loaded.expenses ??= [];
  // The ocular visit stage and its date were dropped: an event still at that
  // stage is an inquiry until it is reserved.
  for (const event of loaded.events ?? []) {
    if ((event.stage as string) === 'ocular') event.stage = 'inquiry';
    delete (event as { ocularDate?: string }).ocularDate;
  }
  // A package is on at most one promotion. Where older data lists it on
  // several, the one that is switched on keeps it (else the first), so the
  // price a guest is quoted does not change.
  const claimed = new Set<string>();
  const byPreference = [...(loaded.promos ?? [])].sort((a, b) => Number(b.active) - Number(a.active));
  for (const promo of byPreference) {
    promo.appliesTo = (promo.appliesTo ?? []).filter((id) => !claimed.has(id));
    promo.appliesTo.forEach((id) => claimed.add(id));
  }
  return loaded;
}

function notify(): void {
  if (state) listeners.forEach((listener) => listener(state as State));
}

/** Use a specific backend instead of the one config.ts picks (server functions, tests). */
export function useBackend(next: Backend): void {
  backend = next;
  state = null;
}

async function resolveBackend(): Promise<Backend> {
  if (backend) return backend;
  backend = config.backend === 'supabase'
    ? createSupabaseBackend(await supabaseClient(), { realtime: true })
    : createLocalBackend();
  return backend;
}

export async function loadStore(): Promise<State> {
  if (state) return state;
  const source = await resolveBackend();
  state = normalize(await source.load());
  source.watch?.((changed) => {
    state = normalize(changed);
    notify();
  });
  return state;
}

/** Reads everything again from the backend, dropping what is in memory. */
export async function reloadStore(): Promise<State> {
  const source = await resolveBackend();
  state = normalize(await source.load());
  notify();
  return state;
}

/** The loaded state, or null before loadStore() has finished. */
export const getState = (): State | null => state;

/** The loaded state; only call this after loadStore() has resolved. */
export function requireState(): State {
  if (!state) throw new Error('The store has not loaded yet');
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Hears about changes the backend could not save. The store reloads right after. */
export function onSaveError(listener: ErrorListener): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

/** Runs a mutation against the state, saves it and notifies subscribers. */
export function update<T>(mutate: (state: State) => T): T {
  const current = requireState();
  const result = mutate(current);
  const source = backend;
  if (source) {
    saving = saving
      .then(() => source.commit(current))
      .catch(async (error: Error) => {
        errorListeners.forEach((listener) => listener(error));
        // What is on screen no longer matches what was saved: start again from the server.
        await reloadStore().catch(() => {});
      });
  }
  notify();
  return result;
}

/** Resolves once every change so far has been saved (or has failed). */
export const flush = (): Promise<void> => saving;

/** Only the demo can throw its changes away. */
export const canReset = (): boolean => Boolean(backend?.reset);

/** Throws away local changes and reloads the original mock data. */
export async function resetStore(): Promise<void> {
  const source = await resolveBackend();
  if (!source.reset) return;
  await flush();
  state = normalize(await source.reset());
  notify();
}
