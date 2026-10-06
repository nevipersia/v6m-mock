// GCash payment for the 50% downpayment, sent to the resort's own GCash
// account. A personal account's QR is fixed: it cannot carry the amount or the
// booking, and nothing tells the website when money arrives. So the guest
// scans it, types the amount, and sends back their receipt and reference
// number; staff then find the payment in the resort's GCash app and confirm it
// in the desk (see submitPaymentCheck and confirmPaymentCheck in actions.ts).

import { downpaymentDue } from './rules.js';
import type { Booking, State } from './types.js';

const REFERENCE_DIGITS = 13;

/**
 * The resort's GCash account as the pay screen shows it. A demo stand-in: swap
 * in the real account name and the QR image saved from the GCash app.
 */
export const GCASH_ACCOUNT = {
  name: 'V6M Resort (demo)',
  number: '0917 ••• 4821',
  /** What the demo QR encodes. A real one is the image from GCash's Receive → QR screen. */
  qrPayload: 'GCASH-PERSONAL|V6M-RESORT-DEMO|09170004821',
};

/** FNV-1a: a small stable hash, used for the sample references. */
export function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

export interface QrPaymentRequest {
  bookingId: string;
  amount: number;
}

/** The payment request for whatever downpayment is still due, or null when it is paid. */
export function qrPaymentRequest(booking: Booking): QrPaymentRequest | null {
  const amount = downpaymentDue(booking);
  return amount === 0 ? null : { bookingId: booking.id, amount };
}

export const referenceDigits = (reference: string): string => reference.replace(/\D/g, '');

/** "1234567890123" → "1234 567 890123", the way GCash receipts print it. */
export function formatReference(reference: string): string {
  const digits = referenceDigits(reference);
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`.trim();
}

/**
 * Why a reference cannot be right, or null when it could be: it must be 13
 * digits, not all one repeated digit (a common typo test), and not already
 * used on another payment.
 * Whether the money really arrived is for staff to see in GCash.
 */
export function referenceProblem(state: State, reference: string): string | null {
  const digits = referenceDigits(reference);
  if (!digits) return 'Enter the GCash reference number from your receipt.';
  if (digits.length !== REFERENCE_DIGITS) return `A GCash reference has ${REFERENCE_DIGITS} digits. This one has ${digits.length}.`;
  if (/^(\d)\1+$/.test(digits)) return 'That does not look like a GCash reference. Check the receipt and try again.';
  const used = state.payments.some((payment) => payment.reference && referenceDigits(payment.reference) === digits)
    || state.paymentChecks.some((check) => check.status !== 'rejected' && check.reference && referenceDigits(check.reference) === digits);
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

const escapeXml = (text: string): string =>
  text.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * A stand-in GCash receipt for the demo's "simulate a payment" button, as an
 * SVG data URL. It is plainly marked as a demo so it cannot pass for a real one.
 */
export function sampleReceipt({ amount, reference, senderName, sentAt }: {
  amount: number; reference: string; senderName: string; sentAt: string;
}): string {
  const when = sentAt.slice(0, 16).replace('T', ' ');
  const money = `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 520" width="360" height="520" font-family="Arial, sans-serif">
<rect width="360" height="520" fill="#eef3fb"/>
<rect width="360" height="64" fill="#0a5bd8"/>
<text x="180" y="40" fill="#fff" font-size="22" font-weight="700" text-anchor="middle">GCash</text>
<rect x="20" y="84" width="320" height="400" rx="14" fill="#fff"/>
<circle cx="180" cy="126" r="22" fill="#0a5bd8"/>
<path d="M170 126l7 7 14-15" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<text x="180" y="174" font-size="15" fill="#333" text-anchor="middle">Sent via GCash</text>
<text x="180" y="210" font-size="28" font-weight="700" fill="#111" text-anchor="middle">${escapeXml(money)}</text>
<line x1="40" y1="236" x2="320" y2="236" stroke="#e3e7ef"/>
<text x="40" y="266" font-size="13" fill="#777">To</text>
<text x="320" y="266" font-size="13" fill="#111" text-anchor="end">${escapeXml(GCASH_ACCOUNT.name)}</text>
<text x="40" y="294" font-size="13" fill="#777">Number</text>
<text x="320" y="294" font-size="13" fill="#111" text-anchor="end">${escapeXml(GCASH_ACCOUNT.number)}</text>
<text x="40" y="322" font-size="13" fill="#777">From</text>
<text x="320" y="322" font-size="13" fill="#111" text-anchor="end">${escapeXml(senderName.slice(0, 28))}</text>
<text x="40" y="350" font-size="13" fill="#777">Ref No.</text>
<text x="320" y="350" font-size="13" fill="#111" text-anchor="end" font-family="Consolas, monospace">${escapeXml(reference)}</text>
<text x="40" y="378" font-size="13" fill="#777">Date</text>
<text x="320" y="378" font-size="13" fill="#111" text-anchor="end">${escapeXml(when)}</text>
<rect x="40" y="410" width="280" height="44" rx="8" fill="#fff4e0" stroke="#f0b44c" stroke-dasharray="5 4"/>
<text x="180" y="437" font-size="13" font-weight="700" fill="#9a5b00" text-anchor="middle">DEMO RECEIPT · NOT A REAL PAYMENT</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
