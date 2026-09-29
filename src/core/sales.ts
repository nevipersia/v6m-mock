// Sales figures for the dashboard: what was sold, what was collected, and
// where it came from. Windows are counted back from the demo's frozen "today".

import { addDays } from './format.js';
import { buckets, dayOf, daysBetween, rankSlices, sumOf, within, type Bucket, type Slice } from './period.js';
import { METHOD_LABELS, isActive, productKind } from './rules.js';
import type { Booking, ISODate, PaymentMethod, State } from './types.js';

/** One bar of the trend chart, with what was sold and taken in over it. */
export interface SalesPoint extends Bucket {
  booked: number;
  collected: number;
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
  byProduct: Slice[];
  byMethod: Slice[];
}

/** A summary of the whole window, plus the bars that make it up. */
export interface SalesReport extends SalesSummary {
  /** True when the bars are weeks rather than days. */
  weekly: boolean;
  points: SalesPoint[];
}

/** A breakdown line, under the name the dashboard has always used for it. */
export type SalesSlice = Slice;

/** Ranges the dashboard offers. */
export const SALES_RANGES = [7, 30, 90] as const;
export type SalesRange = (typeof SALES_RANGES)[number];

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

/** Bookings taken (created) between two dates, cancelled ones left out. */
const bookedBetween = (state: State, from: ISODate, to: ISODate): Booking[] =>
  state.bookings.filter((booking) => isActive(booking) && within(dayOf(booking.createdAt), from, to));

const collectedBetween = (state: State, from: ISODate, to: ISODate): number =>
  sumOf(state.payments.filter((payment) => within(dayOf(payment.receivedAt), from, to)).map((payment) => payment.amount));

/** The bars: one per day, or one per week for the longer windows. */
function trend(state: State, from: ISODate, to: ISODate, days: number): { points: SalesPoint[]; weekly: boolean } {
  const split = buckets(state.meta.asOf, from, to, days);
  return {
    weekly: split.weekly,
    points: split.buckets.map((bucket) => ({
      ...bucket,
      booked: sumOf(bookedBetween(state, bucket.from, bucket.to).map((booking) => booking.total)),
      collected: collectedBetween(state, bucket.from, bucket.to),
    })),
  };
}

/**
 * The figures for any stretch of days: the whole window the dashboard is
 * showing, or one bar of its trend when a reader pins it.
 */
export function salesBetween(state: State, from: ISODate, to: ISODate): SalesSummary {
  const days = daysBetween(from, to);
  const taken = bookedBetween(state, from, to);
  const booked = sumOf(taken.map((booking) => booking.total));
  const collected = collectedBetween(state, from, to);
  const collectedBefore = collectedBetween(state, addDays(from, -days), addDays(from, -1));

  const products = new Map<SalesGroup, Slice>();
  taken.forEach((booking) => {
    const key = groupOf(state, booking.product);
    const slice = products.get(key) ?? { key, label: GROUP_LABELS[key], amount: 0, count: 0, share: 0 };
    slice.amount += booking.total;
    slice.count += 1;
    products.set(key, slice);
  });

  const methods = new Map<PaymentMethod, Slice>();
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
    outstanding: sumOf(taken.map((booking) => booking.balance)),
    byProduct: rankSlices(GROUP_ORDER.flatMap((group) => products.get(group) ?? [])),
    byMethod: rankSlices([...methods.values()]),
  };
}

export function salesReport(state: State, days: number): SalesReport {
  const to = state.meta.asOf;
  const from = addDays(to, -(days - 1));
  return { ...salesBetween(state, from, to), ...trend(state, from, to, days) };
}
