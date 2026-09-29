// Where the store's state comes from and where changes go. The store holds the
// whole state in memory and every action mutates it through store.update();
// a backend loads that state and saves what each update changed.

import type { State } from './types.js';

export interface Backend {
  readonly kind: 'mock' | 'supabase' | 'static';
  /** Reads the full state. Called on first load and whenever the store reloads. */
  load(): Promise<State>;
  /** Saves whatever changed since the last load or commit. Commits run one at a time. */
  commit(state: State): Promise<void>;
  /** Starts listening for changes made elsewhere (another tab, another desk). */
  watch?(onChange: (state: State) => void): void;
  /** Throws away local changes and reloads the original data. Only the demo can. */
  reset?(): Promise<State>;
}

/** A read-only snapshot, for pages that get their data from a server call. */
export function createStaticBackend(state: State): Backend {
  return {
    kind: 'static',
    load: async () => state,
    commit: async () => {},
  };
}
