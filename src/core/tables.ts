// How the in-memory state maps onto Supabase tables (supabase/migrations).
//
// Each collection is one table. Top-level fields become snake_case columns;
// nested objects and arrays (pricing, guest lists, inclusions…) are jsonb.
// meta and amenities live as rows of the settings table.

import type { State } from './types.js';

export type CollectionKey = Exclude<keyof State, 'meta' | 'amenities'>;

export interface TableSpec {
  collection: CollectionKey;
  table: string;
  key: string;
  /** Fields that exist only in the demo and are never stored. */
  localOnly?: string[];
  /** Newest first in the state (the activity log is unshifted). */
  newestFirst?: boolean;
  /** Load order, and how many rows to load when the table only grows. */
  order: { column: string; ascending: boolean };
  limit?: number;
}

/** In dependency order: a row is written after the rows it points to. */
export const TABLES: TableSpec[] = [
  { collection: 'staff', table: 'staff', key: 'id', localOnly: ['password', 'demo'], order: { column: 'id', ascending: true } },
  { collection: 'invites', table: 'invites', key: 'code', order: { column: 'created_at', ascending: true } },
  { collection: 'poolSessions', table: 'pool_sessions', key: 'id', order: { column: 'sort', ascending: true } },
  { collection: 'exclusivePackages', table: 'exclusive_packages', key: 'id', order: { column: 'sort', ascending: true } },
  { collection: 'units', table: 'units', key: 'id', order: { column: 'sort', ascending: true } },
  { collection: 'promos', table: 'promos', key: 'id', order: { column: 'id', ascending: true } },
  { collection: 'eventPackages', table: 'event_packages', key: 'id', order: { column: 'sort', ascending: true } },
  { collection: 'savedReplies', table: 'saved_replies', key: 'id', order: { column: 'sort', ascending: true } },
  { collection: 'guests', table: 'guests', key: 'id', order: { column: 'id', ascending: true } },
  { collection: 'bookings', table: 'bookings', key: 'id', order: { column: 'starts_at', ascending: true } },
  { collection: 'payments', table: 'payments', key: 'id', order: { column: 'received_at', ascending: true } },
  { collection: 'paymentChecks', table: 'payment_checks', key: 'id', order: { column: 'sent_at', ascending: true } },
  { collection: 'expenseCategories', table: 'expense_categories', key: 'id', order: { column: 'sort', ascending: true } },
  { collection: 'expenses', table: 'expenses', key: 'id', order: { column: 'date', ascending: true } },
  { collection: 'events', table: 'events', key: 'id', order: { column: 'date', ascending: true } },
  { collection: 'inquiries', table: 'inquiries', key: 'id', order: { column: 'received_at', ascending: true } },
  { collection: 'bookingLinks', table: 'booking_links', key: 'id', order: { column: 'created_at', ascending: true } },
  { collection: 'activityLog', table: 'activity_log', key: 'id', newestFirst: true, order: { column: 'at', ascending: false }, limit: 500 },
];

/** Catalog tables carry a sort column so the resort's order survives the round trip. */
export const SORTED_TABLES = new Set(['pool_sessions', 'exclusive_packages', 'units', 'event_packages', 'saved_replies']);

export const tableFor = (table: string): TableSpec | undefined => TABLES.find((spec) => spec.table === table);

const snake = (key: string): string => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const camel = (key: string): string => key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());

type Row = Record<string, unknown>;

/** A state record as a table row. */
export function toRow(spec: TableSpec, record: object): Row {
  const row: Row = {};
  for (const [field, value] of Object.entries(record)) {
    // Unset optional fields are left out, so the column keeps its default.
    if (spec.localOnly?.includes(field) || value === undefined) continue;
    row[snake(field)] = value;
  }
  return row;
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Postgres hands timestamps back in whatever zone the session uses. The app
 * compares and slices them as "YYYY-MM-DDTHH:MM:SS+08:00", so put them back
 * in that shape.
 */
export function manilaTimestamp(value: string): string {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return value;
  const d = new Date(time + MANILA_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+08:00`;
}

/** Today's date at the resort, YYYY-MM-DD. */
export const manilaToday = (): string => manilaTimestamp(new Date().toISOString()).slice(0, 10);

const TIMESTAMP = /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/;

/** A table row as a state record. */
export function fromRow<T>(spec: TableSpec, row: Row): T {
  const record: Row = {};
  for (const [column, value] of Object.entries(row)) {
    if (column === 'sort' && SORTED_TABLES.has(spec.table)) continue;
    record[camel(column)] = typeof value === 'string' && TIMESTAMP.test(value) ? manilaTimestamp(value) : value;
  }
  if (spec.collection === 'staff') Object.assign(record, { password: null, demo: false });
  return record as T;
}

export const keyOf = (spec: TableSpec, record: object): string => String((record as Row)[spec.key]);
