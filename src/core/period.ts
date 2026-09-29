// The shared shape of a window of days: how long it is, how it splits into
// chart bars, and how a set of amounts ranks into slices. Used by the sales
// figures (core/sales.ts) and the profit and loss figures (core/finance.ts).

import { addDays, formatDate } from './format.js';
import type { ISODate } from './types.js';

/** Above this many days a trend is bucketed into weeks so the bars stay readable. */
export const DAILY_LIMIT = 14;

/** One bar of a trend chart: a day, or a week when the window is long. */
export interface Bucket {
  label: string;
  /** Read out for the whole bar, e.g. "Sep 8 to Sep 14". */
  title: string;
  from: ISODate;
  to: ISODate;
  isNow: boolean;
}

/** One line of a breakdown: cottages, GCash, utilities, and so on. */
export interface Slice {
  key: string;
  label: string;
  amount: number;
  count: number;
  /** 0–1 of the breakdown's total, for the bar width. */
  share: number;
}

export const sumOf = (values: number[]): number => values.reduce((total, value) => total + value, 0);

/** The date part of a timestamp. */
export const dayOf = (timestamp: string): ISODate => timestamp.slice(0, 10);

export const within = (day: ISODate, from: ISODate, to: ISODate): boolean => day >= from && day <= to;

/** Days in a window, counting both ends. */
export function daysBetween(from: ISODate, to: ISODate): number {
  let days = 1;
  for (let day = from; day < to; day = addDays(day, 1)) days += 1;
  return days;
}

/** The bars a window splits into: one per day, or one per week when it is long. */
export function buckets(asOf: ISODate, from: ISODate, to: ISODate, days: number): { buckets: Bucket[]; weekly: boolean } {
  const weekly = days > DAILY_LIMIT;
  const step = weekly ? 7 : 1;
  const list: Bucket[] = [];
  for (let start = from; start <= to; start = addDays(start, step)) {
    const end = weekly ? addDays(start, 6) : start;
    const last = end > to ? to : end;
    list.push({
      label: weekly ? formatDate(start, 'monthDay') : formatDate(start, 'weekday'),
      title: weekly ? `${formatDate(start)} to ${formatDate(last)}` : formatDate(start, 'long'),
      from: start,
      to: last,
      isNow: within(asOf, start, last),
    });
  }
  return { buckets: list, weekly };
}

/** Drops the empty slices, works out each share of the total and sorts by size. */
export function rankSlices(slices: Slice[]): Slice[] {
  const total = sumOf(slices.map((slice) => slice.amount));
  return slices
    .filter((slice) => slice.amount > 0)
    .map((slice) => ({ ...slice, share: total ? slice.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}
