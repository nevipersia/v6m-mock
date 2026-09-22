// Booking confirmation slip: a one-page PDF the guest signs at check-in.

import { createPdf, downloadBlob, pdfPage, type PdfItem, type RGB } from '../../core/pdf.js';
import { formatDate, formatDateTime, peso, plural, timeOf } from '../../core/format.js';
import { SOURCE_LABELS, findGuest, findStaff, productLabel } from '../../core/rules.js';
import type { Booking, State } from '../../core/types.js';

const MARGIN = 56;
const RIGHT = pdfPage.width - MARGIN;
const NAVY: RGB = [0.12, 0.18, 0.36];

interface TextStyle {
  x?: number;
  size?: number;
  bold?: boolean;
  gray?: number;
}

export function bookingPdfBlob(state: State, booking: Booking): Blob {
  const guest = findGuest(state, booking.guestId);
  const staff = findStaff(state, booking.createdBy);
  const items: PdfItem[] = [];
  let y = pdfPage.height - MARGIN;

  const text = (value: string, { x = MARGIN, size = 11, bold = false, gray = 0.15 }: TextStyle = {}) => {
    items.push({ type: 'text', x, y, size, bold, gray, value });
  };
  const row = (label: string, value: string, { bold = false } = {}) => {
    text(label, { gray: 0.45 });
    text(value, { x: MARGIN + 150, bold });
    y -= 18;
  };
  const rule = (gap = 14) => {
    y -= gap;
    items.push({ type: 'line', x1: MARGIN, y1: y, x2: RIGHT, y2: y, gray: 0.8 });
    y -= gap + 4;
  };

  // Header band
  items.push({ type: 'rect', x: 0, y: pdfPage.height - 96, width: pdfPage.width, height: 96, color: NAVY });
  items.push({ type: 'text', x: MARGIN, y: pdfPage.height - 52, size: 22, bold: true, gray: 1, value: 'V6M Resort' });
  items.push({ type: 'text', x: MARGIN, y: pdfPage.height - 72, size: 10, gray: 0.85, value: 'Purok 3, Brgy. Munting Pulo, Lipa City, Batangas  |  0927-823-3678' });
  items.push({ type: 'text', x: RIGHT - 150, y: pdfPage.height - 52, size: 12, bold: true, gray: 1, value: 'Booking confirmation' });
  items.push({ type: 'text', x: RIGHT - 150, y: pdfPage.height - 72, size: 10, gray: 0.85, value: booking.id });

  y = pdfPage.height - 130;
  text(booking.guestName, { size: 16, bold: true });
  y -= 18;
  text(`${productLabel(state, booking.product)} · ${formatDate(booking.date, 'long')}`, { gray: 0.45 });
  y -= 26;

  row('Check in', `${formatDate(booking.date, 'long')}, ${timeOf(booking.startsAt)}`);
  row('Check out', `${formatDate(booking.endsAt.slice(0, 10), 'long')}, ${timeOf(booking.endsAt)}`);
  row('Guests', `${plural(booking.adults, 'adult')}${booking.kids ? `, ${plural(booking.kids, 'kid')}` : ''}`);
  row('Mobile', guest?.mobile ?? 'Not given');
  row('Booked via', SOURCE_LABELS[booking.source] ?? booking.source);
  if (booking.notes) row('Notes', booking.notes.slice(0, 60));

  rule();
  text('Charges', { size: 12, bold: true });
  y -= 20;

  booking.pricing.lines.forEach((line) => {
    text(`${line.label}  (${line.qty} x ${peso(line.unitPrice)})`, { gray: 0.3 });
    text(peso(line.amount), { x: RIGHT - 90 });
    y -= 17;
  });
  if (booking.pricing.discount) {
    text(`Promo ${booking.pricing.promoId}`, { gray: 0.3 });
    text(`-${peso(booking.pricing.discount)}`, { x: RIGHT - 90 });
    y -= 17;
  }

  rule(8);
  row('Total', peso(booking.total), { bold: true });
  row('Paid', peso(booking.paid));
  row('Balance due', peso(booking.balance), { bold: true });

  rule();
  text('House rules', { size: 12, bold: true });
  y -= 18;
  [
    'Bring a valid ID for check-in.',
    'Pets are welcome in diapers or cages.',
    'Day tour 8 AM to 4 PM. Overnight 6 PM to 6 AM. Rooms 3 PM to 12 NN.',
    'The balance is collected on arrival.',
  ].forEach((line) => {
    text(`-  ${line}`, { size: 10, gray: 0.35 });
    y -= 15;
  });

  // Signature block at the bottom
  const signatureY = MARGIN + 70;
  items.push({ type: 'line', x1: MARGIN, y1: signatureY, x2: MARGIN + 220, y2: signatureY, gray: 0.3 });
  items.push({ type: 'text', x: MARGIN, y: signatureY - 14, size: 9, gray: 0.45, value: 'Guest signature over printed name' });
  items.push({ type: 'line', x1: RIGHT - 200, y1: signatureY, x2: RIGHT, y2: signatureY, gray: 0.3 });
  items.push({ type: 'text', x: RIGHT - 200, y: signatureY - 14, size: 9, gray: 0.45, value: 'Date signed' });
  items.push({
    type: 'text', x: MARGIN, y: MARGIN - 6, size: 8, gray: 0.55,
    value: `Issued ${formatDateTime(booking.createdAt)}${staff ? ` by ${staff.name}` : ''} · mock document, not a receipt`,
  });

  return createPdf(items);
}

export function downloadBookingPdf(state: State, booking: Booking): void {
  const safeName = booking.guestName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  downloadBlob(bookingPdfBlob(state, booking), `${booking.id}-${safeName}.pdf`);
}
