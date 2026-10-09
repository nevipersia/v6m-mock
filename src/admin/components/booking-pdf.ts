// Guest registration sheet: the resort's companions template as a PDF. One
// page with the booking, the guest list with signature lines, the charges and
// "Received by"; big groups continue the guest list on more pages.
//
// Text is measured with the font's real widths, so a label never runs into its
// value and a value too long for its line is cut short with "...". The charges
// and totals always stay clear of the signature lines: page 1 shows fewer guest
// lines when there are many charges, and the rest continue on the next page.

import { createPdf, downloadBlob, fitText, pdfPage, textWidth, type PdfItem, type RGB } from '../../core/pdf.js';
import { formatDate, formatDateTime, formatTime, peso, timeOf } from '../../core/format.js';
import {
  SOURCE_LABELS, stillToConfirm, exclusiveSessionLabel, findExclusive, findGuest, findSession,
  findStaff, findUnit,
} from '../../core/rules.js';
import type { Booking, Companion, State, Timestamp } from '../../core/types.js';

const MARGIN = 44;
const RIGHT = pdfPage.width - MARGIN;
const NAVY: RGB = [0.12, 0.18, 0.36];
const ORANGE: RGB = [0.82, 0.37, 0.09];
const ROW = 19;
const FIELD_GAP = 21;
/** The signature lines at the foot of page 1; nothing else may come lower than SIGN_Y + SIGN_CLEARANCE. */
const SIGN_Y = MARGIN + 54;
const SIGN_CLEARANCE = 30;
/** Most guest lines on page 1, and on each page after it. */
const FIRST_PAGE_ROWS = 12;
const LATER_PAGE_ROWS = 34;
/** Fewest guest lines page 1 keeps when the charges need the room. */
const FIRST_PAGE_MIN_ROWS = 3;
const CHARGE_ROW = 14;
const TOTAL_ROW = 15;
const TOTALS_X = RIGHT - 220;

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

/**
 * When the guest actually arrived or left, blank until it happens. A time on
 * another day than the booking (leaving an overnight the next morning) says
 * which day.
 */
function stamp(booking: Booking, timestamp: Timestamp | null): string {
  if (!timestamp) return '';
  const day = timestamp.slice(0, 10);
  return day === booking.date ? timeOf(timestamp) : `${timeOf(timestamp)}, ${formatDate(day, 'monthDay')}`;
}

/**
 * The money in two parts: what was paid before arrival (the downpayment, or
 * more), and what was paid at the resort: from check-in on, such as the
 * balance settled at check-in, and for a walk-in anything paid at the counter
 * on the day itself, even before staff pressed check-in.
 */
function paidSplit(state: State, booking: Booking): { advance: number; atResort: number } {
  const arrived = booking.checkedInAt;
  const atTheResort = (receivedAt: Timestamp): boolean =>
    (!!arrived && receivedAt >= arrived) || (booking.source === 'walk_in' && receivedAt.slice(0, 10) === booking.date);
  const atResort = state.payments
    .filter((payment) => payment.bookingId === booking.id && atTheResort(payment.receivedAt))
    .reduce((sum, payment) => sum + payment.amount, 0);
  return { advance: Math.max(0, booking.paid - atResort), atResort };
}

interface Pen {
  items: PdfItem[];
  y: number;
}

type TextOptions = Partial<{ size: number; bold: boolean; gray: number; color: RGB; y: number; max: number }>;

/** Writes text; with `max`, cuts it short to fit that many points. */
const text = (pen: Pen, value: string, x: number, options: TextOptions = {}) => {
  const size = options.size ?? 10;
  const bold = options.bold ?? false;
  const shown = options.max ? fitText(value, size, options.max, bold) : value;
  pen.items.push({ type: 'text', x, y: options.y ?? pen.y, value: shown, size, bold, gray: options.gray ?? 0.12, ...(options.color ? { color: options.color } : {}) });
};

/** Writes text so it ends at `right`. */
const textRight = (pen: Pen, value: string, right: number, options: TextOptions = {}) =>
  text(pen, value, right - textWidth(value, options.size ?? 10, options.bold ?? false), options);

const line = (pen: Pen, x1: number, x2: number, y = pen.y, gray = 0.7) => pen.items.push({ type: 'line', x1, y1: y, x2, y2: y, gray, width: 0.6 });

/** Label and a filled-in value on a writing line, like "NAME OF GUEST: ______". */
function field(pen: Pen, label: string, value: string, x: number, width: number) {
  text(pen, label, x, { size: 8, bold: true, gray: 0.35 });
  const valueX = x + textWidth(label, 8, true) + 6;
  text(pen, value, valueX, { size: 10, max: x + width - valueX - 2 });
  line(pen, valueX - 2, x + width, pen.y - 3);
}

function header(pen: Pen, title: string) {
  pen.items.push({ type: 'rect', x: 0, y: pdfPage.height - 78, width: pdfPage.width, height: 78, color: NAVY });
  text(pen, 'V6M RESORT', MARGIN, { y: pdfPage.height - 40, size: 20, bold: true, gray: 1 });
  text(pen, 'Purok 3, Brgy. Munting Pulo, Lipa City  |  (043) 756 4547  |  0927-823-3678', MARGIN, { y: pdfPage.height - 58, size: 8.5, gray: 0.85 });
  textRight(pen, 'GUEST REGISTRATION', RIGHT, { y: pdfPage.height - 40, size: 11, bold: true, gray: 1 });
  pen.y = pdfPage.height - 106;
  text(pen, title, MARGIN, { size: 12.5, bold: true, color: ORANGE, max: RIGHT - MARGIN });
  pen.y -= 22;
}

/** The booking reference under the header's title, with the page number once the page count is known. */
function pageLabel(pen: Pen, booking: Booking, page: number, pages: number) {
  textRight(pen, `${booking.id}${pages > 1 ? `  ·  page ${page} of ${pages}` : ''}`, RIGHT, { y: pdfPage.height - 58, size: 8.5, gray: 0.85 });
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
  const cell = (column: number) => ({ x: COLUMNS[column]!.x + 3, max: COLUMNS[column]!.width - 6 });
  text(pen, String(index + 1), cell(0).x, { size: 8.5, gray: 0.45 });
  if (row) {
    text(pen, row.name, cell(1).x, { size: 9.5, max: cell(1).max });
    text(pen, row.gender, cell(2).x, { size: 9, max: cell(2).max });
    text(pen, row.age == null ? '' : String(row.age), cell(3).x, { size: 9, max: cell(3).max });
    text(pen, row.remarks, cell(5).x, { size: 8.5, gray: 0.35, max: cell(5).max });
  }
  line(pen, MARGIN, RIGHT, pen.y - 5, 0.82);
  pen.y -= ROW;
}

export function bookingPdfBlob(state: State, booking: Booking): Blob {
  const guest = findGuest(state, booking.guestId);
  const staff = findStaff(state, booking.createdBy);
  const unit = findUnit(state, booking.product);
  const pkg = findExclusive(state, booking.product);
  const title = sessionTitle(state, booking);
  const pax = booking.adults + booking.kids;
  const list = booking.guestList ?? [];
  // Named guests plus blank lines up to the headcount, like the paper sheet (at least 10 lines).
  const rows = Math.max(list.length, Math.min(pax, 120), 10);
  const { advance, atResort } = paidSplit(state, booking);

  const first: Pen = { items: [], y: 0 };
  header(first, title);

  const half = (RIGHT - MARGIN) / 2;
  const left = half - 14;
  field(first, 'DATE:', formatDate(booking.date, 'full'), MARGIN, left);
  field(first, 'TIME IN:', stamp(booking, booking.checkedInAt), MARGIN + half, half);
  first.y -= FIELD_GAP;
  field(first, 'NAME OF GUEST:', booking.guestName, MARGIN, left);
  field(first, 'TIME OUT:', stamp(booking, booking.checkedOutAt), MARGIN + half, half);
  first.y -= FIELD_GAP;
  field(first, 'ADDRESS:', guest?.address ?? '', MARGIN, RIGHT - MARGIN);
  first.y -= FIELD_GAP;
  field(first, 'CONTACT NUMBER:', guest?.mobile ?? '', MARGIN, left);
  field(first, 'EMAIL:', guest?.email ?? '', MARGIN + half, half);
  first.y -= FIELD_GAP;
  field(first, 'COTTAGE:', unit?.kind === 'cottage' ? unit.name : pkg?.use === 'cottages' ? 'All kubo cottages' : '', MARGIN, left);
  field(first, 'ROOM / VILLA:', unit?.kind === 'room' ? unit.name : pkg?.includes.split(' +')[0] ?? '', MARGIN + half, half);
  first.y -= FIELD_GAP;
  field(first, 'NUMBER OF PAX:', `${pax}  (${booking.adults} adult${booking.adults === 1 ? '' : 's'}, ${booking.kids} kid${booking.kids === 1 ? '' : 's'}${booking.scPwd ? `, ${booking.scPwd} SC/PWD` : ''})`, MARGIN, left);
  field(first, 'DOWNPAYMENT:', `${peso(advance)}${stillToConfirm(booking) ? ` (of ${peso(booking.depositRequired)})` : ''}`, MARGIN + half, half);
  first.y -= 28;

  // Charges: the price lines, any promo or discount, then the totals.
  const charges: [string, string][] = booking.pricing.lines.map((item) => [
    `${item.label}${item.qty > 1 ? `  (${item.qty} x ${peso(item.unitPrice)})` : ''}`,
    peso(item.amount),
  ]);
  if (booking.pricing.discount) {
    const promo = state.promos.find((item) => item.id === booking.pricing.promoId);
    charges.push([`Promo: ${promo?.name ?? booking.pricing.promoId}`, `-${peso(booking.pricing.discount)}`]);
  }
  if (booking.discount) {
    charges.push([`Discount${booking.discount.kind === 'percent' ? ` (${booking.discount.value}%)` : ''}${booking.discount.note ? `: ${booking.discount.note}` : ''}`, `-${peso(booking.discount.amount)}`]);
  }
  if (booking.scPwd) charges.push([`SC/PWD in the group: ${booking.scPwd}`, '']);
  const totals: [string, number][] = [
    ['TOTAL', booking.total],
    ['DOWNPAYMENT', advance],
    ...(atResort ? [['PAID AT THE RESORT', atResort] as [string, number]] : []),
    ['OVERALL AMOUNT DUE', booking.balance],
  ];
  const chargesHeight = 18 + 16 + charges.length * CHARGE_ROW + 6 + totals.length * TOTAL_ROW;

  // Guest list: as many lines as fit above the charges, the rest on later pages.
  text(first, 'GUEST LIST', MARGIN, { size: 9.5, bold: true, color: ORANGE });
  first.y -= 14;
  guestTableHead(first);
  const continueNote = 14;
  const room = Math.floor((first.y - (SIGN_Y + SIGN_CLEARANCE) - chargesHeight - continueNote) / ROW);
  const firstPageRows = Math.max(FIRST_PAGE_MIN_ROWS, Math.min(FIRST_PAGE_ROWS, room));
  const pages = 1 + Math.ceil(Math.max(0, rows - firstPageRows) / LATER_PAGE_ROWS);
  const firstCount = Math.min(rows, firstPageRows);
  for (let i = 0; i < firstCount; i += 1) guestRow(first, i, list[i] ?? null);
  if (rows > firstPageRows) text(first, `Guest list continues on the next page (${rows - firstPageRows} more lines).`, MARGIN, { size: 8, gray: 0.45 });
  first.y -= 18;

  text(first, 'CHARGES AND ADDITIONAL', MARGIN, { size: 9.5, bold: true, color: ORANGE });
  first.y -= 16;
  const amountRight = RIGHT;
  const labelMax = RIGHT - 90 - MARGIN;
  charges.forEach(([label, amount]) => {
    text(first, label, MARGIN, { size: 9, gray: 0.25, max: labelMax });
    if (amount) textRight(first, amount, amountRight, { size: 9 });
    first.y -= CHARGE_ROW;
  });
  line(first, TOTALS_X, RIGHT, first.y + 8, 0.5);
  first.y -= 6;
  totals.forEach(([label, value]) => {
    text(first, label, TOTALS_X, { size: 9, bold: true });
    textRight(first, peso(value), amountRight, { size: 10, bold: true });
    first.y -= TOTAL_ROW;
  });

  // Signatures at the bottom of page 1.
  line(first, MARGIN, MARGIN + 200, SIGN_Y, 0.3);
  text(first, 'Guest signature over printed name', MARGIN, { y: SIGN_Y - 12, size: 8, gray: 0.45 });
  line(first, RIGHT - 190, RIGHT, SIGN_Y, 0.3);
  text(first, 'RECEIVED BY', RIGHT - 190, { y: SIGN_Y - 12, size: 8, bold: true, gray: 0.45 });
  text(first, `Issued ${formatDateTime(booking.createdAt)}${staff ? ` by ${staff.name}` : ''} · booked via ${SOURCE_LABELS[booking.source] ?? booking.source} · mock document, not a receipt`, MARGIN, { y: MARGIN - 8, size: 7, gray: 0.55, max: RIGHT - MARGIN });
  pageLabel(first, booking, 1, pages);

  const allPages: PdfItem[][] = [first.items];
  for (let page = 2, start = firstPageRows; start < rows; page += 1, start += LATER_PAGE_ROWS) {
    const pen: Pen = { items: [], y: 0 };
    header(pen, `${title} - GUEST LIST (CONTINUED)`);
    pageLabel(pen, booking, page, pages);
    guestTableHead(pen);
    for (let i = start; i < Math.min(rows, start + LATER_PAGE_ROWS); i += 1) guestRow(pen, i, list[i] ?? null);
    allPages.push(pen.items);
  }
  return createPdf(allPages);
}

export function downloadBookingPdf(state: State, booking: Booking): void {
  const safeName = booking.guestName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  downloadBlob(bookingPdfBlob(state, booking), `${booking.id}-${safeName}-registration.pdf`);
}
