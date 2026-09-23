// Settings for the single-use guest booking page: wording, colors, which
// optional fields show, house rules and which bookings a guest may pick.
// They live in data/booking-page.json so the page can be edited without
// touching code. Anything missing from the file falls back to these defaults.

import type { BookingPageSettings } from './types.js';

const SETTINGS_URL = new URL('../../../data/booking-page.json', import.meta.url);

export const DEFAULT_BOOKING_PAGE: BookingPageSettings = {
  copy: {
    eyebrow: 'Almost there',
    title: 'Confirm your booking',
    intro: 'Fill it in once and the front desk will hold your slot.',
    nameLabel: 'Your name',
    mobileLabel: 'Mobile number',
    productLabel: 'What are you booking?',
    addressLabel: 'Complete address',
    emailLabel: 'Email address (optional)',
    guestListLabel: 'Who is coming?',
    notesLabel: 'Anything we should know? (optional)',
    notesPlaceholder: 'Celebrating a birthday, bringing a dog…',
    submitLabel: 'Send my booking',
    paymentNote: 'Next, you pay a 50% downpayment by GCash QR to confirm your slot.',
    payTitle: 'Pay the downpayment',
    payIntro: 'We are holding your slot. It is confirmed as soon as the downpayment is verified.',
    payHelp: 'Paying later? Open this link again before your visit to finish. The rest is paid at check-in.',
    thanksScript: 'Salamat!',
    thanksText: 'Your booking is with the front desk. Keep this reference:',
    doneNote: 'Your slot is confirmed. Bring a valid ID; the balance is paid at check-in. This link cannot be used again.',
    problemHelp: 'Message V6M Resort on Facebook or Instagram and they will send a fresh link.',
  },
  theme: {
    accent: '#F2782B',
    background: '#1F2D5C',
  },
  fields: {
    notes: true,
    kids: true,
    priceEstimate: true,
    email: true,
    guestList: true,
  },
  houseRules: [
    'Bring a valid ID for check-in.',
    'Pets are welcome in diapers or cages.',
  ],
  products: [],
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const HEX = /^#[0-9a-f]{6}$/i;

/** Keeps only known keys with the right types, so a hand-edited file cannot break the page. */
export function normalizeBookingPage(input: unknown): BookingPageSettings {
  const source = isObject(input) ? input : {};
  const base = DEFAULT_BOOKING_PAGE;

  const copy = { ...base.copy };
  if (isObject(source.copy)) {
    for (const key of Object.keys(copy) as (keyof typeof copy)[]) {
      const value = source.copy[key];
      if (typeof value === 'string') copy[key] = value;
    }
  }

  const theme = { ...base.theme };
  if (isObject(source.theme)) {
    for (const key of Object.keys(theme) as (keyof typeof theme)[]) {
      const value = source.theme[key];
      if (typeof value === 'string' && HEX.test(value)) theme[key] = value;
    }
  }

  const fields = { ...base.fields };
  if (isObject(source.fields)) {
    for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
      const value = source.fields[key];
      if (typeof value === 'boolean') fields[key] = value;
    }
  }

  const strings = (value: unknown, fallback: string[]): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : fallback;

  return {
    copy,
    theme,
    fields,
    houseRules: strings(source.houseRules, base.houseRules),
    products: strings(source.products, base.products),
  };
}

/** Loads data/booking-page.json; a missing or broken file falls back to the defaults. */
export async function loadBookingPage(): Promise<BookingPageSettings> {
  try {
    const response = await fetch(SETTINGS_URL, { cache: 'no-store' });
    if (!response.ok) return DEFAULT_BOOKING_PAGE;
    return normalizeBookingPage(await response.json());
  } catch {
    return DEFAULT_BOOKING_PAGE;
  }
}

/** Dark text on light backgrounds, white text on dark ones. */
export function readableInk(hex: string): string {
  const DARK = '#1F2D5C';
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = (channel: number) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return luminance > 0.4 ? DARK : '#FFFFFF';
}
