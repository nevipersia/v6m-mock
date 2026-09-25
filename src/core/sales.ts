// Sales figures for the dashboard: what was sold, what was collected, and
// where it came from. Windows are counted back from the demo's frozen "today".

import { addDays, formatDate } from './format.js';
import { METHOD_LABELS, isActive, productKind } from './rules.js';
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

/** Figures for one stretch of days. */
export interface SalesSummary {
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
  byProduct: SalesSlice[];
  byMethod: SalesSlice[];
}

/** A summary of the whole window, plus the bars that make it up. */
export interface SalesReport extends SalesSummary {
  /** True when the bars are weeks rather than days. */
  weekly: boolean;
  points: SalesPoint[];
}

/** Ranges the dashboard offers. */
export const SALES_RANGES = [7, 30, 90] as const;
export type SalesRange = (typeof SALES_RANGES)[number];

/** Above this many days the trend is bucketed into weeks so the bars stay readable. */
const DAILY_LIMIT = 14;

/**
 * What a sale is grouped under in the breakdown chart. Five groups, each with a
 * colour of its own: more than that and the slices stop being tellable apart,
 * so the four entrance sessions share one group and the legend counts them.
 */
export type SalesGroup = 'entrance' | 'cottage' | 'room' | 'exclusive' | 'event';

const GROUP_LABELS: Record<SalesGroup, string> = {
  entrance: 'Entrance per head',
  cottage: 'Cottages',
  room: 'Rooms and villas',
  exclusive: 'Exclusive rentals',
  event: 'Events',
};

/** Fixed order, so a group keeps its place and its colour whatever it sold. */
const GROUP_ORDER: SalesGroup[] = ['entrance', 'cottage', 'room', 'exclusive', 'event'];

function groupOf(state: State, product: string): SalesGroup {
  const kind = productKind(state, product);
  if (kind === 'cottage' || kind === 'room' || kind === 'exclusive' || kind === 'event') return kind;
  return 'entrance';
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const dayOf = (timestamp: string): ISODate => timestamp.slice(0, 10);

const within = (day: ISODate, from: ISODate, to: ISODate): boolean => day >= from && day <= to;

/** Days in a window, counting both ends. */
function daysBetween(from: ISODate, to: ISODate): number {
  let days = 1;
  for (let day = from; day < to; day = addDays(day, 1)) days += 1;
  return days;
}

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

/**
 * The figures for any stretch of days: the whole window the dashboard is
 * showing, or one bar of its trend when a reader pins it.
 */
export function salesBetween(state: State, from: ISODate, to: ISODate): SalesSummary {
  const days = daysBetween(from, to);
  const taken = bookedBetween(state, from, to);
  const booked = sum(taken.map((booking) => booking.total));
  const collected = collectedBetween(state, from, to);
  const collectedBefore = collectedBetween(state, addDays(from, -days), addDays(from, -1));

  const products = new Map<SalesGroup, SalesSlice>();
  taken.forEach((booking) => {
    const key = groupOf(state, booking.product);
    const slice = products.get(key) ?? { key, label: GROUP_LABELS[key], amount: 0, count: 0, share: 0 };
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
    byProduct: rank(GROUP_ORDER.flatMap((group) => products.get(group) ?? [])),
    byMethod: rank([...methods.values()]),
  };
}

export function salesReport(state: State, days: number): SalesReport {
  const to = state.meta.asOf;
  const from = addDays(to, -(days - 1));
  return { ...salesBetween(state, from, to), ...trend(state, from, to, days) };
}
