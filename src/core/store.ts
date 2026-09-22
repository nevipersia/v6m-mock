// Shared data store for V6M Desk and the booking page.
//
// Loads data/mock-data.json, then keeps changes (new bookings, payments,
// invites, booking links) in localStorage so both pages see the same state.
// Changes are discarded automatically if the mock data file is regenerated
// with a new seed.

import type { State } from './types.js';

type Listener = (state: State) => void;

const STORAGE_KEY = 'v6m-mock-state';
const DATA_URL = new URL('../../../data/mock-data.json', import.meta.url);

let state: State | null = null;
let baseSeed: number | null = null;
const listeners = new Set<Listener>();

function readSaved(): State | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as State | null;
  } catch {
    return null;
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked or full: changes stay in memory for this tab.
  }
}

function notify(): void {
  if (state) listeners.forEach((listener) => listener(state as State));
}

async function fetchBaseData(): Promise<State> {
  const response = await fetch(DATA_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load mock data (HTTP ${response.status})`);
  return response.json() as Promise<State>;
}

export async function loadStore(): Promise<State> {
  if (state) return state;
  const base = await fetchBaseData();
  baseSeed = base.meta.seed;
  const saved = readSaved();
  state = saved?.meta?.seed === baseSeed ? saved : base;
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

/** Runs a mutation against the state, saves it and notifies subscribers. */
export function update<T>(mutate: (state: State) => T): T {
  const result = mutate(requireState());
  persist();
  notify();
  return result;
}

/** Throws away local changes and reloads the original mock data. */
export async function resetStore(): Promise<void> {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing saved to remove.
  }
  state = await fetchBaseData();
  notify();
}

// Keep tabs in sync, e.g. a booking sent from a link appears in an open V6M Desk tab.
window.addEventListener('storage', async (event) => {
  if (event.key !== STORAGE_KEY || !state) return;
  if (event.newValue === null) {
    state = await fetchBaseData();
  } else {
    const saved = readSaved();
    if (saved?.meta?.seed !== baseSeed) return;
    state = saved;
  }
  notify();
});
