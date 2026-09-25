// Dashboard: how the resort is doing right now — money, occupancy, what needs
// attention, who arrives today and what is coming up.

import { checkOut } from '../../core/actions.js';
import { html, type SafeHTML, type TemplateValue } from '../../core/dom.js';
import { addDays, formatDate, formatDateTime, peso, pesoShort, plural, timeOf } from '../../core/format.js';
import {
  closingEvent, downpaymentDue, exclusiveOn, findSession, findStaff, findUnit, isActive, poolGuests, productLabel,
} from '../../core/rules.js';
import { SALES_RANGES, salesReport, type SalesReport, type SalesSlice } from '../../core/sales.js';
import type { Booking, Staff, State } from '../../core/types.js';
import type { DeskContext, HandlerMap } from '../types.js';
import { kindDot, paymentPill, statusPill } from '../components/badges.js';
import { icon } from '../components/icons.js';
import { emptyState, pageHead } from '../layout.js';

const MAX_HOLDS_SHOWN = 3;
const LOOKAHEAD_DAYS = 7;

const ACTIVITY_LABELS: Record<string, string> = {
  'booking.created': 'Booking created',
  'booking.checked_in': 'Checked in',
  'booking.checked_out': 'Checked out',
  'booking.cancelled': 'Booking cancelled',
  'payment.recorded': 'Payment recorded',
  'booking.confirmed': 'Booking confirmed',
  'booking.discounted': 'Discount given',
  'booking.discount_removed': 'Discount removed',
  'booking.unconfirmed': 'Booking back on hold',
  'booking.updated': 'Booking edited',
  'inquiry.replied': 'Inquiry replied',
  'user.invited': 'User invited',
  'user.joined': 'User joined',
  'user.updated': 'User updated',
  'user.status': 'User status changed',
  'user.invite_revoked': 'Invite revoked',
  'link.created': 'Booking link sent',
  'link.cancelled': 'Booking link cancelled',
  'link.used': 'Booking link used',
};

function greeting(staff: Staff): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${staff.name.split(' ')[0]}`;
}

function metric(label: string, value: TemplateValue, detail?: string, tone = ''): SafeHTML {
  return html`
    <div class="metric ${tone ? `metric--${tone}` : ''}">
      <span class="metric__label">${label}</span>
      <span class="metric__value">${value}</span>
      ${detail ? html`<span class="metric__detail">${detail}</span>` : ''}
    </div>`;
}

function poolMetric(state: State, sessionId: string): SafeHTML | '' {
  const session = findSession(state, sessionId);
  if (!session) return '';
  const guests = poolGuests(state, state.meta.asOf, sessionId);
  const percent = Math.min(100, Math.round((guests / session.capacity) * 100));
  return html`
    <div class="metric">
      <span class="metric__label">${session.label} pool</span>
      <span class="metric__value">${guests}<small>/${session.capacity}</small></span>
      <span class="meter" role="img" aria-label="${percent}% full"><span style="width:${percent}%"></span></span>
    </div>`;
}

function guestRow(ctx: DeskContext, booking: Booking, actionButton: TemplateValue): SafeHTML {
  return html`
    <li class="row">
      ${kindDot(ctx.state, booking.product)}
      <button class="row__main" type="button" data-action="open-booking" data-id="${booking.id}">
        <span class="row__title">${booking.guestName}</span>
        <span class="row__meta">${productLabel(ctx.state, booking.product)} · ${timeOf(booking.startsAt)} · ${plural(booking.adults + booking.kids, 'guest')}</span>
      </button>
      <span class="row__badges">${paymentPill(booking)}</span>
      ${actionButton}
    </li>`;
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

/** How many days of sales the dashboard is showing. Kept while the app is open. */
let salesDays: number = SALES_RANGES[0];

function salesStat(label: string, value: string, detail: TemplateValue = '', tone = ''): SafeHTML {
  return html`
    <div class="stat ${tone ? `stat--${tone}` : ''}">
      <span class="stat__label">${label}</span>
      <span class="stat__value">${value}</span>
      ${detail ? html`<span class="stat__detail">${detail}</span>` : ''}
    </div>`;
}

/** Sales taken and money collected per day (per week over longer windows). */
function salesChart(report: SalesReport): SafeHTML {
  const peak = Math.max(1, ...report.points.flatMap((point) => [point.booked, point.collected]));
  const height = (value: number) => `${Math.max(value > 0 ? 2 : 0, Math.round((value / peak) * 100))}%`;

  return html`
    <div class="chart" role="img" aria-label="Sales taken and money collected over the last ${report.days} days">
      ${report.points.map((point) => html`
        <div class="chart__col ${point.isNow ? 'is-now' : ''}">
          <div class="chart__bars">
            <span class="chart__bar chart__bar--booked" style="height:${height(point.booked)}"
              title="${point.title} · ${peso(point.booked)} booked"></span>
            <span class="chart__bar chart__bar--collected" style="height:${height(point.collected)}"
              title="${point.title} · ${peso(point.collected)} collected"></span>
          </div>
          <span class="chart__label">${point.label}</span>
        </div>`)}
    </div>
    <p class="chart__peak small muted">Tallest bar ${pesoShort(peak)}${report.weekly ? ' · one bar per week' : ' · one bar per day'}</p>`;
}

/** A ranked breakdown: cottages, GCash and so on, each with a share bar. */
function breakdown(slices: SalesSlice[], empty: string, tone: string): SafeHTML {
  if (!slices.length) return html`<p class="small muted">${empty}</p>`;
  return html`
    <ul class="breakdown">
      ${slices.map((slice) => html`
        <li class="breakdown__row">
          <span class="breakdown__label">${slice.label}</span>
          <span class="breakdown__amount">${peso(slice.amount)}</span>
          <span class="meter meter--thin meter--${tone} breakdown__meter"><span style="width:${Math.round(slice.share * 100)}%"></span></span>
          <span class="breakdown__share small muted">${Math.round(slice.share * 100)}% · ${slice.count}</span>
        </li>`)}
    </ul>`;
}

function salesSection(ctx: DeskContext): SafeHTML {
  const report = salesReport(ctx.state, salesDays);
  const changeTone = report.change === null ? '' : report.change < 0 ? 'down' : 'up';

  return html`
    <section class="sales" aria-label="Sales">
      <header class="sales__head">
        <div>
          <h2 class="sales__title">Sales</h2>
          <p class="small muted">${formatDate(report.from, 'monthDay')} – ${formatDate(report.to, 'monthDay')} · bookings taken in this window</p>
        </div>
        <div class="segmented" role="group" aria-label="Sales period">
          ${SALES_RANGES.map((days) => html`
            <button class="segmented__option ${days === salesDays ? 'is-active' : ''}" type="button"
              data-action="sales-range" data-days="${days}" aria-pressed="${days === salesDays}">${days} days</button>`)}
        </div>
      </header>

      <div class="stats">
        ${salesStat('Sales booked', peso(report.booked), `${plural(report.bookings, 'booking')} taken`)}
        ${salesStat('Collected', peso(report.collected), report.change === null
          ? 'Nothing to compare with'
          : html`<span class="stat__change stat__change--${changeTone}">${report.change > 0 ? '▲' : report.change < 0 ? '▼' : '='} ${Math.abs(report.change)}%</span> vs the ${report.days} days before`, changeTone === 'down' ? '' : '')}
        ${salesStat('Average booking', peso(report.averageBooking), 'Per booking taken')}
        ${salesStat('Still to collect', peso(report.outstanding), 'On these bookings', report.outstanding ? 'warn' : '')}
      </div>

      <div class="sales__grid">
        <section class="panel sales__trend">
          <header class="panel__head">
            <h3 class="panel__title">Trend</h3>
            <p class="chart__legend small muted">
              <span class="chart__key chart__key--booked"></span>Booked
              <span class="chart__key chart__key--collected"></span>Collected
            </p>
          </header>
          ${salesChart(report)}
        </section>

        <section class="panel">
          <header class="panel__head"><h3 class="panel__title">What sold</h3></header>
          ${breakdown(report.byProduct, 'No bookings taken in this window.', 'blue')}
        </section>

        <section class="panel">
          <header class="panel__head"><h3 class="panel__title">How guests paid</h3></header>
          ${breakdown(report.byMethod, 'No payments in this window.', 'green')}
        </section>
      </div>
    </section>`;
}

export function render(ctx: DeskContext): SafeHTML {
  const { state, staff } = ctx;
  const today = state.meta.asOf;
  const horizon = addDays(today, LOOKAHEAD_DAYS);
  const canWrite = ctx.can('bookings.write');

  const todays = state.bookings.filter((b) => b.date === today && isActive(b) && b.product !== 'event');
  const arriving = todays.filter((b) => ['hold', 'confirmed'].includes(b.status));
  const inHouse = state.bookings.filter((b) => b.status === 'checked_in');
  const collected = state.payments.filter((p) => p.receivedAt.startsWith(today)).reduce((sum, p) => sum + p.amount, 0);
  const upcoming = state.bookings
    .filter((b) => isActive(b) && b.date > today && b.date <= horizon)
    .slice(0, 6);
  const balancesDue = state.bookings
    .filter((b) => isActive(b) && b.status !== 'checked_out' && b.date >= today)
    .reduce((sum, b) => sum + b.balance, 0);
  const closedFor = closingEvent(state, today);
  const attention = attentionItems(ctx);
  const recent = state.activityLog.slice(0, 6);

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

    <div class="metrics">
      ${metric('Arriving today', arriving.length, plural(arriving.reduce((sum, b) => sum + b.adults + b.kids, 0), 'guest'))}
      ${metric('In house', inHouse.length, 'Checked in now')}
      ${poolMetric(state, 'daytour')}
      ${poolMetric(state, 'overnight')}
      ${metric('Collected today', peso(collected))}
      ${metric('Balances due', peso(balancesDue), 'Today and upcoming', balancesDue ? 'warn' : '')}
    </div>

    ${salesSection(ctx)}

    <div class="dashboard-grid">
      <section class="panel dashboard-grid__arriving">
        <header class="panel__head">
          <h2 class="panel__title">Arriving today</h2>
          <span class="panel__count">${arriving.length}</span>
        </header>
        ${arriving.length ? html`
          <ul class="rows">
            ${arriving.map((b) => guestRow(ctx, b, canWrite
              ? html`<button class="btn btn--secondary btn--sm" type="button" data-action="open-booking" data-id="${b.id}">Check in</button>`
              : statusPill(b)))}
          </ul>` : emptyState('No more arrivals today', 'Walk-ins can be added with New booking.')}
      </section>

      <section class="panel dashboard-grid__attention">
        <header class="panel__head">
          <h2 class="panel__title">Needs attention</h2>
          <span class="panel__count">${attention.length}</span>
        </header>
        ${attention.length ? html`<ul class="attention">${attention}</ul>` : emptyState('All clear', 'No holds, balances or open inquiries.')}
      </section>

      <section class="panel dashboard-grid__inhouse">
        <header class="panel__head">
          <h2 class="panel__title">In house</h2>
          <span class="panel__count">${inHouse.length}</span>
        </header>
        ${inHouse.length ? html`
          <ul class="rows">
            ${inHouse.map((b) => guestRow(ctx, b, canWrite
              ? html`<button class="btn btn--secondary btn--sm" type="button" data-action="check-out" data-id="${b.id}">Check out</button>`
              : statusPill(b)))}
          </ul>` : emptyState('Nobody checked in yet', 'Guests appear here after check-in.')}
      </section>

      <section class="panel dashboard-grid__upcoming">
        <header class="panel__head">
          <h2 class="panel__title">Next ${LOOKAHEAD_DAYS} days</h2>
          <a class="small" href="#/calendar">Open calendar</a>
        </header>
        ${upcoming.length ? html`
          <ul class="rows">
            ${upcoming.map((b) => html`
              <li class="row">
                ${kindDot(state, b.product)}
                <button class="row__main" type="button" data-action="open-booking" data-id="${b.id}">
                  <span class="row__title">${b.guestName}</span>
                  <span class="row__meta">${productLabel(state, b.product)} · ${formatDate(b.date)}</span>
                </button>
                <span class="row__badges">${paymentPill(b)}</span>
              </li>`)}
          </ul>` : emptyState('Nothing booked yet', 'The week ahead is open.')}
      </section>

      <section class="panel dashboard-grid__activity">
        <header class="panel__head"><h2 class="panel__title">Recent activity</h2></header>
        <ul class="timeline">
          ${recent.map((entry) => html`
            <li>
              <span>${ACTIVITY_LABELS[entry.action] ?? entry.action}${entry.detail ? ` · ${entry.detail}` : ''}</span>
              <span class="small muted">${formatDateTime(entry.at)} · ${entry.staffId ? findStaff(state, entry.staffId)?.name ?? 'Removed account' : 'System'}</span>
            </li>`)}
        </ul>
      </section>
    </div>`;
}

export const actions: HandlerMap = {
  'sales-range': ({ el, ctx }) => {
    salesDays = Number(el.dataset.days) || SALES_RANGES[0];
    ctx.redraw();
  },

  'check-out': ({ el, ctx }) => {
    const booking = checkOut(el.dataset.id ?? '', ctx.staff.id);
    const unit = findUnit(ctx.state, booking.product);
    ctx.toast(`${booking.guestName} checked out${unit ? ` · ${unit.name} is free again` : ''}`);
  },
};
