// Dashboard: how the resort is doing right now — money, occupancy, what needs
// attention, who arrives today and what is coming up.

import { checkOut } from '../../core/actions.js';
import { html } from '../../core/dom.js';
import { addDays, formatDate, formatDateTime, peso, plural, timeOf } from '../../core/format.js';
import {
  closingEvent, findSession, findStaff, findUnit, isActive, poolGuests, productLabel,
} from '../../core/rules.js';
import { kindDot, paymentPill, statusPill } from '../components/badges.js';
import { icon } from '../components/icons.js';
import { emptyState, pageHead } from '../layout.js';

const MAX_HOLDS_SHOWN = 3;
const LOOKAHEAD_DAYS = 7;

const ACTIVITY_LABELS = {
  'booking.created': 'Booking created',
  'booking.checked_in': 'Checked in',
  'booking.checked_out': 'Checked out',
  'booking.cancelled': 'Booking cancelled',
  'payment.recorded': 'Payment recorded',
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

function greeting(staff) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${staff.name.split(' ')[0]}`;
}

function metric(label, value, detail, tone = '') {
  return html`
    <div class="metric ${tone ? `metric--${tone}` : ''}">
      <span class="metric__label">${label}</span>
      <span class="metric__value">${value}</span>
      ${detail ? html`<span class="metric__detail">${detail}</span>` : ''}
    </div>`;
}

function poolMetric(state, sessionId) {
  const session = findSession(state, sessionId);
  const guests = poolGuests(state, state.meta.asOf, sessionId);
  const percent = Math.min(100, Math.round((guests / session.capacity) * 100));
  return html`
    <div class="metric">
      <span class="metric__label">${session.label} pool</span>
      <span class="metric__value">${guests}<small>/${session.capacity}</small></span>
      <span class="meter" role="img" aria-label="${percent}% full"><span style="width:${percent}%"></span></span>
    </div>`;
}

function guestRow(ctx, booking, actionButton) {
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

function attentionItems(ctx) {
  const { state } = ctx;
  const today = state.meta.asOf;
  const items = [];

  const holds = state.bookings.filter((b) => b.status === 'hold' && b.date >= today);
  holds.slice(0, MAX_HOLDS_SHOWN).forEach((b) => items.push(html`
    <li>
      <button class="attention__item" type="button" data-action="open-booking" data-id="${b.id}">
        ${icon('wallet')}
        <span><strong>${b.guestName}</strong> has no deposit yet for ${productLabel(state, b.product)} on ${formatDate(b.date)}</span>
      </button>
    </li>`));

  if (holds.length > MAX_HOLDS_SHOWN) {
    items.push(html`
      <li>
        <a class="attention__item" href="#/bookings">
          ${icon('wallet')}
          <span><strong>${plural(holds.length - MAX_HOLDS_SHOWN, 'more booking')}</strong> on hold without a deposit</span>
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

/** Revenue collected per day for the last week, as a small bar chart. */
function revenueChart(state) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(state.meta.asOf, index - 6));
  const totals = days.map((day) => state.payments
    .filter((payment) => payment.receivedAt.startsWith(day))
    .reduce((sum, payment) => sum + payment.amount, 0));
  const peak = Math.max(1, ...totals);

  return html`
    <div class="chart" role="img" aria-label="Payments collected over the last seven days">
      ${days.map((day, index) => html`
        <div class="chart__col">
          <div class="chart__bar-track">
            <div class="chart__bar" style="height:${Math.round((totals[index] / peak) * 100)}%" title="${formatDate(day)} · ${peso(totals[index])}"></div>
          </div>
          <span class="chart__label ${day === state.meta.asOf ? 'is-today' : ''}">${formatDate(day, 'weekday')}</span>
        </div>`)}
    </div>
    <p class="small muted">Collected in the last 7 days: ${peso(totals.reduce((sum, value) => sum + value, 0))}</p>`;
}

export function render(ctx) {
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
        <button class="btn btn--secondary" type="button" data-action="new-booking-link">${icon('link')} Send booking link</button>
        <button class="btn btn--primary" type="button" data-action="new-booking">${icon('plus')} New booking</button>` : '',
    })}

    ${closedFor ? html`<p class="notice notice--event">V6M is closed today for ${closedFor.title}.</p>` : ''}

    <div class="metrics">
      ${metric('Arriving today', arriving.length, plural(arriving.reduce((sum, b) => sum + b.adults + b.kids, 0), 'guest'))}
      ${metric('In house', inHouse.length, 'Checked in now')}
      ${poolMetric(state, 'daytour')}
      ${poolMetric(state, 'overnight')}
      ${metric('Collected today', peso(collected))}
      ${metric('Balances due', peso(balancesDue), 'Today and upcoming', balancesDue ? 'warn' : '')}
    </div>

    <div class="dashboard-grid">
      <section class="panel">
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

      <section class="panel">
        <header class="panel__head">
          <h2 class="panel__title">Needs attention</h2>
          <span class="panel__count">${attention.length}</span>
        </header>
        ${attention.length ? html`<ul class="attention">${attention}</ul>` : emptyState('All clear', 'No holds, balances or open inquiries.')}
      </section>

      <section class="panel">
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

      <section class="panel">
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

      <section class="panel">
        <header class="panel__head"><h2 class="panel__title">Payments this week</h2></header>
        ${revenueChart(state)}
      </section>

      <section class="panel">
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

export const actions = {
  'check-out': ({ el, ctx }) => {
    const booking = checkOut(el.dataset.id, ctx.staff.id);
    const unit = findUnit(ctx.state, booking.product);
    ctx.toast(`${booking.guestName} checked out${unit ? ` · ${unit.name} is free again` : ''}`);
  },
};
