// Today: the front desk's morning view of arrivals, guests in house, money
// and anything that needs attention.

import { checkOut } from '../../core/actions.js';
import { html } from '../../core/dom.js';
import { formatDate, peso, plural, timeOf } from '../../core/format.js';
import {
  closingEvent, findSession, findUnit, isActive, poolGuests, productLabel,
} from '../../core/rules.js';
import { kindDot, paymentPill, statusPill } from '../components/badges.js';
import { icon } from '../components/icons.js';
import { emptyState, pageHead } from '../layout.js';

const MAX_HOLDS_SHOWN = 3;

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
  const { state } = ctx;
  return html`
    <li class="row">
      ${kindDot(state, booking.product)}
      <button class="row__main" type="button" data-action="open-booking" data-id="${booking.id}">
        <span class="row__title">${booking.guestName}</span>
        <span class="row__meta">${productLabel(state, booking.product)} · ${timeOf(booking.startsAt)} · ${plural(booking.adults + booking.kids, 'guest')}</span>
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

  const hiddenHolds = holds.length - MAX_HOLDS_SHOWN;
  if (hiddenHolds > 0) {
    items.push(html`
      <li>
        <a class="attention__item" href="#/bookings">
          ${icon('wallet')}
          <span><strong>${plural(hiddenHolds, 'more booking')}</strong> on hold without a deposit</span>
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

  const maintenance = state.housekeeping.filter((entry) => entry.status === 'maintenance');
  if (maintenance.length && ctx.canView('housekeeping')) {
    items.push(html`
      <li>
        <a class="attention__item" href="#/housekeeping">
          ${icon('alert')}
          <span><strong>${plural(maintenance.length, 'area')}</strong> under maintenance</span>
        </a>
      </li>`);
  }

  return items;
}

export function render(ctx) {
  const { state, staff } = ctx;
  const today = state.meta.asOf;
  const canWrite = ctx.can('bookings.write');

  const todays = state.bookings.filter((b) => b.date === today && isActive(b) && b.product !== 'event');
  const arriving = todays.filter((b) => ['hold', 'confirmed'].includes(b.status));
  const inHouse = state.bookings.filter((b) => b.status === 'checked_in');
  const collected = state.payments.filter((p) => p.receivedAt.startsWith(today)).reduce((sum, p) => sum + p.amount, 0);
  const balancesDue = state.bookings
    .filter((b) => isActive(b) && b.status !== 'checked_out' && b.date >= today)
    .reduce((sum, b) => sum + b.balance, 0);
  const closedFor = closingEvent(state, today);
  const attention = attentionItems(ctx);

  return html`
    ${pageHead({
      eyebrow: greeting(staff),
      title: formatDate(today, 'long'),
      subtitle: `${plural(todays.length, 'booking')} today`,
      actions: canWrite ? html`<button class="btn btn--primary" type="button" data-action="new-booking">${icon('plus')} New booking</button>` : '',
    })}

    ${closedFor ? html`<p class="notice notice--event">V6M is closed today for ${closedFor.title}.</p>` : ''}

    <div class="metrics">
      ${metric('Still arriving', arriving.length, plural(arriving.reduce((sum, b) => sum + b.adults + b.kids, 0), 'guest'))}
      ${poolMetric(state, 'daytour')}
      ${poolMetric(state, 'overnight')}
      ${metric('Collected today', peso(collected))}
      ${metric('Balances due', peso(balancesDue), 'Today and upcoming', balancesDue ? 'warn' : '')}
    </div>

    <div class="today-grid">
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

      <section class="panel panel--wide">
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
    </div>`;
}

export const actions = {
  'check-out': ({ el, ctx }) => {
    const booking = checkOut(el.dataset.id, ctx.staff.id);
    const unit = findUnit(ctx.state, booking.product);
    ctx.toast(`${booking.guestName} checked out${unit ? ` · ${unit.name} marked for cleaning` : ''}`);
  },
};
