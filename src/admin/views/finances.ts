// Finances: the complete picture behind the dashboard's summary — what sold,
// how guests paid, money in against money out, where it went and every
// expense recorded. Sales are open to every account; income and expenses only
// to accounts that track expenses.

import { flag, html, type SafeHTML, type TemplateValue } from '../../core/dom.js';
import { formatDate, peso, pesoShort, plural } from '../../core/format.js';
import { findStaff } from '../../core/rules.js';
import {
  CATEGORY_LABELS, financeBetween, financeReport, type FinancePoint, type FinanceSummary,
} from '../../core/finance.js';
import type { Bucket, Slice } from '../../core/period.js';
import {
  SALES_RANGES, salesBetween, salesReport, type SalesPoint, type SalesSummary,
} from '../../core/sales.js';
import type { Expense } from '../../core/types.js';
import type { DeskContext, HandlerMap } from '../types.js';
import { icon } from '../components/icons.js';
import { emptyState, pageHead } from '../layout.js';

/** How many days of sales the dashboard is showing. Kept while the app is open. */
let salesDays: number = SALES_RANGES[0];
/** The trend bar the reader pinned by clicking or tapping it, by start date. */
let pinnedPoint: string | null = null;
/** The same two, for the income and expenses section. A month is its natural window. */
let moneyDays = 30;
let pinnedMoney: string | null = null;

function salesStat(label: string, value: string, detail: TemplateValue = '', tone = ''): SafeHTML {
  return html`
    <div class="stat ${tone ? `stat--${tone}` : ''}">
      <span class="stat__label">${label}</span>
      <span class="stat__value">${value}</span>
      ${detail ? html`<span class="stat__detail">${detail}</span>` : ''}
    </div>`;
}

/**
 * One series of a trend chart. `key` carries the colour, `legend` names it above
 * the chart and `word` is how it reads out: "₱42,300 booked".
 */
interface TrendSeries<P> {
  key: string;
  legend: string;
  word: string;
  value: (point: P) => number;
}

/** The key and its name, above the chart. Both trends on the page use it. */
function trendLegend<P>(series: TrendSeries<P>[]): SafeHTML {
  return html`
    <p class="chart__legend small muted">
      ${series.map((one) => html`
        <span class="chart__legend-item"><span class="chart__key chart__key--${one.key}"></span>${one.legend}</span>`)}
    </p>`;
}

interface TrendOptions<P extends Bucket> {
  points: P[];
  series: TrendSeries<P>[];
  /** Bars are weeks rather than days. */
  weekly: boolean;
  days: number;
  /** The bar the reader pinned, by start date. */
  pinned: string | null;
  /** Action name for clicking a bar. */
  action: string;
  /** What the chart is, for the screen-reader line. */
  caption: string;
}

/**
 * Two figures per day (per week over longer windows), as pairs of bars. Every
 * bar is a button: hovering reads it out under the chart, clicking pins it.
 */
function trendChart<P extends Bucket>({ points, series, weekly, days, pinned, action, caption }: TrendOptions<P>): SafeHTML {
  const peak = Math.max(1, ...points.flatMap((point) => series.map((one) => one.value(point))));
  const height = (value: number) => `${Math.max(value > 0 ? 2 : 0, Math.round((value / peak) * 100))}%`;
  const readout = (point: P) => `${point.title} · ${series.map((one) => `${peso(one.value(point))} ${one.word}`).join(' · ')}`;
  const focus = points.find((point) => point.from === pinned);
  // What the line under the chart says when nothing is hovered.
  const resting = focus
    ? readout(focus)
    : `Tallest bar ${pesoShort(peak)}${weekly ? ' · one bar per week' : ' · one bar per day'}`;

  return html`
    <figure class="trend">
      <p class="sr-only">${caption} over the last ${days} days. Each bar reads out below the chart.</p>
      <div class="chart">
        ${points.map((point) => html`
          <button class="chart__col ${point.isNow ? 'is-now' : ''} ${point.from === pinned ? 'is-pinned' : ''}"
            type="button" data-action="${action}" data-hover="chart-point" data-point="${point.from}"
            data-readout="${readout(point)}" aria-pressed="${flag(point.from === pinned)}"
            aria-label="${readout(point)}">
            <span class="chart__bars">
              ${series.map((one) => html`
                <span class="chart__bar chart__bar--${one.key}" style="height:${height(one.value(point))}"></span>`)}
            </span>
            <span class="chart__label">${point.label}</span>
          </button>`)}
      </div>
      <figcaption class="chart__readout small ${focus ? '' : 'muted'}" data-slot="chart-readout"
        data-resting="${resting}" aria-live="polite">${resting}</figcaption>
    </figure>`;
}

const SALES_SERIES: TrendSeries<SalesPoint>[] = [
  { key: 'booked', legend: 'Booked', word: 'booked', value: (point) => point.booked },
  { key: 'collected', legend: 'Collected', word: 'collected', value: (point) => point.collected },
];

const MONEY_SERIES: TrendSeries<FinancePoint>[] = [
  { key: 'in', legend: 'Income', word: 'income', value: (point) => point.income },
  { key: 'out', legend: 'Expenses', word: 'spent', value: (point) => point.spend },
];

/**
 * Part-to-whole: one stacked bar, then the legend that names every slice. The
 * slice keys carry the colour, so a group keeps its colour whatever it sold
 * and wherever it lands in the ranking.
 */
function shareChart(slices: Slice[], total: number, empty: string, name: string): SafeHTML {
  if (!slices.length) return html`<p class="small muted">${empty}</p>`;
  const readout = (slice: Slice) => `${slice.label} · ${peso(slice.amount)} · ${Math.round(slice.share * 100)}% of ${peso(total)}`;

  return html`
    <figure class="share">
      <div class="share__bar" role="img" aria-label="${name}: ${slices.map((slice) => `${slice.label} ${Math.round(slice.share * 100)}%`).join(', ')}">
        ${slices.map((slice) => html`
          <span class="share__seg share__seg--${slice.key}" style="flex-basis:${(slice.share * 100).toFixed(2)}%"
            data-hover="share-slice" data-readout="${readout(slice)}"></span>`)}
      </div>
      <figcaption class="share__readout small muted" data-slot="share-readout"
        data-resting="${peso(total)} across ${plural(slices.length, 'group', 'groups')}">${peso(total)} across ${plural(slices.length, 'group', 'groups')}</figcaption>
      <ul class="share__legend">
        ${slices.map((slice) => html`
          <li class="share__row" data-hover="share-slice" data-readout="${readout(slice)}">
            <span class="share__key share__key--${slice.key}" aria-hidden="true"></span>
            <span class="share__label">${slice.label}</span>
            <span class="share__amount">${peso(slice.amount)}</span>
            <span class="share__meta small muted">${Math.round(slice.share * 100)}% · ${slice.count}</span>
          </li>`)}
      </ul>
    </figure>`;
}

/** "vs the 7 days before", "vs the day before". */
const comparedWith = (days: number): string => `vs the ${days === 1 ? 'day' : `${days} days`} before`;

function salesSection(ctx: DeskContext): SafeHTML {
  const report = salesReport(ctx.state, salesDays);
  // Clicking a bar re-cuts the whole section to that day or week; the chart
  // itself keeps showing the full window so there is a way back.
  const focus = report.points.find((point) => point.from === pinnedPoint) ?? null;
  const shown: SalesSummary = focus ? salesBetween(ctx.state, focus.from, focus.to) : report;
  const changeTone = shown.change === null ? '' : shown.change < 0 ? 'down' : 'up';

  return html`
    <section class="sales" aria-label="Sales" data-part="Sales">
      <header class="sales__head">
        <div>
          <h2 class="sales__title">Sales</h2>
          <p class="small muted">
            ${focus
              ? html`<strong>${focus.title}</strong> · ${report.weekly ? 'this week' : 'this day'} only`
              : `${formatDate(report.from, 'monthDay')} – ${formatDate(report.to, 'monthDay')} · bookings taken in this window`}
          </p>
        </div>
        <div class="sales__controls">
          ${focus ? html`
            <button class="btn btn--quiet btn--sm" type="button" data-action="clear-point">Show all ${salesDays} days</button>` : ''}
          <div class="segmented" role="group" aria-label="Sales period">
            ${SALES_RANGES.map((days) => html`
              <button class="segmented__option ${days === salesDays ? 'is-active' : ''}" type="button"
                data-action="sales-range" data-days="${days}" aria-pressed="${flag(days === salesDays)}">${days} days</button>`)}
          </div>
        </div>
      </header>

      <div class="stats ${focus ? 'is-focused' : ''}" data-enter="sales|${salesDays}:${pinnedPoint ?? ''}">
        ${salesStat('Sales booked', peso(shown.booked), `${plural(shown.bookings, 'booking')} taken`)}
        ${salesStat('Collected', peso(shown.collected), shown.change === null
          ? 'Nothing to compare with'
          : html`<span class="stat__change stat__change--${changeTone}">${shown.change > 0 ? '▲' : shown.change < 0 ? '▼' : '='} ${Math.abs(shown.change)}%</span> ${comparedWith(shown.days)}`)}
        ${salesStat('Average booking', peso(shown.averageBooking), 'Per booking taken')}
        ${salesStat('Still to collect', peso(shown.outstanding), 'On these bookings', shown.outstanding ? 'warn' : '')}
      </div>

      <div class="sales__grid">
        <section class="panel sales__trend">
          <header class="panel__head">
            <h3 class="panel__title">Trend</h3>
            ${trendLegend(SALES_SERIES)}
          </header>
          ${trendChart({
            points: report.points,
            series: SALES_SERIES,
            weekly: report.weekly,
            days: report.days,
            pinned: pinnedPoint,
            action: 'pin-point',
            caption: 'Sales taken and money collected',
          })}
        </section>

        <section class="panel">
          <header class="panel__head">
            <h3 class="panel__title">What sold</h3>
            ${focus ? html`<span class="pill pill--info">${focus.label}</span>` : ''}
          </header>
          ${shareChart(shown.byProduct, shown.booked, focus ? 'Nothing was booked then.' : 'No bookings taken in this window.', 'What sold')}
        </section>

        <section class="panel">
          <header class="panel__head">
            <h3 class="panel__title">How guests paid</h3>
            ${focus ? html`<span class="pill pill--info">${focus.label}</span>` : ''}
          </header>
          ${shareChart(shown.byMethod, shown.collected, focus ? 'Nothing came in then.' : 'No payments in this window.', 'How guests paid')}
        </section>
      </div>
    </section>`;
}

/** How many expenses the list shows before it says how many more there are. */
const EXPENSES_SHOWN = 6;

/** One recorded expense, with the amount and a way into the form. */
function expenseRow(ctx: DeskContext, expense: Expense): SafeHTML {
  const who = expense.recordedBy ? findStaff(ctx.state, expense.recordedBy)?.name : null;
  return html`
    <li class="spend-row">
      <button class="spend-row__main" type="button" data-action="edit-expense" data-id="${expense.id}">
        <span class="spend-row__title">${expense.item}</span>
        <span class="spend-row__meta small muted">
          ${formatDate(expense.date)} · ${CATEGORY_LABELS[expense.category]}${expense.vendor ? ` · ${expense.vendor}` : ''}${who ? ` · ${who}` : ''}
        </span>
      </button>
      <span class="spend-row__amount">${peso(expense.amount)}</span>
    </li>`;
}

/**
 * Money in against money out. Income is what the payments brought in, so the
 * profit here is cash that has actually arrived — a booking that is still owed
 * for counts under Sales, not here.
 */
function moneySection(ctx: DeskContext): SafeHTML {
  const report = financeReport(ctx.state, moneyDays);
  // Clicking a bar cuts the whole section down to that day or week.
  const focus = report.points.find((point) => point.from === pinnedMoney) ?? null;
  const shown: FinanceSummary = focus ? financeBetween(ctx.state, focus.from, focus.to) : report;
  const loss = shown.profit < 0;
  // Nothing moved in the window before: there is no honest comparison to draw.
  const swing = shown.profitBefore === null ? null : shown.profit - shown.profitBefore;
  const biggest = shown.byCategory[0];
  const canTrack = ctx.can('expenses.manage');

  return html`
    <section class="sales money" aria-label="Income and expenses" data-part="Income and expenses">
      <header class="sales__head">
        <div>
          <h2 class="sales__title">Income and expenses</h2>
          <p class="small muted">
            ${focus
              ? html`<strong>${focus.title}</strong> · ${report.weekly ? 'this week' : 'this day'} only`
              : `${formatDate(report.from, 'monthDay')} – ${formatDate(report.to, 'monthDay')} · money received against money spent`}
          </p>
        </div>
        <div class="sales__controls">
          ${focus ? html`
            <button class="btn btn--quiet btn--sm" type="button" data-action="clear-money">Show all ${moneyDays} days</button>` : ''}
          <div class="segmented" role="group" aria-label="Income and expenses period">
            ${SALES_RANGES.map((days) => html`
              <button class="segmented__option ${days === moneyDays ? 'is-active' : ''}" type="button"
                data-action="money-range" data-days="${days}" aria-pressed="${flag(days === moneyDays)}">${days} days</button>`)}
          </div>
        </div>
      </header>

      <div class="stats ${focus ? 'is-focused' : ''}" data-enter="money|${moneyDays}:${pinnedMoney ?? ''}">
        ${salesStat('Income', peso(shown.income), 'Payments received')}
        ${salesStat('Expenses', peso(shown.spend), `${plural(shown.count, 'expense')} recorded`)}
        ${salesStat(loss ? 'Loss' : 'Profit', peso(Math.abs(shown.profit)), html`
          ${shown.margin === null ? 'Nothing came in' : `${Math.round(shown.margin * 100)}% of income`}
          ${swing === null ? '· nothing to compare with' : html`
            · <span class="stat__change stat__change--${swing < 0 ? 'down' : 'up'}">${swing < 0 ? '▼' : '▲'} ${peso(Math.abs(swing))}</span> ${comparedWith(shown.days)}`}`,
        loss ? 'warn' : '')}
        ${salesStat('Biggest cost', biggest ? peso(biggest.amount) : peso(0),
        biggest ? `${biggest.label} · ${Math.round(biggest.share * 100)}% of spending` : 'Nothing spent in this window')}
      </div>

      <div class="sales__grid">
        <section class="panel sales__trend">
          <header class="panel__head">
            <h3 class="panel__title">In and out</h3>
            ${trendLegend(MONEY_SERIES)}
          </header>
          ${trendChart({
            points: report.points,
            series: MONEY_SERIES,
            weekly: report.weekly,
            days: report.days,
            pinned: pinnedMoney,
            action: 'pin-money',
            caption: 'Money received and money spent',
          })}
        </section>

        <section class="panel">
          <header class="panel__head">
            <h3 class="panel__title">Where it went</h3>
            ${focus ? html`<span class="pill pill--info">${focus.label}</span>` : ''}
          </header>
          ${shareChart(shown.byCategory, shown.spend, focus ? 'Nothing was spent then.' : 'No expenses recorded in this window.', 'Where it went')}
        </section>

        <section class="panel">
          <header class="panel__head">
            <h3 class="panel__title">Expenses</h3>
            <span class="panel__count">${shown.count}</span>
          </header>
          ${shown.expenses.length ? html`
            <ul class="spend-rows">
              ${shown.expenses.slice(0, EXPENSES_SHOWN).map((expense) => expenseRow(ctx, expense))}
            </ul>
            ${shown.expenses.length > EXPENSES_SHOWN ? html`
              <p class="small muted">${plural(shown.expenses.length - EXPENSES_SHOWN, 'older expense')} in this window.</p>` : ''}`
          : emptyState('Nothing spent yet', canTrack
            ? 'Record what the resort pays out and the profit here follows.'
            : 'Only accounts that track expenses can add them.')}
        </section>
      </div>
    </section>`;
}

export function render(ctx: DeskContext): SafeHTML {
  const canTrack = ctx.can('expenses.manage');
  return html`
    ${pageHead({
      title: 'Finances',
      subtitle: canTrack ? 'Sales, income and expenses in full' : 'Sales in full',
      actions: canTrack ? html`
        <button class="btn btn--primary" type="button" data-action="add-expense">${icon('plus')} Record an expense</button>` : '',
    })}

    ${salesSection(ctx)}

    ${canTrack ? moneySection(ctx) : ''}`;
}

export const hovers: HandlerMap = {
  // Each figure has its own read-out line, so write into the one this slice sits in.
  'share-slice': ({ el, event }) => {
    const readout = el.closest('.share')?.querySelector<HTMLElement>('[data-slot="share-readout"]');
    if (!readout) return;
    const arriving = event.type === 'mouseover' || event.type === 'focusin';
    readout.textContent = arriving ? el.dataset.readout ?? '' : readout.dataset.resting ?? '';
    readout.classList.toggle('muted', !arriving);
  },

  // Arriving shows that bar's figures; leaving puts the resting line back. The
  // page has two trends, so write into the one this bar belongs to.
  'chart-point': ({ el, event }) => {
    const readout = el.closest('.trend')?.querySelector<HTMLElement>('[data-slot="chart-readout"]');
    if (!readout) return;
    const arriving = event.type === 'mouseover' || event.type === 'focusin';
    const resting = readout.dataset.resting ?? '';
    readout.textContent = arriving ? el.dataset.readout ?? '' : resting;
    // The resting line is only emphasised while a bar stays pinned.
    readout.classList.toggle('muted', !arriving && !el.closest('.chart')?.querySelector('.is-pinned'));
  },
};

export const actions: HandlerMap = {
  'sales-range': ({ el, ctx }) => {
    salesDays = Number(el.dataset.days) || SALES_RANGES[0];
    pinnedPoint = null;
    ctx.redraw();
  },

  // Clicking a bar cuts the section down to it; clicking it again undoes that.
  'pin-point': ({ el, ctx }) => {
    pinnedPoint = pinnedPoint === el.dataset.point ? null : el.dataset.point ?? null;
    ctx.redraw();
  },

  'clear-point': ({ ctx }) => {
    pinnedPoint = null;
    ctx.redraw();
  },

  'money-range': ({ el, ctx }) => {
    moneyDays = Number(el.dataset.days) || 30;
    pinnedMoney = null;
    ctx.redraw();
  },

  'pin-money': ({ el, ctx }) => {
    pinnedMoney = pinnedMoney === el.dataset.point ? null : el.dataset.point ?? null;
    ctx.redraw();
  },

  'clear-money': ({ ctx }) => {
    pinnedMoney = null;
    ctx.redraw();
  },

  'add-expense': ({ ctx }) => ctx.newExpense(),

  'edit-expense': ({ el, ctx }) => {
    const expense = ctx.state.expenses.find((item) => item.id === el.dataset.id);
    if (expense) ctx.newExpense(expense);
  },
};
