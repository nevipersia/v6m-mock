// Guest registration sheet: the resort's companions template as a PDF. One
// page with the booking, the guest list with signature lines, the charges and
// "Received by"; big groups continue the guest list on more pages.

import { createPdf, downloadBlob, pdfPage, type PdfItem, type RGB } from '../../core/pdf.js';
import { formatDate, formatDateTime, formatTime, peso, timeOf } from '../../core/format.js';
import {
  DOWNPAYMENT_PERCENT, SOURCE_LABELS, downpaymentDue, exclusiveSessionLabel, findExclusive, findGuest, findSession,
  findStaff, findUnit,
} from '../../core/rules.js';
import type { Booking, Companion, State } from '../../core/types.js';

const MARGIN = 44;
const RIGHT = pdfPage.width - MARGIN;
const FOREST: RGB = [0.17, 0.19, 0.17];
const GOLD: RGB = [0.55, 0.45, 0.27];
const ROW = 19;

/** "DAY TOUR (8AM-4PM)", the way the paper sheet titles each session. */
function sessionTitle(state: State, booking: Booking): string {
  const pkg = findExclusive(state, booking.product);
  const hours = (start: string, end: string) => `${formatTime(start).replace(' ', '')}-${formatTime(end).replace(' ', '')}`;
  if (pkg) return `EXCLUSIVE ${exclusiveSessionLabel(pkg).toUpperCase()} (${hours(pkg.start, pkg.end)}) - ${pkg.name.toUpperCase()}`;
  const unit = findUnit(state, booking.product);
  const session = findSession(state, unit ? unit.session : booking.product);
  if (!session) return 'PRIVATE EVENT';
  return `${session.label.toUpperCase()} (${hours(session.start, session.end)})`;
}

interface Pen {
  items: PdfItem[];
  y: number;
}

const text = (pen: Pen, value: string, x: number, options: Partial<{ size: number; bold: boolean; gray: number; color: RGB; y: number }> = {}) => {
  pen.items.push({ type: 'text', x, y: options.y ?? pen.y, value, size: options.size ?? 10, bold: options.bold ?? false, gray: options.gray ?? 0.12, ...(options.color ? { color: options.color } : {}) });
};
const line = (pen: Pen, x1: number, x2: number, y = pen.y, gray = 0.7) => pen.items.push({ type: 'line', x1, y1: y, x2, y2: y, gray, width: 0.6 });

/** Label and a filled-in value on a writing line, like "NAME OF GUEST: ______". */
function field(pen: Pen, label: string, value: string, x: number, width: number) {
  text(pen, label, x, { size: 8, bold: true, gray: 0.35 });
  const labelWidth = label.length * 4.6 + 6;
  text(pen, value, x + labelWidth, { size: 10 });
  line(pen, x + labelWidth - 2, x + width, pen.y - 3);
}

function header(pen: Pen, booking: Booking, title: string, page: number, pages: number) {
  pen.items.push({ type: 'rect', x: 0, y: pdfPage.height - 78, width: pdfPage.width, height: 78, color: FOREST });
  text(pen, 'V6M RESORT', MARGIN, { y: pdfPage.height - 40, size: 20, bold: true, gray: 1 });
  text(pen, 'Purok 3, Brgy. Munting Pulo, Lipa City  |  (043) 756 4547  |  0927-823-3678', MARGIN, { y: pdfPage.height - 58, size: 8.5, gray: 0.85 });
  text(pen, 'GUEST REGISTRATION', RIGHT - 128, { y: pdfPage.height - 40, size: 11, bold: true, gray: 1 });
  text(pen, `${booking.id}${pages > 1 ? `  ·  page ${page} of ${pages}` : ''}`, RIGHT - 128, { y: pdfPage.height - 58, size: 8.5, gray: 0.85 });
  pen.y = pdfPage.height - 106;
  text(pen, title, MARGIN, { size: 12.5, bold: true, color: GOLD });
  pen.y -= 22;
}

const COLUMNS = [
  { label: '#', x: MARGIN, width: 20 },
  { label: 'NAME', x: MARGIN + 20, width: 190 },
  { label: 'GENDER', x: MARGIN + 210, width: 52 },
  { label: 'AGE', x: MARGIN + 262, width: 34 },
  { label: 'SIGNATURE', x: MARGIN + 296, width: 110 },
  { label: 'REMARKS', x: MARGIN + 406, width: RIGHT - MARGIN - 406 },
];

function guestTableHead(pen: Pen) {
  pen.items.push({ type: 'rect', x: MARGIN, y: pen.y - 5, width: RIGHT - MARGIN, height: 16, color: [0.94, 0.92, 0.87] });
  COLUMNS.forEach((column) => text(pen, column.label, column.x + 3, { size: 7.5, bold: true, gray: 0.3 }));
  pen.y -= ROW;
}

function guestRow(pen: Pen, index: number, row: Companion | null) {
  text(pen, String(index + 1), COLUMNS[0]!.x + 3, { size: 8.5, gray: 0.45 });
  if (row) {
    text(pen, row.name.slice(0, 34), COLUMNS[1]!.x + 3, { size: 9.5 });
    text(pen, row.gender, COLUMNS[2]!.x + 3, { size: 9 });
    text(pen, row.age == null ? '' : String(row.age), COLUMNS[3]!.x + 3, { size: 9 });
    text(pen, row.remarks.slice(0, 22), COLUMNS[5]!.x + 3, { size: 8.5, gray: 0.35 });
  }
  line(pen, MARGIN, RIGHT, pen.y - 5, 0.82);
  pen.y -= ROW;
}

export function bookingPdfBlob(state: State, booking: Booking): Blob {
  const guest = findGuest(state, booking.guestId);
  const staff = findStaff(state, booking.createdBy);
  const unit = findUnit(state, booking.product);
  const title = sessionTitle(state, booking);
  const pax = booking.adults + booking.kids;
  const list = booking.guestList ?? [];
  // Named guests plus blank lines up to the headcount, like the paper sheet (at least 10 lines).
  const rows = Math.max(list.length, Math.min(pax, 120), 10);

  const first: Pen = { items: [], y: 0 };
  // Page 1 fits the details, a short guest table and the totals; the rest continue on more pages.
  const firstPageRows = 12;
  const laterPageRows = 34;
  const pages = 1 + Math.ceil(Math.max(0, rows - firstPageRows) / laterPageRows);
  header(first, booking, title, 1, pages);

  const half = (RIGHT - MARGIN) / 2;
  field(first, 'DATE:', formatDate(booking.date, 'full'), MARGIN, half - 14);
  field(first, 'TIME IN:', booking.checkedInAt ? timeOf(booking.checkedInAt) : `(${timeOf(booking.startsAt)})`, MARGIN + half, half);
  first.y -= 21;
  field(first, 'NAME OF GUEST:', booking.guestName, MARGIN, half - 14);
  field(first, 'TIME OUT:', booking.checkedOutAt ? timeOf(booking.checkedOutAt) : `(${timeOf(booking.endsAt)})`, MARGIN + half, half);
  first.y -= 21;
  field(first, 'ADDRESS:', guest?.address ?? '', MARGIN, RIGHT - MARGIN);
  first.y -= 21;
  field(first, 'CONTACT NUMBER:', guest?.mobile ?? '', MARGIN, half - 14);
  field(first, 'EMAIL:', guest?.email ?? '', MARGIN + half, half);
  first.y -= 21;
  field(first, 'COTTAGE:', unit?.kind === 'cottage' ? unit.name : findExclusive(state, booking.product)?.use === 'cottages' ? 'All kubo cottages' : '', MARGIN, half - 14);
  field(first, 'ROOM / VILLA:', unit?.kind === 'room' ? unit.name : findExclusive(state, booking.product)?.includes.split(' +')[0] ?? '', MARGIN + half, half);
  first.y -= 21;
  field(first, 'NUMBER OF PAX:', `${pax}  (${booking.adults} adult${booking.adults === 1 ? '' : 's'}, ${booking.kids} kid${booking.kids === 1 ? '' : 's'}${booking.scPwd ? `, ${booking.scPwd} SC/PWD` : ''})`, MARGIN, half - 14);
  field(first, 'DOWNPAYMENT:', `${peso(booking.paid)}${downpaymentDue(booking) ? ` (${DOWNPAYMENT_PERCENT}% is ${peso(booking.depositRequired)})` : ''}`, MARGIN + half, half);
  first.y -= 28;

  text(first, 'GUEST LIST', MARGIN, { size: 9.5, bold: true, color: GOLD });
  first.y -= 14;
  guestTableHead(first);
  const firstCount = Math.min(rows, firstPageRows);
  for (let i = 0; i < firstCount; i += 1) guestRow(first, i, list[i] ?? null);
  if (rows > firstPageRows) text(first, `Guest list continues on the next page (${rows - firstPageRows} more lines).`, MARGIN, { size: 8, gray: 0.45 });
  first.y -= 18;

  // Charges: the price lines, any discount, then totals.
  text(first, 'CHARGES AND ADDITIONAL', MARGIN, { size: 9.5, bold: true, color: GOLD });
  first.y -= 16;
  const amountX = RIGHT - 80;
  booking.pricing.lines.forEach((item) => {
    text(first, `${item.label}${item.qty > 1 ? `  (${item.qty} x ${peso(item.unitPrice)})` : ''}`, MARGIN, { size: 9, gray: 0.25 });
    text(first, peso(item.amount), amountX, { size: 9 });
    first.y -= 14;
  });
  if (booking.pricing.discount) {
    text(first, `Promo ${booking.pricing.promoId}`, MARGIN, { size: 9, gray: 0.25 });
    text(first, `-${peso(booking.pricing.discount)}`, amountX, { size: 9 });
    first.y -= 14;
  }
  if (booking.discount) {
    text(first, `Discount${booking.discount.kind === 'percent' ? ` (${booking.discount.value}%)` : ''}${booking.discount.note ? `: ${booking.discount.note.slice(0, 50)}` : ''}`, MARGIN, { size: 9, gray: 0.25 });
    text(first, `-${peso(booking.discount.amount)}`, amountX, { size: 9 });
    first.y -= 14;
  }
  if (booking.scPwd) {
    text(first, `SC/PWD in the group: ${booking.scPwd}`, MARGIN, { size: 9, gray: 0.25 });
    first.y -= 14;
  }
  line(first, RIGHT - 220, RIGHT, first.y + 8, 0.5);
  first.y -= 6;
  [['TOTAL', booking.total], ['DOWNPAYMENT', booking.paid], ['OVERALL AMOUNT DUE', booking.balance]].forEach(([label, value]) => {
    text(first, String(label), RIGHT - 220, { size: 9, bold: true });
    text(first, peso(Number(value)), amountX, { size: 10, bold: true });
    first.y -= 15;
  });

  // Signatures at the bottom of page 1.
  const signY = MARGIN + 54;
  line(first, MARGIN, MARGIN + 200, signY, 0.3);
  text(first, 'Guest signature over printed name', MARGIN, { y: signY - 12, size: 8, gray: 0.45 });
  line(first, RIGHT - 190, RIGHT, signY, 0.3);
  text(first, 'RECEIVED BY', RIGHT - 190, { y: signY - 12, size: 8, bold: true, gray: 0.45 });
  text(first, `Issued ${formatDateTime(booking.createdAt)}${staff ? ` by ${staff.name}` : ''} · booked via ${SOURCE_LABELS[booking.source] ?? booking.source} · mock document, not a receipt`, MARGIN, { y: MARGIN - 8, size: 7, gray: 0.55 });

  const allPages: PdfItem[][] = [first.items];
  for (let page = 2, start = firstPageRows; start < rows; page += 1, start += laterPageRows) {
    const pen: Pen = { items: [], y: 0 };
    header(pen, booking, `${title} - GUEST LIST (CONTINUED)`, page, pages);
    guestTableHead(pen);
    for (let i = start; i < Math.min(rows, start + laterPageRows); i += 1) guestRow(pen, i, list[i] ?? null);
    allPages.push(pen.items);
  }
  return createPdf(allPages);
}

export function downloadBookingPdf(state: State, booking: Booking): void {
  const safeName = booking.guestName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  downloadBlob(bookingPdfBlob(state, booking), `${booking.id}-${safeName}-registration.pdf`);
}
