// The production backend: Supabase Postgres, one table per collection.
//
// The store keeps working on the whole state in memory. After each update this
// compares every row with what was last loaded or saved and writes only the
// difference: new rows are inserted (so two desks picking the same new id
// fail loudly instead of overwriting each other), changed rows are upserted,
// removed rows are deleted. Realtime pushes other desks' changes back in.
//
// Works in the browser (signed-in staff, row-level security) and in the Edge
// Functions (service role), so it must not touch window or document.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Backend } from '../backend.js';
import { TABLES, fromRow, keyOf, manilaToday, tableFor, toRow, type TableSpec } from '../tables.js';
import type { Meta, State } from '../types.js';

type Row = Record<string, unknown>;
type Snapshot = Map<string, Map<string, string>>;

const PAGE = 1000;

export interface SupabaseBackendOptions {
  /** Subscribe to Realtime changes (browser only). */
  realtime?: boolean;
  /** Only load these tables, e.g. the booking link function skips the inbox. */
  tables?: string[];
}

/** Supabase caps a select at 1000 rows, so read in pages. */
async function selectAll(client: SupabaseClient, spec: TableSpec): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const to = spec.limit ? Math.min(from + PAGE, spec.limit) - 1 : from + PAGE - 1;
    const { data, error } = await client
      .from(spec.table)
      .select('*')
      .order(spec.order.column, { ascending: spec.order.ascending })
      .range(from, to);
    if (error) throw new Error(`Could not load ${spec.table}: ${error.message}`);
    rows.push(...(data as Row[]));
    if (data.length < to - from + 1 || (spec.limit && rows.length >= spec.limit)) return rows;
  }
}

async function loadSettings(client: SupabaseClient): Promise<{ meta: Meta; amenities: string[] }> {
  const { data, error } = await client.from('settings').select('key, value');
  if (error) throw new Error(`Could not load settings: ${error.message}`);
  const byKey = new Map((data as { key: string; value: unknown }[]).map((row) => [row.key, row.value]));
  const meta = byKey.get('meta') as Meta | undefined;
  if (!meta) throw new Error('The settings table has no "meta" row. Run supabase/seed.sql.');
  // Production runs on the real calendar, not a frozen demo date.
  return { meta: { ...meta, asOf: manilaToday() }, amenities: (byKey.get('amenities') as string[] | undefined) ?? [] };
}

const newId = (): string => globalThis.crypto.randomUUID();

export function createSupabaseBackend(client: SupabaseClient, options: SupabaseBackendOptions = {}): Backend {
  const specs = TABLES.filter((spec) => !options.tables || options.tables.includes(spec.table));
  const snapshot: Snapshot = new Map();
  let current: State | null = null;

  const remember = (spec: TableSpec, record: object): void => {
    snapshot.get(spec.table)?.set(keyOf(spec, record), JSON.stringify(record));
  };

  async function writeTable(spec: TableSpec, state: State): Promise<void> {
    const records = state[spec.collection] as object[];
    if (spec.collection === 'activityLog') {
      // Log entries in the demo data have no id; give new ones one before saving.
      for (const entry of state.activityLog) entry.id ??= newId();
    }
    const seen = snapshot.get(spec.table) ?? new Map<string, string>();
    snapshot.set(spec.table, seen);

    const inserts: object[] = [];
    const changes: object[] = [];
    const keys = new Set<string>();
    for (const record of records) {
      const key = keyOf(spec, record);
      keys.add(key);
      const before = seen.get(key);
      if (before === undefined) inserts.push(record);
      else if (before !== JSON.stringify(record)) changes.push(record);
    }
    const removed = [...seen.keys()].filter((key) => !keys.has(key));

    if (inserts.length) {
      const { error } = await client.from(spec.table).insert(inserts.map((record) => toRow(spec, record)));
      if (error) throw new Error(`Could not save to ${spec.table}: ${error.message}`);
      inserts.forEach((record) => remember(spec, record));
    }
    if (changes.length) {
      const { error } = await client.from(spec.table).upsert(changes.map((record) => toRow(spec, record)), { onConflict: spec.key });
      if (error) throw new Error(`Could not update ${spec.table}: ${error.message}`);
      changes.forEach((record) => remember(spec, record));
    }
    if (removed.length) {
      const { error } = await client.from(spec.table).delete().in(spec.key, removed);
      if (error) throw new Error(`Could not delete from ${spec.table}: ${error.message}`);
      removed.forEach((key) => seen.delete(key));
    }
  }

  return {
    kind: 'supabase',

    async load() {
      const [settings, ...tables] = await Promise.all([
        loadSettings(client),
        ...specs.map((spec) => selectAll(client, spec)),
      ]);
      const state = { ...settings } as State;
      for (const spec of TABLES) (state as unknown as Record<string, unknown>)[spec.collection] = [];
      snapshot.clear();
      specs.forEach((spec, index) => {
        const records = (tables[index] ?? []).map((row) => fromRow<object>(spec, row));
        (state as unknown as Record<string, unknown>)[spec.collection] = records;
        snapshot.set(spec.table, new Map(records.map((record) => [keyOf(spec, record), JSON.stringify(record)])));
      });
      current = state;
      return state;
    },

    async commit(state) {
      // Parents before children, so a new booking's guest exists first. Deleting
      // a parent cascades in the database (invites go with their staff row).
      for (const spec of specs) await writeTable(spec, state);
    },

    watch(onChange) {
      if (!options.realtime) return;
      client
        .channel('v6m-desk')
        .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
          const spec = tableFor(payload.table);
          const state = current;
          if (!spec || !state || !specs.includes(spec)) return;
          const records = state[spec.collection] as object[];
          const seen = snapshot.get(spec.table);

          if (payload.eventType === 'DELETE') {
            const key = String((payload.old as Row)[spec.key]);
            (state as unknown as Record<string, object[]>)[spec.collection] = records.filter((record) => keyOf(spec, record) !== key);
            seen?.delete(key);
          } else {
            const record = fromRow<object>(spec, payload.new as Row);
            const key = keyOf(spec, record);
            const index = records.findIndex((item) => keyOf(spec, item) === key);
            if (index >= 0) records[index] = record;
            else if (spec.newestFirst) records.unshift(record);
            else records.push(record);
            remember(spec, record);
          }
          onChange(state);
        })
        .subscribe();
    },
  };
}
