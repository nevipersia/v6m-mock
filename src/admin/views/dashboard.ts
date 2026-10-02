// Dashboard: today in four cards, what needs attention, and one summary of
// sales against income and expenses. The full figures live on Finances.

import { flag, html, type SafeHTML } from '../../core/dom.js';
import { addDays, formatDate, peso, plural } from '../../core/format.js';
import { closingEvent, downpaymentDue, exclusiveOn, isActive, productLabel } from '../../core/rules.js';
import { financeReport } from '../../core/finance.js';
import { SALES_RANGES, salesReport } from '../../core/sales.js';
import type { Staff } from '../../core/types.js';
import type { DeskContext, HandlerMap } from '../types.js';
import { arrivingToday, headcount, inHouseNow } from '../components/guest-summary.js';
import { icon } from '../components/icons.js';
import { pageHead } from '../layout.js';
import { showBookingsOn } from './bookings.js';

const MAX_HOLDS_SHOWN = 3;

/** How many days the summary covers. Kept while the app is open. */
let summaryDays = 30;
/** Whether the Needs attention line is opened out. */
let attentionOpen = false;

function greeting(staff: Staff): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${staff.name.split(' ')[0]}`;
}

interface CardOptions {
  label: string;
  value: string;
  detail: string;
  /** The card's action and the data it carries, or a link. */
  action?: string;
  href?: string;
  /** What tapping it does, for the screen reader and the tooltip. */
  opens: string;
  tone?: 'warn';
}

function card({ label, value, detail, action, href, opens, tone }: CardOptions): SafeHTML {
  const inner = html`
    <span class="card__label">${label}</span>
    <span class="card__value" data-count-up>${value}</span>
    <span class="card__detail">${detail} ${icon('arrowRight')}</span>`;
  const className = `card ${tone ? `card--${tone}` : ''}`;
  return href
    ? html`<a class="${className}" href="${href}" title="${opens}">${inner}</a>`
    : html`<button class="${className}" type="button" data-action="${action ?? ''}" title="${opens}">${inner}</button>`;
}

function attentionItems(ctx: DeskContext): SafeHTML[] {
  const { state } = ctx;
  const today = state.meta.asOf;
  const items: SafeHTML[] = [];

  const holds = state.bookings.filter((b) => b.status === 'hold' && b.date >= today);
  holds.slice(0, MAX_HOLDS_SHOWN).forEach((b) => items.push(html`
    <li>
      <button class="attention__item" type="button" data-action="open-booking" data-id="${b.id}">
        ${icon('wallet')}
        <span><strong>${b.guestName}</strong> ${b.paid ? `still owes ${peso(downpaymentDue(b))} of the downpayment` : 'has not paid the downpayment'} for ${productLabel(state, b.product)} on ${formatDate(b.date)}</span>
      </button>
    </li>`));

  if (holds.length > MAX_HOLDS_SHOWN) {
    items.push(html`
      <li>
        <a class="attention__item" href="#/bookings">
          ${icon('wallet')}
          <span><strong>${plural(holds.length - MAX_HOLDS_SHOWN, 'more booking')}</strong> on hold, downpayment due</span>
        </a>
      </li>`);
  }

  const upcomingEvent = state.events.find((event) => event.bookingId && event.date >= today);
  const eventBooking = upcomingEvent && state.bookings.find((b) => b.id === upcomingEvent.bookingId);
  if (eventBooking && eventBooking.balance > 0 && isActive(eventBooking)) {
    items.push(html`
      <li>
        <button class="attention__item" type="button" data-action="open-booking" data-id="${eventBooking.id}">
          ${icon('sparkles')}
          <span><strong>${upcomingEvent.title}</strong> on ${formatDate(upcomingEvent.date)} still owes ${peso(eventBooking.balance)}</span>
        </button>
      </li>`);
  }

  const nextExclusive = state.bookings.find((b) => isActive(b) && b.productType === 'exclusive' && b.date >= today && b.date <= addDays(today, 14));
  if (nextExclusive) {
    items.push(html`
      <li>
        <button class="attention__item" type="button" data-action="open-booking" data-id="${nextExclusive.id}">
          ${icon('sparkles')}
          <span><strong>Exclusive rental</strong> on ${formatDate(nextExclusive.date)}: ${nextExclusive.guestName}, ${productLabel(state, nextExclusive.product)}. Other bookings are closed then.</span>
        </button>
      </li>`);
  }

  const newInquiries = state.inquiries.filter((inquiry) => inquiry.status === 'new').length;
  if (newInquiries && ctx.canView('inbox')) {
    items.push(html`
      <li>
        <a class="attention__item" href="#/inbox">
          ${icon('message')}
          <span><strong>${plural(newInquiries, 'new inquiry', 'new inquiries')}</strong> waiting for a reply</span>
        </a>
      </li>`);
  }

  const openLinks = state.bookingLinks.filter((link) => link.status === 'sent' && link.expiresAt >= today).length;
  if (openLinks) {
    items.push(html`
      <li>
        <a class="attention__item" href="#/bookings">
          ${icon('link')}
          <span><strong>${plural(openLinks, 'booking link')}</strong> sent and not filled in yet</span>
        </a>
      </li>`);
  }

  return items;
}

/** One line of the summary: a name on the left, its figure on the right. */
function line(label: string, value: string, tone = ''): SafeHTML {
  return html`
    <div class="summary__line ${tone ? `summary__line--${tone}` : ''}">
      <dt>${label}</dt>
      <dd>${value}</dd>
    </div>`;
}

/**
 * Sales beside income and expenses, over one window. They are meant to differ:
 * sales count bookings when they are taken, income counts money when it lands.
 */
function summarySection(ctx: DeskContext): SafeHTML {
  const sales = salesReport(ctx.state, summaryDays);
  const canTrack = ctx.can('expenses.manage');
  const money = canTrack ? financeReport(ctx.state, summaryDays) : null;
  const best = sales.byProduct[0];
  const biggest = money?.byCategory[0];
  const swing = money && money.profitBefore !== null ? money.profit - money.profitBefore : null;
  const before = `vs the ${summaryDays} days before`;

  return html`
    <section class="panel summary" aria-label="Summary" data-part="Summary">
      <header class="summary__head">
        <div>
          <h2 class="summary__title">Summary</h2>
          <p class="small muted">${formatDate(sales.from, 'monthDay')} – ${formatDate(sales.to, 'monthDay')}</p>
        </div>
        <div class="sales__controls">
          <div class="segmented" role="group" aria-label="Summary period">
            ${SALES_RANGES.map((days) => html`
              <button class="segmented__option ${days === summaryDays ? 'is-active' : ''}" type="button"
                data-action="summary-range" data-days="${days}" aria-pressed="${flag(days === summaryDays)}">${days} days</button>`)}
          </div>
          ${canTrack ? html`
            <button class="btn btn--secondary btn--sm" type="button" data-action="add-expense">${icon('plus')} Record an expense</button>` : ''}
        </div>
      </header>

      <div class="summary__cols ${money ? '' : 'summary__cols--one'}" data-enter="summary|${summaryDays}">
        <div>
          <h3 class="summary__heading">Sales</h3>
          <dl class="summary__lines">
            ${line('Booked', peso(sales.booked), 'strong')}
            ${line('Bookings taken', String(sales.bookings))}
            ${line('Average booking', peso(sales.averageBooking))}
            ${line('Best seller', best ? `${best.label} · ${Math.round(best.share * 100)}%` : 'Nothing booked')}
            ${line('Still to collect', peso(sales.outstanding), sales.outstanding ? 'warn' : '')}
          </dl>
        </div>

        ${money ? html`
          <div>
            <h3 class="summary__heading">Income and expenses</h3>
            <dl class="summary__lines">
              ${line('Income', peso(money.income), 'strong')}
              ${line('Expenses', peso(money.spend))}
              ${line('Biggest cost', biggest ? `${biggest.label} · ${Math.round(biggest.share * 100)}%` : 'Nothing spent')}
              ${line(money.profit < 0 ? 'Loss' : 'Profit', peso(Math.abs(money.profit)), money.profit < 0 ? 'total warn' : 'total')}
            </dl>
            <p class="summary__note small muted">
              ${money.margin === null ? 'Nothing came in' : `${Math.round(money.margin * 100)}% of income`}
              ${swing === null ? '' : html` · <span class="stat__change stat__change--${swing < 0 ? 'down' : 'up'}">${swing < 0 ? '▼' : '▲'} ${peso(Math.abs(swing))}</span> ${before}`}
            </p>
          </div>` : ''}
      </div>

      ${ctx.canView('finances') ? html`<a class="summary__more small" href="#/finances">Full financial report ${icon('arrowRight')}</a>` : ''}
    </section>`;
}

export function render(ctx: DeskContext): SafeHTML {
  const { state, staff } = ctx;
  const today = state.meta.asOf;
  const canWrite = ctx.can('bookings.write');

  const todays = state.bookings.filter((b) => b.date === today && isActive(b) && b.product !== 'event');
  const arriving = arrivingToday(state);
  const inHouse = inHouseNow(state);
  const payments = state.payments.filter((p) => p.receivedAt.startsWith(today));
  const collected = payments.reduce((sum, p) => sum + p.amount, 0);
  const owing = state.bookings.filter((b) => isActive(b) && b.status !== 'checked_out' && b.date === today && b.balance > 0);
  const balancesDue = owing.reduce((sum, b) => sum + b.balance, 0);
  const closedFor = closingEvent(state, today);
  const attention = attentionItems(ctx);

  return html`
    ${pageHead({
      eyebrow: greeting(staff),
      title: 'Dashboard',
      subtitle: `${formatDate(today, 'long')} · ${plural(todays.length, 'booking')} today`,
      actions: canWrite ? html`
        <button class="btn btn--primary" type="button" data-action="new-booking">${icon('plus')} New booking</button>` : '',
    })}

    ${closedFor ? html`<p class="notice notice--event">V6M is closed today for ${closedFor.title}.</p>` : ''}
    ${exclusiveOn(state, today) ? html`
      <p class="notice notice--exclusive">Exclusive rental today: ${exclusiveOn(state, today)?.guestName} has ${productLabel(state, exclusiveOn(state, today)?.product ?? '')}. No other guests during their time.</p>` : ''}

    <div class="cards" data-part="Today">
      ${card({ label: 'Arriving today', value: String(arriving.length), detail: plural(headcount(arriving), 'guest'), action: 'show-arriving', opens: 'See who is arriving today' })}
      ${card({ label: 'In house', value: String(inHouse.length), detail: `${plural(headcount(inHouse), 'guest')} checked in`, action: 'show-inhouse', opens: 'See who is checked in now' })}
      ${ctx.canView('finances')
        ? card({ label: 'Collected today', value: peso(collected), detail: plural(payments.length, 'payment'), href: '#/finances', opens: 'Open the books' })
        : card({ label: 'Collected today', value: peso(collected), detail: plural(payments.length, 'payment'), action: 'show-balances', opens: "Open today's bookings" })}
      ${card({
        label: 'Balances due',
        value: peso(balancesDue),
        detail: balancesDue ? `On ${plural(owing.length, 'booking')} today` : "Today's bookings are paid",
        action: 'show-balances',
        opens: "Open today's bookings",
        tone: balancesDue ? 'warn' : undefined,
      })}
    </div>

    ${attention.length ? html`
      <details class="attention-line" ${attentionOpen ? 'open' : ''}>
        <summary data-action="toggle-attention">
          ${icon('alert')}
          <span>${plural(attention.length, 'thing needs', 'things need')} attention</span>
          ${icon('chevronDown')}
        </summary>
        <ul class="attention">${attention}</ul>
      </details>` : ''}

    ${summarySection(ctx)}`;
}

export const actions: HandlerMap = {
  'show-arriving': ({ ctx }) => ctx.openGuests('arriving'),

  'show-inhouse': ({ ctx }) => ctx.openGuests('inhouse'),

  'show-balances': ({ ctx }) => showBookingsOn(ctx.state.meta.asOf),

  // Remembered so a redraw (a booking saved in the drawer) does not fold it away.
  'toggle-attention': ({ el }) => {
    attentionOpen = !(el.closest('details') as HTMLDetailsElement).open;
  },

  'summary-range': ({ el, ctx }) => {
    summaryDays = Number(el.dataset.days) || 30;
    ctx.redraw();
  },

  'add-expense': ({ ctx }) => ctx.newExpense(),
};
