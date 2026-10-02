// Finances: the month's books. Every payment that came in and every expense
// that went out, as one ledger table; how the weeks went, in one chart; where
// the money went, as a ranked table with bars; and what guests still owe for
// the month. Cash in, cash out — a booking still owed for shows under Owed,
// never as income. Only accounts that track expenses can open it.

import { flag, html, type SafeHTML } from '../../core/dom.js';
import { formatDate, parseDate, peso, pesoShort, plural, toISODate } from '../../core/format.js';
import { CATEGORY_LABELS, financeRange, type FinancePoint } from '../../core/finance.js';
import { dayOf, rankSlices, sumOf, within, type Bucket, type Slice } from '../../core/period.js';
import { METHOD_LABELS, findBooking, isActive } from '../../core/rules.js';
import type { ExpenseCategory, ISODate, PaymentMethod, PaymentType, State } from '../../core/types.js';
import type { DeskContext, HandlerMap } from '../types.js';
import { paymentPill } from '../components/badges.js';
import { openDatePicker } from '../components/date-picker.js';
import { icon } from '../components/icons.js';
import { emptyState, pageHead } from '../layout.js';

/** The month on screen, by its 1st; null follows the demo date. */
let month: ISODate | null = null;
/** Which side of the ledger is showing. */
let view: 'all' | 'in' | 'out' = 'all';
/** A week of the chart the reader pinned, by its first day: the tables narrow to it. */
let pinned: string | null = null;
/** Which way the last step went, for the slide. */
let motion: 'back' | 'on' | 'swap' = 'swap';

const firstOf = (day: ISODate): ISODate => `${day.slice(0, 8)}01`;
const lastOf = (first: ISODate): ISODate => {
  const date = parseDate(first);
  return toISODate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
};
const monthLabel = (first: ISODate): string => parseDate(first).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

const TYPE_LABELS: Record<PaymentType, string> = { deposit: 'Downpayment', balance: 'Balance', full: 'Paid in full' };

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

interface LedgerRow {
  date: ISODate;
  /** For ordering two entries on one day. */
  at: string;
  what: string;
  sub: string;
  category: string;
  method: PaymentMethod;
  amountIn: number;
  amountOut: number;
  /** What a click opens. */
  action: 'open-booking' | 'edit-expense';
  id: string;
}

function ledgerRows(state: State, from: ISODate, to: ISODate): LedgerRow[] {
  const income: LedgerRow[] = state.payments
    .filter((payment) => within(dayOf(payment.receivedAt), from, to))
    .map((payment) => {
      const booking = findBooking(state, payment.bookingId);
      return {
        date: dayOf(payment.receivedAt),
        at: payment.receivedAt,
        what: booking?.guestName ?? 'Removed booking',
        sub: payment.bookingId,
        category: `Booking · ${TYPE_LABELS[payment.type]}`,
        method: payment.method,
        amountIn: payment.amount,
        amountOut: 0,
        action: 'open-booking',
        id: payment.bookingId,
      };
    });
  const spending: LedgerRow[] = state.expenses
    .filter((expense) => within(expense.date, from, to))
    .map((expense) => ({
      date: expense.date,
      at: expense.createdAt,
      what: expense.item,
      sub: expense.vendor ?? '',
      category: CATEGORY_LABELS[expense.category],
      method: expense.method,
      amountIn: 0,
      amountOut: expense.amount,
      action: 'edit-expense',
      id: expense.id,
    }));
  return [...income, ...spending].sort((a, b) => (b.date === a.date ? b.at.localeCompare(a.at) : b.date.localeCompare(a.date)));
}

function ledger(state: State, rows: LedgerRow[], label: string): SafeHTML {
  const shown = rows.filter((row) => (view === 'in' ? row.amountIn : view === 'out' ? row.amountOut : true));
  const totalIn = sumOf(shown.map((row) => row.amountIn));
  const totalOut = sumOf(shown.map((row) => row.amountOut));
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
      ${shown.length ? html`
        <div class="table-scroll">
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
              ${shown.map((row) => html`
                <tr class="data-table__row ${row.date === state.meta.asOf ? 'is-today' : ''}" data-action="${row.action}" data-id="${row.id}">
                  <td>${row.date === state.meta.asOf ? html`<span class="data-table__today">Today</span>` : formatDate(row.date, 'monthDay')}</td>
                  <td>
                    <button class="link-button" type="button" data-action="${row.action}" data-id="${row.id}">${row.what}</button>
                    ${row.sub ? html`<span class="data-table__sub ${row.action === 'open-booking' ? 'mono' : ''}">${row.sub}</span>` : ''}
                  </td>
                  <td class="muted">${row.category}</td>
                  <td class="muted">${METHOD_LABELS[row.method]}</td>
                  <td class="num fin-in">${row.amountIn ? peso(row.amountIn) : ''}</td>
                  <td class="num fin-out">${row.amountOut ? peso(row.amountOut) : ''}</td>
                  <td class="data-table__go" aria-hidden="true">${icon('chevronRight')}</td>
                </tr>`)}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colspan="4">Total for ${label}</th>
                <td class="num fin-in">${view === 'out' ? '' : peso(totalIn)}</td>
                <td class="num fin-out">${view === 'in' ? '' : peso(totalOut)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>` : html`<div class="fin-empty">${emptyState('Nothing recorded', `No ${view === 'in' ? 'income' : view === 'out' ? 'expenses' : 'money in or out'} for ${label}.`)}</div>`}
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

function owedTable(state: State, from: ISODate, to: ISODate, label: string): SafeHTML {
  const owing = state.bookings
    .filter((b) => within(b.date, from, to) && isActive(b) && b.balance > 0)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const total = sumOf(owing.map((b) => b.balance));
  return html`
    <section class="panel panel--flush fin-side" data-part="Still owed by guests">
      <header class="fin-ledger__head">
        <h2 class="panel__title">Still owed by guests <span class="panel__count">${owing.length}</span></h2>
      </header>
      ${owing.length ? html`
        <table class="data-table fin-table fin-table--compact">
          <thead>
            <tr><th scope="col">Guest</th><th scope="col">Date</th><th scope="col" class="num">Owed</th></tr>
          </thead>
          <tbody>
            ${owing.map((b) => html`
              <tr class="data-table__row ${b.date === state.meta.asOf ? 'is-today' : ''}" data-action="open-booking" data-id="${b.id}">
                <td>
                  <button class="link-button" type="button" data-action="open-booking" data-id="${b.id}">${b.guestName}</button>
                  <span class="data-table__sub">${paymentPill(b)}</span>
                </td>
                <td>${b.date === state.meta.asOf ? html`<span class="data-table__today">Today</span>` : formatDate(b.date, 'monthDay')}</td>
                <td class="num fin-owed">${peso(b.balance)}</td>
              </tr>`)}
          </tbody>
          <tfoot>
            <tr><th scope="row" colspan="2">Total owed</th><td class="num fin-owed">${peso(total)}</td></tr>
          </tfoot>
        </table>` : html`<div class="fin-empty">${emptyState('Nothing owed', `Every booking in ${label} is paid.`)}</div>`}
    </section>`;
}

// ---------- The page ----------

export function render(ctx: DeskContext): SafeHTML {
  const { state } = ctx;
  const first = month ?? firstOf(state.meta.asOf);
  const last = lastOf(first);
  const report = financeRange(state, first, last);
  const week = report.points.find((point) => point.from === pinned) as Bucket | undefined;
  // A pinned week narrows the totals and the tables; the chart keeps the month.
  const from = week?.from ?? first;
  const to = week?.to ?? last;
  const label = week ? `${formatDate(week.from, 'monthDay')} – ${formatDate(week.to, 'monthDay')}` : monthLabel(first);
  const rows = ledgerRows(state, from, to);
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
          <h2 class="panel__title">In and out, ${report.weekly ? 'week by week' : 'day by day'}</h2>
          ${trendLegend(MONEY_SERIES)}
        </header>
        ${trendChart(report.points, report.weekly)}
      </section>

      ${ledger(state, rows, label)}

      <div class="fin-sides">
        ${whereItWent(categories, label)}
        ${owedTable(state, from, to, label)}
      </div>
    </div>`;
}

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

  'fin-pick': ({ ctx }) => {
    openDatePicker({
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

  'ledger-view': ({ el, ctx }) => {
    const next = el.dataset.view;
    view = next === 'in' || next === 'out' ? next : 'all';
    ctx.redraw();
  },

  'add-expense': ({ ctx }) => ctx.newExpense(),

  'edit-expense': ({ el, ctx }) => {
    const expense = ctx.state.expenses.find((item) => item.id === el.dataset.id);
    if (expense) ctx.newExpense(expense);
  },
};

