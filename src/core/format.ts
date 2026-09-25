// Formatting for pesos, dates and times. Dates are ISO strings (YYYY-MM-DD);
// timestamps are ISO strings with a +08:00 offset (Asia/Manila).

import type { ISODate, Timestamp } from './types.js';

export const peso = (amount: number): string => `₱${Math.round(amount).toLocaleString('en-PH')}`;

export function parseDate(iso: ISODate | Timestamp): Date {
  const [year = 1970, month = 1, day = 1] = iso.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function toISODate(date: Date): ISODate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(iso: ISODate, days: number): ISODate {
  const date = parseDate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

const DATE_STYLES = {
  short: { weekday: 'short', month: 'short', day: 'numeric' },
  long: { weekday: 'long', month: 'long', day: 'numeric' },
  weekday: { weekday: 'short' },
  monthDay: { month: 'short', day: 'numeric' },
  monthDayLong: { month: 'long', day: 'numeric' },
  full: { month: 'long', day: 'numeric', year: 'numeric' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateStyle = keyof typeof DATE_STYLES;

export const formatDate = (iso: ISODate, style: DateStyle = 'short'): string =>
  parseDate(iso).toLocaleDateString('en-US', DATE_STYLES[style]);

/** "15:00" → "3 PM", "12:00" → "12 NN", "08:30" → "8:30 AM" */
export function formatTime(hhmm: string): string {
  const [hours = 0, minutes = 0] = hhmm.split(':').map(Number);
  if (hours === 12 && minutes === 0) return '12 NN';
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 || 12;
  return minutes ? `${hour}:${String(minutes).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`;
}

export const timeOf = (timestamp: Timestamp): string => formatTime(timestamp.slice(11, 16));

export const formatDateTime = (timestamp: Timestamp): string =>
  `${formatDate(timestamp.slice(0, 10), 'monthDay')}, ${timeOf(timestamp)}`;

export const plural = (count: number, word: string, pluralWord = `${word}s`): string =>
  `${count} ${count === 1 ? word : pluralWord}`;

export const initials = (name: string): string =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');

export const isPHMobile = (value: string): boolean => /^(09|639)\d{9}$/.test(String(value).replace(/\D/g, ''));

/** Digits only, grouped with commas: "12000" -> "12,000". Empty stays empty. */
export function formatDigits(value: string | number | null | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return digits ? Number(digits).toLocaleString('en-PH') : '';
}

/** Reads a typed amount or count back as a number; blank counts as 0. */
export const parseDigits = (value: string | number | null | undefined): number =>
  Number(String(value ?? '').replace(/\D/g, '')) || 0;

/** Loose check: something@something.something, the most a mock should insist on. */
export const isEmail = (value: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
