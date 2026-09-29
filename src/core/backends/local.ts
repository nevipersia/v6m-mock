// The demo backend: data/mock-data.json, with changes kept in localStorage so
// the desk and the booking page share them. Saved changes are discarded when
// the mock data file is regenerated with a new seed.

import type { Backend } from '../backend.js';
import type { State } from '../types.js';

const STORAGE_KEY = 'v6m-mock-state';

function readSaved(): State | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as State | null;
  } catch {
    return null;
  }
}

async function fetchBaseData(): Promise<State> {
  const response = await fetch(new URL('../../../../data/mock-data.json', import.meta.url), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load mock data (HTTP ${response.status})`);
  return response.json() as Promise<State>;
}

export function createLocalBackend(): Backend {
  let baseSeed: number | null = null;

  return {
    kind: 'mock',

    async load() {
      const base = await fetchBaseData();
      baseSeed = base.meta.seed;
      const saved = readSaved();
      return saved?.meta?.seed === baseSeed ? saved : base;
    },

    async commit(state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Storage blocked or full: changes stay in memory for this tab.
      }
    },

    async reset() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Nothing saved to remove.
      }
      return fetchBaseData();
    },

    // Keep tabs in sync, e.g. a booking sent from a link appears in an open V6M Desk tab.
    watch(onChange) {
      window.addEventListener('storage', async (event) => {
        if (event.key !== STORAGE_KEY) return;
        if (event.newValue === null) {
          onChange(await fetchBaseData());
          return;
        }
        const saved = readSaved();
        if (saved && saved.meta?.seed === baseSeed) onChange(saved);
      });
    },
  };
}
