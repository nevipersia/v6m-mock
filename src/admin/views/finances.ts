// Finances: the month's books. Every payment that came in and every expense
// that went out, as one ledger table; how the weeks went, in one chart; where
// the money went, as a ranked table with bars; and what guests still owe for
// the month. Cash in, cash out — a booking still owed for shows under Owed,
// never as income. Only accounts that track expenses can open it.
//
// Download report opens a pop-up in the middle of the screen: pick a month or
// a date range (and which side of the ledger), see a preview of the report,
// then download it as a PDF or cancel.

import { flag, html, type SafeHTML } from '../../core/dom.js';
import { demoNow } from '../../core/actions.js';
import { formatDate, formatDateTime, parseDate, peso, pesoShort, plural, toISODate } from '../../core/format.js';
import { CATEGORY_LABELS, financeRange, ledgerEntries, ledgerTotals, type FinancePoint, type LedgerEntry, type LedgerView } from '../../core/finance.js';
import { rankSlices, sumOf, within, type Bucket, type Slice } from '../../core/period.js';
import { METHOD_LABELS, isActive } from '../../core/rules.js';
import type { Booking, ExpenseCategory, ISODate, State } from '../../core/types.js';
import type { DeskContext, HandlerMap } from '../types.js';
import { paymentPill } from '../components/badges.js';
import { openDatePicker } from '../components/date-picker.js';
import { icon } from '../components/icons.js';
import { VIEW_WORDS, downloadLedgerPdf, type LedgerReport } from '../components/ledger-pdf.js';
import { emptyState, pageHead } from '../layout.js';

/** The month on screen, by its 1st; null follows the demo date. */
let month: ISODate | null = null;
/** Which side of the ledger is showing. */
let view: LedgerView = 'all';
/** A week of the chart the reader pinned, by its first day: the tables narrow to it. */
let pinned: string | null = null;
/** How many rows a table shows on the page; the totals always count every row. */
const LEDGER_SHOWN = 10;
const OWED_SHOWN = 5;

type FullTable = 'ledger' | 'owed';
/** The table opened in full in a pop-up by Show all, if any. */
let full: FullTable | null = null;

/** The last row of a capped table: how many more there are, and the button that shows them all. */
function showAll(table: FullTable, total: number, cap: number, columns: number): SafeHTML | '' {
  if (total <= cap) return '';
  return html`
    <tr class="fin-more">
      <td colspan="${columns}">
        <button class="btn btn--quiet btn--sm" type="button" data-action="show-all" data-table="${table}" aria-haspopup="dialog">
          Show all ${total} · ${total - cap} more
        </button>
      </td>
    </tr>`;
}

/**
 * A row's way in. In the pop-up it goes through full-open, which closes the
 * pop-up first: the booking or expense panel would otherwise open behind it.
 */
const rowAction = (action: string, inPopup: boolean): string => (inPopup ? 'full-open' : action);

/** Which way the last step went, for the slide. */
let motion: 'back' | 'on' | 'swap' = 'swap';

const firstOf = (day: ISODate): ISODate => `${day.slice(0, 8)}01`;
const lastOf = (first: ISODate): ISODate => {
  const date = parseDate(first);
  return toISODate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
};
const monthLabel = (first: ISODate): string => parseDate(first).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

// ---------- The chart ----------

interface TrendSeries<P> {
  key: string;
  legend: string;
  word: string;
  value: (point: P) => number;
}

const MONEY_SERIES: TrendSeries<FinancePoint>[] = [
  { key: 'in', legend: 'Income', word: 'income', value: (point) => point.income },
  { key: 'out', legend: 'Expenses', word: 'spent', value: (point) => point.spend },
];

function trendLegend<P>(series: TrendSeries<P>[]): SafeHTML {
  return html`
    <p class="chart__legend small muted">
      ${series.map((one) => html`
        <span class="chart__legend-item"><span class="chart__key chart__key--${one.key}"></span>${one.legend}</span>`)}
    </p>`;
}

/**
 * Income beside expenses for each week (or day) of the month. Every pair is a
 * button: hovering reads it out under the chart, clicking narrows the tables
 * to that week, clicking again lets go.
 */
function trendChart(points: FinancePoint[], weekly: boolean): SafeHTML {
  const peak = Math.max(1, ...points.flatMap((point) => MONEY_SERIES.map((one) => one.value(point))));
  const height = (value: number) => `${Math.max(value > 0 ? 2 : 0, Math.round((value / peak) * 100))}%`;
  const readout = (point: FinancePoint) => `${point.title} · ${MONEY_SERIES.map((one) => `${peso(one.value(point))} ${one.word}`).join(' · ')}`;
  const focus = points.find((point) => point.from === pinned);
  const resting = focus ? readout(focus) : `Tallest bar ${pesoShort(peak)}${weekly ? ' · one pair per week' : ' · one pair per day'}`;

  return html`
    <figure class="trend">
      <p class="sr-only">Money received and money spent, ${weekly ? 'week' : 'day'} by ${weekly ? 'week' : 'day'}. Each pair reads out below the chart.</p>
      <div class="chart chart--short">
        ${points.map((point) => html`
          <button class="chart__col ${point.isNow ? 'is-now' : ''} ${point.from === pinned ? 'is-pinned' : ''}"
            type="button" data-action="pin-week" data-hover="chart-point" data-point="${point.from}"
            data-readout="${readout(point)}" aria-pressed="${flag(point.from === pinned)}" aria-label="${readout(point)}">
            <span class="chart__bars">
              ${MONEY_SERIES.map((one) => html`
                <span class="chart__bar chart__bar--${one.key}" style="height:${height(one.value(point))}"></span>`)}
            </span>
            <span class="chart__label">${point.label}</span>
          </button>`)}
      </div>
      <figcaption class="chart__readout small ${focus ? '' : 'muted'}" data-slot="chart-readout"
        data-resting="${resting}" aria-live="polite">${resting}</figcaption>
    </figure>`;
}

// ---------- The ledger ----------

/** What clicking a ledger line opens. */
const openAction = (row: LedgerEntry): string => (row.kind === 'payment' ? 'open-booking' : 'edit-expense');

/** The ledger's rows as the reader filtered them (All, Income or Expenses). */
const ledgerShown = (rows: LedgerEntry[]): LedgerEntry[] =>
  rows.filter((row) => (view === 'in' ? row.amountIn : view === 'out' ? row.amountOut : true));

function ledgerTable(state: State, shown: LedgerEntry[], label: string, inPopup: boolean): SafeHTML {
  const totalIn = sumOf(shown.map((row) => row.amountIn));
  const totalOut = sumOf(shown.map((row) => row.amountOut));
  const rows = inPopup ? shown : shown.slice(0, LEDGER_SHOWN);
  return html`
    <table class="data-table fin-table">
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">What</th>
          <th scope="col">Category</th>
          <th scope="col">Method</th>
          <th scope="col" class="num">In</th>
          <th scope="col" class="num">Out</th>
          <th scope="col" class="data-table__go"><span class="sr-only">Open</span></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => {
          const action = rowAction(openAction(row), inPopup);
          return html`
          <tr class="data-table__row ${row.date === state.meta.asOf ? 'is-today' : ''}" data-action="${action}" data-open="${openAction(row)}" data-id="${row.id}">
            <td>${row.date === state.meta.asOf ? html`<span class="data-table__today">Today</span>` : formatDate(row.date, 'monthDay')}</td>
            <td>
              <button class="link-button" type="button" data-action="${action}" data-open="${openAction(row)}" data-id="${row.id}">${row.what}</button>
              ${row.sub ? html`<span class="data-table__sub ${row.kind === 'payment' ? 'mono' : ''}">${row.sub}</span>` : ''}
            </td>
            <td class="muted">${row.category}</td>
            <td class="muted">${METHOD_LABELS[row.method]}</td>
            <td class="num fin-in">${row.amountIn ? peso(row.amountIn) : ''}</td>
            <td class="num fin-out">${row.amountOut ? peso(row.amountOut) : ''}</td>
            <td class="data-table__go" aria-hidden="true">${icon('chevronRight')}</td>
          </tr>`;
        })}
        ${inPopup ? '' : showAll('ledger', shown.length, LEDGER_SHOWN, 7)}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colspan="4">Total for ${label}</th>
          <td class="num fin-in">${view === 'out' ? '' : peso(totalIn)}</td>
          <td class="num fin-out">${view === 'in' ? '' : peso(totalOut)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>`;
}

function ledger(state: State, rows: LedgerEntry[], label: string): SafeHTML {
  const shown = ledgerShown(rows);
  const views: { id: typeof view; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'in', label: 'Income' },
    { id: 'out', label: 'Expenses' },
  ];

  return html`
    <section class="panel panel--flush fin-ledger" data-part="Ledger">
      <header class="fin-ledger__head">
        <h2 class="panel__title">Ledger <span class="panel__count">${shown.length}</span></h2>
        <div class="segmented" role="group" aria-label="Show in the ledger">
          ${views.map((option) => html`
            <button class="segmented__option ${view === option.id ? 'is-active' : ''}" type="button"
              data-action="ledger-view" data-view="${option.id}" aria-pressed="${flag(view === option.id)}">${option.label}</button>`)}
        </div>
      </header>
      ${shown.length
        ? html`<div class="table-scroll">${ledgerTable(state, shown, label, false)}</div>`
        : html`<div class="fin-empty">${emptyState('Nothing recorded', `No ${view === 'in' ? 'income' : view === 'out' ? 'expenses' : 'money in or out'} for ${label}.`)}</div>`}
    </section>`;
}

// ---------- Where it went, and what is owed ----------

function whereItWent(slices: Slice[], label: string): SafeHTML {
  const top = slices[0]?.amount ?? 0;
  return html`
    <section class="panel panel--flush fin-side" data-part="Where the money went">
      <header class="fin-ledger__head"><h2 class="panel__title">Where the money went</h2></header>
      ${slices.length ? html`
        <table class="data-table fin-table fin-table--compact">
          <thead>
            <tr><th scope="col">Category</th><th scope="col"><span class="sr-only">Share</span></th><th scope="col" class="num">Spent</th></tr>
          </thead>
          <tbody>
            ${slices.map((slice) => html`
              <tr>
                <td>${slice.label}<span class="data-table__sub">${plural(slice.count, 'expense')} · ${Math.round(slice.share * 100)}%</span></td>
                <td class="fin-bar-cell"><span class="fin-bar"><span style="width:${top ? Math.round((slice.amount / top) * 100) : 0}%"></span></span></td>
                <td class="num">${peso(slice.amount)}</td>
              </tr>`)}
          </tbody>
        </table>` : html`<div class="fin-empty">${emptyState('Nothing spent', `No expenses for ${label}.`)}</div>`}
    </section>`;
}

const owedBookings = (state: State, from: ISODate, to: ISODate) => state.bookings
  .filter((b) => within(b.date, from, to) && isActive(b) && b.balance > 0)
  .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

function owedRows(state: State, owing: Booking[], inPopup: boolean): SafeHTML {
  const total = sumOf(owing.map((b) => b.balance));
  const rows = inPopup ? owing : owing.slice(0, OWED_SHOWN);
  const action = rowAction('open-booking', inPopup);
  return html`
    <table class="data-table fin-table fin-table--compact">
      <thead>
        <tr><th scope="col">Guest</th><th scope="col">Date</th><th scope="col" class="num">Owed</th></tr>
      </thead>
      <tbody>
        ${rows.map((b) => html`
          <tr class="data-table__row ${b.date === state.meta.asOf ? 'is-today' : ''}" data-action="${action}" data-open="open-booking" data-id="${b.id}">
            <td>
              <button class="link-button" type="button" data-action="${action}" data-open="open-booking" data-id="${b.id}">${b.guestName}</button>
              <span class="data-table__sub">${paymentPill(b)}</span>
            </td>
            <td>${b.date === state.meta.asOf ? html`<span class="data-table__today">Today</span>` : formatDate(b.date, 'monthDay')}</td>
            <td class="num fin-owed">${peso(b.balance)}</td>
          </tr>`)}
        ${inPopup ? '' : showAll('owed', owing.length, OWED_SHOWN, 3)}
      </tbody>
      <tfoot>
        <tr><th scope="row" colspan="2">Total owed</th><td class="num fin-owed">${peso(total)}</td></tr>
      </tfoot>
    </table>`;
}

function owedTable(state: State, from: ISODate, to: ISODate, label: string): SafeHTML {
  const owing = owedBookings(state, from, to);
  return html`
    <section class="panel panel--flush fin-side" data-part="Still owed by guests">
      <header class="fin-ledger__head">
        <h2 class="panel__title">Still owed by guests <span class="panel__count">${owing.length}</span></h2>
      </header>
      ${owing.length
        ? owedRows(state, owing, false)
        : html`<div class="fin-empty">${emptyState('Nothing owed', `Every booking in ${label} is paid.`)}</div>`}
    </section>`;
}

/** Show all: the whole table in a pop-up in the middle, like the report's. */
function fullModal(state: State, table: FullTable, rows: LedgerEntry[], from: ISODate, to: ISODate, label: string): SafeHTML {
  const ledgerRows = ledgerShown(rows);
  const owing = owedBookings(state, from, to);
  const VIEW_NAMES = { all: '', in: ' · income', out: ' · expenses' } as const;
  const title = table === 'ledger' ? 'Ledger' : 'Still owed by guests';
  const count = table === 'ledger' ? ledgerRows.length : owing.length;
  return html`
    <dialog class="report-modal table-modal" data-modal data-cancel="full-close" aria-labelledby="full-title">
      <header class="report-modal__head">
        <div>
          <p class="report-modal__step">${label}${table === 'ledger' ? VIEW_NAMES[view] : ''} · ${plural(count, table === 'ledger' ? 'entry' : 'booking', table === 'ledger' ? 'entries' : 'bookings')}</p>
          <h2 class="picker__title" id="full-title">${title}</h2>
        </div>
        <button class="picker__icon" type="button" data-action="full-close" data-focus-key="full-x" aria-label="Close">${icon('x')}</button>
      </header>
      <div class="table-modal__main">
        ${table === 'ledger' ? ledgerTable(state, ledgerRows, label, true) : owedRows(state, owing, true)}
      </div>
      <footer class="report-modal__foot">
        <span class="report-modal__spacer"></span>
        <button class="btn btn--secondary" type="button" data-action="full-close" data-focus-key="full-close">Close</button>
      </footer>
    </dialog>`;
}

// ---------- Download report ----------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface ReportDraft {
  step: 'pick' | 'preview';
  mode: 'month' | 'range';
  /** The year the month grid is showing. */
  year: number;
  /** The month picked, by its 1st. */
  month: ISODate;
  from: ISODate | '';
  to: ISODate | '';
  view: LedgerView;
  error: string;
}

/** The pop-up while it is open; null when closed. */
let report: ReportDraft | null = null;

const VIEW_OPTIONS: { id: LedgerView; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in', label: 'Income' },
  { id: 'out', label: 'Expenses' },
];

/** "Oct 1 – Oct 6, 2026", or with both years when they differ. */
function rangeLabel(from: ISODate, to: ISODate): string {
  if (from === to) return formatDate(from, 'full');
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return sameYear
    ? `${formatDate(from, 'monthDay')} – ${formatDate(to, 'monthDay')}, ${from.slice(0, 4)}`
    : `${formatDate(from, 'full')} – ${formatDate(to, 'full')}`;
}

/** The days the report covers and how it is named, or a reason it can't be made yet. */
function reportPeriod(draft: ReportDraft): { from: ISODate; to: ISODate; label: string } | { problem: string } {
  if (draft.mode === 'month') return { from: draft.month, to: lastOf(draft.month), label: monthLabel(draft.month) };
  if (!draft.from || !draft.to) return { problem: 'Pick both the first and the last day.' };
  if (draft.from > draft.to) return { problem: 'The first day has to come before the last day.' };
  return { from: draft.from, to: draft.to, label: rangeLabel(draft.from, draft.to) };
}

function buildReport(ctx: DeskContext, draft: ReportDraft): LedgerReport | null {
  const period = reportPeriod(draft);
  if ('problem' in period) return null;
  return {
    label: period.label,
    view: draft.view,
    entries: ledgerEntries(ctx.state, period.from, period.to, draft.view),
    generatedBy: ctx.staff.name,
    generatedAt: formatDateTime(demoNow(ctx.state)),
  };
}

const segmented = (label: string, action: string, key: string, options: { id: string; label: string }[], current: string): SafeHTML => html`
  <div class="segmented" role="group" aria-label="${label}">
    ${options.map((option) => html`
      <button class="segmented__option ${current === option.id ? 'is-active' : ''}" type="button" data-action="${action}"
        data-value="${option.id}" data-focus-key="${key}-${option.id}" aria-pressed="${flag(current === option.id)}">${option.label}</button>`)}
  </div>`;

function pickStep(ctx: DeskContext, draft: ReportDraft): SafeHTML {
  const picked = parseDate(draft.month);
  const found = buildReport(ctx, draft);
  return html`
    <div class="report-modal__section">
      <span class="field__label">Period</span>
      ${segmented('Report on', 'report-mode', 'mode', [{ id: 'month', label: 'Month' }, { id: 'range', label: 'Date range' }], draft.mode)}
    </div>

    ${draft.mode === 'month' ? html`
      <div class="report-modal__section report-modal__months">
        <div class="picker__year">
          <button class="picker__icon" type="button" data-action="report-year" data-step="-1" data-focus-key="year-back" aria-label="Previous year">${icon('chevronLeft')}</button>
          <span class="picker__year-label" aria-live="polite">${draft.year}</span>
          <button class="picker__icon" type="button" data-action="report-year" data-step="1" data-focus-key="year-on" aria-label="Next year">${icon('chevronRight')}</button>
        </div>
        <div class="picker__months" role="group" aria-label="Months of ${draft.year}">
          ${MONTHS.map((name, index) => {
            const isPicked = picked.getFullYear() === draft.year && picked.getMonth() === index;
            return html`
              <button class="picker__month ${isPicked ? 'is-picked' : ''}" type="button" data-action="report-month" data-month="${index}"
                data-focus-key="month-${index}" aria-pressed="${flag(isPicked)}"
                aria-label="${new Date(draft.year, index, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}">${name}</button>`;
          })}
        </div>
      </div>` : html`
      <div class="form-grid report-modal__section">
        <label class="field">
          <span class="field__label">First day</span>
          <input class="input" name="reportFrom" data-input="report" type="date" value="${draft.from}" max="${draft.to || ctx.state.meta.asOf}">
        </label>
        <label class="field">
          <span class="field__label">Last day</span>
          <input class="input" name="reportTo" data-input="report" type="date" value="${draft.to}" min="${draft.from}">
        </label>
      </div>`}

    <div class="report-modal__section">
      <span class="field__label">Show</span>
      ${segmented('Show in the report', 'report-view', 'view', VIEW_OPTIONS, draft.view)}
    </div>

    <p class="small muted">
      ${found ? `${found.label} · ${plural(found.entries.length, 'entry', 'entries')}` : 'Pick the days to report on.'}
    </p>`;
}

/** The report as it will print: a paper-like copy of the PDF's page. */
function previewStep(found: LedgerReport): SafeHTML {
  const { income, spend, profit } = ledgerTotals(found.entries);
  const boxes: [string, number, string][] = found.view === 'in'
    ? [['Income', income, 'in']]
    : found.view === 'out'
      ? [['Expenses', spend, 'out']]
      : [['Income', income, 'in'], ['Expenses', spend, 'out'], [profit < 0 ? 'Loss' : 'Profit', Math.abs(profit), profit < 0 ? 'owed' : '']];
  return html`
    <p class="small muted report-modal__line">
      ${found.label} · ${VIEW_WORDS[found.view]} · ${plural(found.entries.length, 'entry', 'entries')}
      <button class="link-button" type="button" data-action="report-back" data-focus-key="change">Change</button>
    </p>
    <div class="report-paper" role="document" aria-label="Preview of the ledger report">
      <div class="report-paper__band">
        <div>
          <strong class="report-paper__brand">V6M RESORT</strong>
          <span class="report-paper__address">Purok 3, Brgy. Munting Pulo, Lipa City</span>
        </div>
        <div class="report-paper__kind">
          <strong>LEDGER REPORT</strong>
          <span>${VIEW_WORDS[found.view]}</span>
        </div>
      </div>
      <div class="report-paper__page">
        <p class="report-paper__title">${found.label.toUpperCase()}</p>
        <div class="report-paper__totals">
          ${boxes.map(([label, amount, tone]) => html`
            <div class="report-paper__box">
              <span>${label.toUpperCase()}</span>
              <strong class="${tone ? `fin-${tone}` : ''}">${peso(amount)}</strong>
            </div>`)}
        </div>
        ${found.entries.length ? html`
          <div class="table-scroll">
            <table class="report-paper__table">
              <thead>
                <tr>
                  <th scope="col">Date</th><th scope="col">What</th><th scope="col">Category</th><th scope="col">Method</th>
                  ${found.view === 'out' ? '' : html`<th scope="col" class="num">In</th>`}
                  ${found.view === 'in' ? '' : html`<th scope="col" class="num">Out</th>`}
                </tr>
              </thead>
              <tbody>
                ${found.entries.map((entry) => html`
                  <tr>
                    <td class="muted">${formatDate(entry.date, 'monthDay')}</td>
                    <td>${entry.what}${entry.sub ? html`<span class="report-paper__sub">${entry.sub}</span>` : ''}</td>
                    <td class="muted">${entry.category}</td>
                    <td class="muted">${METHOD_LABELS[entry.method]}</td>
                    ${found.view === 'out' ? '' : html`<td class="num fin-in">${entry.amountIn ? peso(entry.amountIn) : ''}</td>`}
                    ${found.view === 'in' ? '' : html`<td class="num fin-out">${entry.amountOut ? peso(entry.amountOut) : ''}</td>`}
                  </tr>`)}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colspan="4">Total for ${found.label}</th>
                  ${found.view === 'out' ? '' : html`<td class="num fin-in">${peso(income)}</td>`}
                  ${found.view === 'in' ? '' : html`<td class="num fin-out">${peso(spend)}</td>`}
                </tr>
              </tfoot>
            </table>
          </div>` : html`<p class="report-paper__empty">Nothing recorded for ${found.label}.</p>`}
        <p class="report-paper__foot">Generated ${found.generatedAt} by ${found.generatedBy} · V6M Desk · mock document</p>
      </div>
    </div>`;
}

function reportModal(ctx: DeskContext, draft: ReportDraft): SafeHTML {
  const found = draft.step === 'preview' ? buildReport(ctx, draft) : null;
  const previewing = !!found;
  return html`
    <dialog class="report-modal" data-modal data-cancel="report-cancel" aria-labelledby="report-title">
      <header class="report-modal__head">
        <div>
          <p class="report-modal__step">Step ${previewing ? 2 : 1} of 2 · ${previewing ? 'Preview' : 'Choose the period'}</p>
          <h2 class="picker__title" id="report-title">Ledger report</h2>
        </div>
        <button class="picker__icon" type="button" data-action="report-cancel" data-focus-key="report-close" aria-label="Close">${icon('x')}</button>
      </header>

      <div class="report-modal__main">
        ${found ? previewStep(found) : pickStep(ctx, draft)}
        <p class="form-error" role="alert">${draft.error}</p>
      </div>

      <footer class="report-modal__foot">
        ${previewing ? html`
          <button class="btn btn--secondary" type="button" data-action="report-back" data-focus-key="back">${icon('chevronLeft')} Back</button>` : ''}
        <span class="report-modal__spacer"></span>
        <button class="btn btn--quiet" type="button" data-action="report-cancel" data-focus-key="cancel">Cancel</button>
        ${previewing
          ? html`<button class="btn btn--primary" type="button" data-action="report-download" data-focus-key="download">${icon('download')} Download PDF</button>`
          : html`<button class="btn btn--primary" type="button" data-action="report-preview" data-focus-key="preview">Preview</button>`}
      </footer>
    </dialog>`;
}

// ---------- The page ----------

export function render(ctx: DeskContext): SafeHTML {
  const { state } = ctx;
  const first = month ?? firstOf(state.meta.asOf);
  const last = lastOf(first);
  const trend = financeRange(state, first, last);
  const week = trend.points.find((point) => point.from === pinned) as Bucket | undefined;
  // A pinned week narrows the totals and the tables; the chart keeps the month.
  const from = week?.from ?? first;
  const to = week?.to ?? last;
  const label = week ? `${formatDate(week.from, 'monthDay')} – ${formatDate(week.to, 'monthDay')}` : monthLabel(first);
  const rows = ledgerEntries(state, from, to);
  const income = sumOf(rows.map((row) => row.amountIn));
  const spend = sumOf(rows.map((row) => row.amountOut));
  const profit = income - spend;
  const categories = rankSlices(Object.entries(CATEGORY_LABELS).map(([key, text]) => {
    const spent = state.expenses.filter((expense) => expense.category === (key as ExpenseCategory) && within(expense.date, from, to));
    return { key, label: text, amount: sumOf(spent.map((expense) => expense.amount)), count: spent.length, share: 0 };
  }));

  return html`
    ${pageHead({
      title: 'Finances',
      actions: html`
        <button class="btn btn--secondary" type="button" data-action="report-open" aria-haspopup="dialog">${icon('download')} Download report</button>
        <button class="btn btn--primary" type="button" data-action="add-expense">${icon('plus')} Record an expense</button>`,
    })}

    <div class="calendar-bar">
      <div class="period">
        <button class="btn btn--secondary btn--icon" type="button" data-action="fin-step" data-step="-1" aria-label="Previous month">${icon('chevronLeft')}</button>
        <button class="period__label" type="button" data-action="fin-pick" aria-haspopup="dialog" title="Go to a month">
          <span>${monthLabel(first)}</span>
          ${icon('chevronDown')}
        </button>
        <button class="btn btn--secondary btn--icon" type="button" data-action="fin-step" data-step="1" aria-label="Next month">${icon('chevronRight')}</button>
      </div>
      ${week ? html`
        <button class="btn btn--quiet btn--sm" type="button" data-action="pin-week" data-point="${week.from}">
          ${icon('x')} Showing ${label} only
        </button>` : ''}
    </div>

    <div class="fin-body" data-enter="finances|${first}:${pinned ?? ''}" data-motion="${motion}">
      <div class="fin-totals" data-part="Totals">
        <div class="fin-total">
          <span class="fin-total__label"><span class="chart__key chart__key--in"></span>Income</span>
          <span class="fin-total__value">${peso(income)}</span>
        </div>
        <div class="fin-total">
          <span class="fin-total__label"><span class="chart__key chart__key--out"></span>Expenses</span>
          <span class="fin-total__value">${peso(spend)}</span>
        </div>
        <div class="fin-total ${profit < 0 ? 'fin-total--loss' : ''}">
          <span class="fin-total__label">${profit < 0 ? 'Loss' : 'Profit'}</span>
          <span class="fin-total__value">${peso(Math.abs(profit))}
            <small>${income ? `${Math.round((profit / income) * 100)}% of income` : 'nothing came in'}</small>
          </span>
        </div>
      </div>

      <section class="panel fin-chart" data-part="In and out">
        <header class="panel__head">
          <h2 class="panel__title">In and out, ${trend.weekly ? 'week by week' : 'day by day'}</h2>
          ${trendLegend(MONEY_SERIES)}
        </header>
        ${trendChart(trend.points, trend.weekly)}
      </section>

      ${ledger(state, rows, label)}

      <div class="fin-sides">
        ${whereItWent(categories, label)}
        ${owedTable(state, from, to, label)}
      </div>
    </div>

    ${report ? reportModal(ctx, report) : ''}
    ${full ? fullModal(state, full, rows, from, to, label) : ''}`;
}

export const inputs: HandlerMap = {
  // The range's two date fields.
  report: ({ el, ctx }) => {
    if (!report) return;
    const field = el as HTMLInputElement;
    if (field.name === 'reportFrom') report.from = field.value;
    if (field.name === 'reportTo') report.to = field.value;
    report.error = '';
    ctx.redraw();
  },
};

export const hovers: HandlerMap = {
  // Arriving shows that pair's figures; leaving puts the resting line back.
  'chart-point': ({ el, event }) => {
    const readout = el.closest('.trend')?.querySelector<HTMLElement>('[data-slot="chart-readout"]');
    if (!readout) return;
    const arriving = event.type === 'mouseover' || event.type === 'focusin';
    readout.textContent = arriving ? el.dataset.readout ?? '' : readout.dataset.resting ?? '';
    readout.classList.toggle('muted', !arriving && !el.closest('.chart')?.querySelector('.is-pinned'));
  },
};

export const actions: HandlerMap = {
  'fin-step': ({ el, ctx }) => {
    const step = Number(el.dataset.step) || 0;
    const date = parseDate(month ?? firstOf(ctx.state.meta.asOf));
    month = toISODate(new Date(date.getFullYear(), date.getMonth() + step, 1));
    pinned = null;
    motion = step < 0 ? 'back' : 'on';
    ctx.redraw();
  },

  'fin-pick': ({ el, ctx }) => {
    openDatePicker({
      anchor: el,
      mode: 'month',
      value: month ?? firstOf(ctx.state.meta.asOf),
      today: ctx.state.meta.asOf,
      onPick: (value) => {
        if (!value) return;
        month = firstOf(value);
        pinned = null;
        motion = 'swap';
        ctx.redraw();
      },
    });
  },

  // Clicking a week narrows everything to it; clicking it again lets go.
  'pin-week': ({ el, ctx }) => {
    pinned = pinned === el.dataset.point ? null : el.dataset.point ?? null;
    motion = 'swap';
    ctx.redraw();
  },

  'show-all': ({ el, ctx }) => {
    full = el.dataset.table === 'owed' ? 'owed' : 'ledger';
    ctx.redraw();
  },

  'full-close': ({ ctx }) => {
    full = null;
    ctx.redraw();
  },

  // A row in the pop-up: close it, then open the booking or expense.
  'full-open': ({ el, ctx }) => {
    full = null;
    ctx.redraw();
    const id = el.dataset.id ?? '';
    if (el.dataset.open === 'edit-expense') {
      const expense = ctx.state.expenses.find((item) => item.id === id);
      if (expense) ctx.newExpense(expense);
    } else {
      ctx.openBooking(id);
    }
  },

  'ledger-view': ({ el, ctx }) => {
    const next = el.dataset.view;
    view = next === 'in' || next === 'out' ? next : 'all';
    ctx.redraw();
  },

  'report-open': ({ ctx }) => {
    // Starts from what the page shows: its month, its side of the ledger.
    const first = month ?? firstOf(ctx.state.meta.asOf);
    const today = ctx.state.meta.asOf;
    const last = lastOf(first);
    report = {
      step: 'pick', mode: 'month', year: parseDate(first).getFullYear(), month: first,
      from: first, to: last < today ? last : today, view, error: '',
    };
    ctx.redraw();
  },

  'report-cancel': ({ ctx }) => {
    report = null;
    ctx.redraw();
  },

  'report-mode': ({ el, ctx }) => {
    if (!report) return;
    report.mode = el.dataset.value === 'range' ? 'range' : 'month';
    report.error = '';
    ctx.redraw();
  },

  'report-year': ({ el, ctx }) => {
    if (!report) return;
    report.year += Number(el.dataset.step) || 0;
    ctx.redraw();
  },

  'report-month': ({ el, ctx }) => {
    if (!report) return;
    report.month = toISODate(new Date(report.year, Number(el.dataset.month) || 0, 1));
    ctx.redraw();
  },

  'report-view': ({ el, ctx }) => {
    if (!report) return;
    const next = el.dataset.value;
    report.view = next === 'in' || next === 'out' ? next : 'all';
    ctx.redraw();
  },

  'report-preview': ({ ctx }) => {
    if (!report) return;
    const period = reportPeriod(report);
    if ('problem' in period) {
      report.error = period.problem;
    } else {
      report.step = 'preview';
      report.error = '';
    }
    ctx.redraw();
  },

  'report-back': ({ ctx }) => {
    if (!report) return;
    report.step = 'pick';
    ctx.redraw();
  },

  'report-download': ({ ctx }) => {
    if (!report) return;
    const found = buildReport(ctx, report);
    const period = reportPeriod(report);
    if (!found || 'problem' in period) return;
    const name = report.mode === 'month' ? period.from.slice(0, 7) : `${period.from}-to-${period.to}`;
    downloadLedgerPdf(found, `v6m-ledger-${name}${report.view === 'all' ? '' : report.view === 'in' ? '-income' : '-expenses'}.pdf`);
    report = null;
    ctx.redraw();
    ctx.toast(`Ledger report for ${found.label} downloaded`, 'info');
  },

  'add-expense': ({ ctx }) => ctx.newExpense(),

  'edit-expense': ({ el, ctx }) => {
    const expense = ctx.state.expenses.find((item) => item.id === el.dataset.id);
    if (expense) ctx.newExpense(expense);
  },
};

