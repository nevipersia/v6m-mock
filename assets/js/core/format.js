// Formatting for pesos, dates and times. Dates are ISO strings (YYYY-MM-DD);
// timestamps are ISO strings with a +08:00 offset (Asia/Manila).

export const peso = (amount) => `₱${Math.round(amount).toLocaleString('en-PH')}`;

export function parseDate(iso) {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function toISODate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(iso, days) {
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
};

export const formatDate = (iso, style = 'short') =>
  parseDate(iso).toLocaleDateString('en-US', DATE_STYLES[style]);

/** "15:00" → "3 PM", "12:00" → "12 NN", "08:30" → "8:30 AM" */
export function formatTime(hhmm) {
  const [hours, minutes] = hhmm.split(':').map(Number);
  if (hours === 12 && minutes === 0) return '12 NN';
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 || 12;
  return minutes ? `${hour}:${String(minutes).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`;
}

export const timeOf = (timestamp) => formatTime(timestamp.slice(11, 16));

export const formatDateTime = (timestamp) =>
  `${formatDate(timestamp.slice(0, 10), 'monthDay')}, ${timeOf(timestamp)}`;

export const plural = (count, word, pluralWord = `${word}s`) =>
  `${count} ${count === 1 ? word : pluralWord}`;

export const initials = (name) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');

export const isPHMobile = (value) => /^(09|639)\d{9}$/.test(String(value).replace(/\D/g, ''));

/** Digits only, grouped with commas: "12000" -> "12,000". Empty stays empty. */
export function formatDigits(value) {
  const digits = String(value ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return digits ? Number(digits).toLocaleString('en-PH') : '';
}

/** Reads a typed amount or count back as a number; blank counts as 0. */
export const parseDigits = (value) => Number(String(value ?? '').replace(/\D/g, '')) || 0;

export const weekdayName = (index) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][index];
