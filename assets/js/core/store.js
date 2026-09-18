// Shared data store for the website and V6M Desk.
//
// Loads data/mock-data.json, then keeps changes (new bookings, payments,
// inquiries) in localStorage so both apps see the same state. Changes are
// discarded automatically if the mock data file is regenerated with a new seed.

const STORAGE_KEY = 'v6m-mock-state';
const DATA_URL = new URL('../../../data/mock-data.json', import.meta.url);

let state = null;
let baseSeed = null;
const listeners = new Set();

function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked or full: changes stay in memory for this tab.
  }
}

function notify() {
  listeners.forEach((listener) => listener(state));
}

async function fetchBaseData() {
  const response = await fetch(DATA_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load mock data (HTTP ${response.status})`);
  return response.json();
}

export async function loadStore() {
  if (state) return state;
  const base = await fetchBaseData();
  baseSeed = base.meta.seed;
  const saved = readSaved();
  state = saved?.meta?.seed === baseSeed ? saved : base;
  return state;
}

export const getState = () => state;

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Runs a mutation against the state, saves it and notifies subscribers. */
export function update(mutate) {
  const result = mutate(state);
  persist();
  notify();
  return result;
}

/** Throws away local changes and reloads the original mock data. */
export async function resetStore() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing saved to remove.
  }
  state = await fetchBaseData();
  notify();
}

// Keep tabs in sync, e.g. a website inquiry appears in an open V6M Desk tab.
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
