// Mock GCash QR payment for the 50% downpayment. The QR carries the booking,
// the amount and a short check code; the guest pays and types the 13-digit
// GCash reference, which is "verified" here with simple rules. Nothing is
// charged and no payment provider is contacted.

import { downpaymentDue } from './rules.js';
import type { Booking, State } from './types.js';

const REFERENCE_DIGITS = 13;

/** Merchant shown on the QR screen. A demo name: this is not a real GCash account. */
export const QR_MERCHANT = 'V6M Resort (demo)';

/** FNV-1a: a small stable hash, used for the check code and the QR pattern. */
export function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

/** Four characters that tie a QR to one booking and amount, like a merchant's check digits. */
export const checkCode = (bookingId: string, amount: number): string =>
  hash(`${bookingId}|${amount}`).toString(36).toUpperCase().padStart(4, '0').slice(-4);

export interface QrPaymentRequest {
  bookingId: string;
  amount: number;
  code: string;
  /** What the QR encodes, in a GCash-like "merchant|reference|amount" shape. */
  payload: string;
}

/** The payment request for whatever downpayment is still due, or null when it is paid. */
export function qrPaymentRequest(booking: Booking): QrPaymentRequest | null {
  const amount = downpaymentDue(booking);
  if (amount === 0) return null;
  const code = checkCode(booking.id, amount);
  return { bookingId: booking.id, amount, code, payload: `V6MPAY|${booking.id}|PHP${amount}.00|${code}` };
}

export const referenceDigits = (reference: string): string => reference.replace(/\D/g, '');

/** "1234567890123" → "1234 567 890123", the way GCash receipts print it. */
export function formatReference(reference: string): string {
  const digits = referenceDigits(reference);
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`.trim();
}

/**
 * Mock verification. Why the reference is refused, or null when it passes:
 * it must be 13 digits, not all one repeated digit (a common typo test), and
 * not already used on another payment.
 */
export function referenceProblem(state: State, reference: string): string | null {
  const digits = referenceDigits(reference);
  if (!digits) return 'Enter the GCash reference number from your receipt.';
  if (digits.length !== REFERENCE_DIGITS) return `A GCash reference has ${REFERENCE_DIGITS} digits. This one has ${digits.length}.`;
  if (/^(\d)\1+$/.test(digits)) return 'GCash could not find that reference. Check the receipt and try again.';
  const used = state.payments.some((payment) => payment.reference && referenceDigits(payment.reference) === digits);
  if (used) return 'That reference was already used for another payment.';
  return null;
}

/** A believable, unused 13-digit reference for the "simulate a payment" shortcut. */
export function sampleReference(state: State, seed: string): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const a = hash(`${seed}|${attempt}|a`) % 1_000_000;
    const b = hash(`${seed}|${attempt}|b`) % 10_000_000;
    const digits = `${String(a).padStart(6, '0')}${String(b).padStart(7, '0')}`.replace(/^0/, '5');
    if (!referenceProblem(state, digits)) return formatReference(digits);
  }
  return formatReference(String(Date.now()).padEnd(REFERENCE_DIGITS, '7').slice(0, REFERENCE_DIGITS));
}
