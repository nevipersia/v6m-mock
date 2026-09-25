// Sales figures for the dashboard: what was sold, what was collected, and
// where it came from. Windows are counted back from the demo's frozen "today".

import { addDays, formatDate } from './format.js';
import { METHOD_LABELS, findSession, isActive, productKind } from './rules.js';
import type { Booking, ISODate, PaymentMethod, State } from './types.js';

/** One bar of the trend chart: a day, or a week when the window is long. */
export interface SalesPoint {
  label: string;
  /** Read out for the whole bar, e.g. "Sep 8 to Sep 14". */
  title: string;
  from: ISODate;
  to: ISODate;
  booked: number;
  collected: number;
  isNow: boolean;
}

/** One line of a breakdown: cottages, GCash, and so on. */
export interface SalesSlice {
  key: string;
  label: string;
  amount: number;
  count: number;
  /** 0–1 of the breakdown's total, for the bar width. */
  share: number;
}

export interface SalesReport {
  from: ISODate;
  to: ISODate;
  days: number;
  /** Total of the bookings taken in the window — what was sold. */
  booked: number;
  bookings: number;
  averageBooking: number;
  /** Payments received in the window. */
  collected: number;
  /** Collected over the same length of time before it. */
  collectedBefore: number;
  /** Percent difference against that earlier window, or null when it was empty. */
  change: number | null;
  /** Still owed on the bookings taken in the window. */
  outstanding: number;
  /** True when the bars are weeks rather than days. */
  weekly: boolean;
  points: SalesPoint[];
  byProduct: SalesSlice[];
  byMethod: SalesSlice[];
}

/** Ranges the dashboard offers. */
export const SALES_RANGES = [7, 30, 90] as const;
export type SalesRange = (typeof SALES_RANGES)[number];

/** Above this many days the trend is bucketed into weeks so the bars stay readable. */
const DAILY_LIMIT = 14;

const KIND_LABELS: Record<string, string> = {
  room: 'Rooms and villas',
  cottage: 'Cottages',
  exclusive: 'Exclusive rentals',
  event: 'Events',
};

/** "Cottages", "Day tour entrance" — what a product kind is called in a report. */
function kindLabel(state: State, kind: string): string {
  const session = findSession(state, kind);
  if (session) return `${session.label} entrance`;
  return KIND_LABELS[kind] ?? kind;
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const dayOf = (timestamp: string): ISODate => timestamp.slice(0, 10);

const within = (day: ISODate, from: ISODate, to: ISODate): boolean => day >= from && day <= to;

/** Bookings taken (created) between two dates, cancelled ones left out. */
const bookedBetween = (state: State, from: ISODate, to: ISODate): Booking[] =>
  state.bookings.filter((booking) => isActive(booking) && within(dayOf(booking.createdAt), from, to));

const collectedBetween = (state: State, from: ISODate, to: ISODate): number =>
  sum(state.payments.filter((payment) => within(dayOf(payment.receivedAt), from, to)).map((payment) => payment.amount));

function rank(slices: SalesSlice[]): SalesSlice[] {
  const total = sum(slices.map((slice) => slice.amount));
  return slices
    .filter((slice) => slice.amount > 0)
    .map((slice) => ({ ...slice, share: total ? slice.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

/** The bars: one per day, or one per week for the longer windows. */
function trend(state: State, from: ISODate, to: ISODate, days: number): { points: SalesPoint[]; weekly: boolean } {
  const weekly = days > DAILY_LIMIT;
  const step = weekly ? 7 : 1;
  const points: SalesPoint[] = [];
  for (let start = from; start <= to; start = addDays(start, step)) {
    const end = weekly ? addDays(start, 6) : start;
    const last = end > to ? to : end;
    points.push({
      label: weekly ? formatDate(start, 'monthDay') : formatDate(start, 'weekday'),
      title: weekly ? `${formatDate(start)} to ${formatDate(last)}` : formatDate(start, 'long'),
      from: start,
      to: last,
      booked: sum(bookedBetween(state, start, last).map((booking) => booking.total)),
      collected: collectedBetween(state, start, last),
      isNow: within(state.meta.asOf, start, last),
    });
  }
  return { points, weekly };
}

export function salesReport(state: State, days: number): SalesReport {
  const to = state.meta.asOf;
  const from = addDays(to, -(days - 1));

  const taken = bookedBetween(state, from, to);
  const booked = sum(taken.map((booking) => booking.total));
  const collected = collectedBetween(state, from, to);
  const collectedBefore = collectedBetween(state, addDays(from, -days), addDays(from, -1));

  const products = new Map<string, SalesSlice>();
  taken.forEach((booking) => {
    const key = productKind(state, booking.product);
    const slice = products.get(key) ?? { key, label: kindLabel(state, key), amount: 0, count: 0, share: 0 };
    slice.amount += booking.total;
    slice.count += 1;
    products.set(key, slice);
  });

  const methods = new Map<PaymentMethod, SalesSlice>();
  state.payments
    .filter((payment) => within(dayOf(payment.receivedAt), from, to))
    .forEach((payment) => {
      const slice = methods.get(payment.method)
        ?? { key: payment.method, label: METHOD_LABELS[payment.method] ?? payment.method, amount: 0, count: 0, share: 0 };
      slice.amount += payment.amount;
      slice.count += 1;
      methods.set(payment.method, slice);
    });

  return {
    from,
    to,
    days,
    booked,
    bookings: taken.length,
    averageBooking: taken.length ? Math.round(booked / taken.length) : 0,
    collected,
    collectedBefore,
    change: collectedBefore ? Math.round(((collected - collectedBefore) / collectedBefore) * 100) : null,
    outstanding: sum(taken.map((booking) => booking.balance)),
    ...trend(state, from, to, days),
    byProduct: rank([...products.values()]),
    byMethod: rank([...methods.values()]),
  };
}
