// Ledger report: the Finances ledger for a month or any stretch of days, as a
// PDF. The registration sheet's header band, then the period, the totals and
// every entry in a table that runs on over as many pages as it needs, with the
// column heads repeated and the totals at the end.

import { createPdf, downloadBlob, fitText, pdfPage, textWidth, type PdfItem, type RGB } from '../../core/pdf.js';
import { formatDate, peso } from '../../core/format.js';
import { ledgerTotals, type LedgerEntry, type LedgerView } from '../../core/finance.js';
import { METHOD_LABELS } from '../../core/rules.js';

const MARGIN = 44;
const RIGHT = pdfPage.width - MARGIN;
const NAVY: RGB = [0.12, 0.18, 0.36];
const ORANGE: RGB = [0.82, 0.37, 0.09];
const GREEN: RGB = [0.24, 0.49, 0.23];
/** A loss is red and a profit green; money out is plain, as on the Finances page. */
const RED: RGB = [0.72, 0.27, 0.18];
const ROW = 24;
/** Nothing in the table comes lower than this; the page footer sits under it. */
const FLOOR = MARGIN + 28;

export interface LedgerReport {
  /** "October 2026", or "Oct 1 – Oct 6, 2026". */
  label: string;
  view: LedgerView;
  entries: LedgerEntry[];
  /** Who made it and when, for the footer. */
  generatedBy: string;
  generatedAt: string;
}

export const VIEW_WORDS: Record<LedgerView, string> = { all: 'Income and expenses', in: 'Income only', out: 'Expenses only' };

interface Pen {
  items: PdfItem[];
  y: number;
}

type TextOptions = Partial<{ size: number; bold: boolean; gray: number; color: RGB; y: number; max: number }>;

const text = (pen: Pen, value: string, x: number, options: TextOptions = {}) => {
  const size = options.size ?? 9;
  const bold = options.bold ?? false;
  const shown = options.max ? fitText(value, size, options.max, bold) : value;
  pen.items.push({ type: 'text', x, y: options.y ?? pen.y, value: shown, size, bold, gray: options.gray ?? 0.12, ...(options.color ? { color: options.color } : {}) });
};
const textRight = (pen: Pen, value: string, right: number, options: TextOptions = {}) =>
  text(pen, value, right - textWidth(value, options.size ?? 9, options.bold ?? false), options);
const line = (pen: Pen, y: number, gray = 0.82, x1 = MARGIN, x2 = RIGHT) =>
  pen.items.push({ type: 'line', x1, y1: y, x2, y2: y, gray, width: 0.6 });

const COLUMNS = {
  date: { x: MARGIN, width: 56 },
  what: { x: MARGIN + 56, width: 160 },
  category: { x: MARGIN + 216, width: 118 },
  method: { x: MARGIN + 334, width: 66 },
  /** Amounts end at these. */
  inRight: RIGHT - 58,
  outRight: RIGHT,
};

function header(pen: Pen, report: LedgerReport) {
  pen.items.push({ type: 'rect', x: 0, y: pdfPage.height - 78, width: pdfPage.width, height: 78, color: NAVY });
  text(pen, 'V6M RESORT', MARGIN, { y: pdfPage.height - 40, size: 20, bold: true, gray: 1 });
  text(pen, 'Purok 3, Brgy. Munting Pulo, Lipa City  |  (043) 756 4547  |  0927-823-3678', MARGIN, { y: pdfPage.height - 58, size: 8.5, gray: 0.85 });
  textRight(pen, 'LEDGER REPORT', RIGHT, { y: pdfPage.height - 40, size: 11, bold: true, gray: 1 });
  textRight(pen, VIEW_WORDS[report.view], RIGHT, { y: pdfPage.height - 58, size: 8.5, gray: 0.85 });
  pen.y = pdfPage.height - 106;
}

function tableHead(pen: Pen, view: LedgerView) {
  pen.items.push({ type: 'rect', x: MARGIN, y: pen.y - 5, width: RIGHT - MARGIN, height: 16, color: [0.94, 0.92, 0.87] });
  const head = { size: 7.5, bold: true, gray: 0.3 };
  text(pen, 'DATE', COLUMNS.date.x + 3, head);
  text(pen, 'WHAT', COLUMNS.what.x + 3, head);
  text(pen, 'CATEGORY', COLUMNS.category.x + 3, head);
  text(pen, 'METHOD', COLUMNS.method.x + 3, head);
  if (view !== 'out') textRight(pen, 'IN', COLUMNS.inRight - 3, head);
  if (view !== 'in') textRight(pen, 'OUT', COLUMNS.outRight - 3, head);
  pen.y -= 20;
}

function entryRow(pen: Pen, entry: LedgerEntry) {
  text(pen, formatDate(entry.date, 'monthDay'), COLUMNS.date.x + 3, { gray: 0.35 });
  text(pen, entry.what, COLUMNS.what.x + 3, { max: COLUMNS.what.width - 6 });
  if (entry.sub) text(pen, entry.sub, COLUMNS.what.x + 3, { y: pen.y - 9, size: 7, gray: 0.5, max: COLUMNS.what.width - 6 });
  text(pen, entry.category, COLUMNS.category.x + 3, { size: 8.5, gray: 0.35, max: COLUMNS.category.width - 6 });
  text(pen, METHOD_LABELS[entry.method], COLUMNS.method.x + 3, { size: 8.5, gray: 0.35, max: COLUMNS.method.width - 6 });
  if (entry.amountIn) textRight(pen, peso(entry.amountIn), COLUMNS.inRight - 3, { color: GREEN });
  if (entry.amountOut) textRight(pen, peso(entry.amountOut), COLUMNS.outRight - 3);
  line(pen, pen.y - 13);
  pen.y -= ROW;
}

/** Income, expenses and what is left, in boxes across the page; one box for one side only. */
function totalsStrip(pen: Pen, report: LedgerReport) {
  const { income, spend, profit } = ledgerTotals(report.entries);
  const boxes: [string, string, RGB | undefined][] = report.view === 'in'
    ? [['INCOME', peso(income), GREEN]]
    : report.view === 'out'
      ? [['EXPENSES', peso(spend), undefined]]
      : [['INCOME', peso(income), GREEN], ['EXPENSES', peso(spend), undefined], [profit < 0 ? 'LOSS' : 'PROFIT', peso(Math.abs(profit)), profit < 0 ? RED : GREEN]];
  const gap = 10;
  const width = (RIGHT - MARGIN - gap * 2) / 3;
  boxes.forEach(([label, value, color], index) => {
    const x = MARGIN + index * (width + gap);
    pen.items.push({ type: 'rect', x, y: pen.y - 30, width, height: 44, color: [0.98, 0.96, 0.92] });
    text(pen, label, x + 10, { size: 7.5, bold: true, gray: 0.4 });
    text(pen, value, x + 10, { y: pen.y - 20, size: 14, bold: true, ...(color ? { color } : {}) });
  });
  pen.y -= 56;
}

export function ledgerPdfBlob(report: LedgerReport): Blob {
  const pages: Pen[] = [];
  const newPage = (): Pen => {
    const pen: Pen = { items: [], y: 0 };
    header(pen, report);
    pages.push(pen);
    return pen;
  };

  let pen = newPage();
  text(pen, report.label.toUpperCase(), MARGIN, { size: 12.5, bold: true, color: ORANGE, max: RIGHT - MARGIN });
  pen.y -= 14;
  text(pen, `${report.entries.length} ${report.entries.length === 1 ? 'entry' : 'entries'}  ·  cash in on the day received, cash out on the day spent`, MARGIN, { size: 8.5, gray: 0.45 });
  pen.y -= 24;
  totalsStrip(pen, report);
  tableHead(pen, report.view);

  if (!report.entries.length) {
    text(pen, `Nothing recorded for ${report.label}.`, MARGIN + 3, { gray: 0.45 });
    pen.y -= ROW;
  }
  report.entries.forEach((entry) => {
    if (pen.y - ROW < FLOOR) {
      pen = newPage();
      text(pen, `${report.label.toUpperCase()} (CONTINUED)`, MARGIN, { size: 10, bold: true, color: ORANGE, max: RIGHT - MARGIN });
      pen.y -= 22;
      tableHead(pen, report.view);
    }
    entryRow(pen, entry);
  });

  // The totals under the last row, on a new page if the last one is full.
  if (pen.y - 30 < FLOOR) {
    pen = newPage();
    tableHead(pen, report.view);
  }
  const { income, spend } = ledgerTotals(report.entries);
  line(pen, pen.y + 10, 0.4);
  text(pen, `TOTAL FOR ${report.label.toUpperCase()}`, MARGIN + 3, { bold: true, max: COLUMNS.method.x + COLUMNS.method.width - MARGIN - 6 });
  if (report.view !== 'out') textRight(pen, peso(income), COLUMNS.inRight - 3, { bold: true, color: GREEN });
  if (report.view !== 'in') textRight(pen, peso(spend), COLUMNS.outRight - 3, { bold: true });

  pages.forEach((page, index) => {
    text(page, `Generated ${report.generatedAt} by ${report.generatedBy}  ·  V6M Desk  ·  mock document`, MARGIN, { y: MARGIN - 8, size: 7, gray: 0.55, max: RIGHT - MARGIN - 80 });
    textRight(page, `page ${index + 1} of ${pages.length}`, RIGHT, { y: MARGIN - 8, size: 7, gray: 0.55 });
  });
  return createPdf(pages.map((page) => page.items));
}

export function downloadLedgerPdf(report: LedgerReport, filename: string): void {
  downloadBlob(ledgerPdfBlob(report), filename);
}
