// The bell in the top bar: everything that needs someone's attention, newest
// worries first. GCash receipts waiting to be checked come first; choosing one
// goes to that booking on the Bookings page and opens it, where the receipt
// can be confirmed or turned down.

import { html, type SafeHTML } from '../../core/dom.js';
import { addDays, formatDate, formatDateTime, peso, plural } from '../../core/format.js';
import { downpaymentDue, findBooking, isActive, liveEvents, pendingPaymentCheck, pendingPaymentChecks, productLabel } from '../../core/rules.js';
import type { DeskContext, HandlerMap } from '../types.js';
import { showBookingsOn } from '../views/bookings.js';
import { icon, type IconName } from './icons.js';

const MAX_HOLDS_SHOWN = 3;

interface Alert {
  icon: IconName;
  /** Bold lead-in, then the rest of the line. */
  lead: string;
  text: string;
  /** A smaller second line. */
  meta?: string;
  /** Opens this booking; otherwise the link. */
  bookingId?: string;
  href?: string;
  tone?: 'payment';
}

let open = false;

export function alertsFor(ctx: DeskContext): Alert[] {
  const { state } = ctx;
  const today = state.meta.asOf;
  const alerts: Alert[] = [];

  for (const check of pendingPaymentChecks(state)) {
    const booking = findBooking(state, check.bookingId);
    if (!booking) continue;
    alerts.push({
      icon: 'wallet',
      lead: 'Payment to confirm',
      text: `${booking.guestName} sent ${peso(check.amount)} by GCash for ${productLabel(state, booking.product)} on ${formatDate(booking.date)}`,
      meta: `Ref ${check.reference} · ${formatDateTime(check.sentAt)}`,
      bookingId: booking.id,
      tone: 'payment',
    });
  }

  // Holds whose receipt is already waiting are listed above instead.
  const holds = state.bookings.filter((b) => b.status === 'hold' && b.date >= today && !pendingPaymentCheck(state, b.id));
  holds.slice(0, MAX_HOLDS_SHOWN).forEach((b) => alerts.push({
    icon: 'wallet',
    lead: b.guestName,
    text: `${b.paid ? `still owes ${peso(downpaymentDue(b))} of the downpayment` : 'has not paid the downpayment'} for ${productLabel(state, b.product)} on ${formatDate(b.date)}`,
    bookingId: b.id,
  }));
  if (holds.length > MAX_HOLDS_SHOWN) {
    alerts.push({ icon: 'wallet', lead: plural(holds.length - MAX_HOLDS_SHOWN, 'more booking'), text: 'on hold, downpayment due', href: '#/bookings' });
  }

  const upcomingEvent = liveEvents(state).find((event) => event.bookingId && event.date >= today);
  const eventBooking = upcomingEvent && state.bookings.find((b) => b.id === upcomingEvent.bookingId);
  if (upcomingEvent && eventBooking && eventBooking.balance > 0 && isActive(eventBooking)) {
    alerts.push({
      icon: 'sparkles', lead: upcomingEvent.title, text: `on ${formatDate(upcomingEvent.date)} still owes ${peso(eventBooking.balance)}`, bookingId: eventBooking.id,
    });
  }

  const nextExclusive = state.bookings.find((b) => isActive(b) && b.productType === 'exclusive' && b.date >= today && b.date <= addDays(today, 14));
  if (nextExclusive) {
    alerts.push({
      icon: 'sparkles',
      lead: 'Exclusive rental',
      text: `on ${formatDate(nextExclusive.date)}: ${nextExclusive.guestName}, ${productLabel(state, nextExclusive.product)}. Other bookings are closed then.`,
      bookingId: nextExclusive.id,
    });
  }

  const newInquiries = state.inquiries.filter((inquiry) => inquiry.status === 'new').length;
  if (newInquiries && ctx.canView('inbox')) {
    alerts.push({ icon: 'message', lead: plural(newInquiries, 'new inquiry', 'new inquiries'), text: 'waiting for a reply', href: '#/inbox' });
  }

  const openLinks = state.bookingLinks.filter((link) => link.status === 'sent' && link.expiresAt >= today).length;
  if (openLinks) {
    alerts.push({ icon: 'link', lead: plural(openLinks, 'booking link'), text: 'sent and not filled in yet', href: '#/bookings' });
  }

  return alerts;
}

function item(alert: Alert, index: number): SafeHTML {
  const body = html`
    ${icon(alert.icon)}
    <span class="notif__text">
      <span><strong>${alert.lead}</strong> ${alert.text}</span>
      ${alert.meta ? html`<span class="notif__meta">${alert.meta}</span>` : ''}
    </span>
    ${alert.tone === 'payment' ? html`<span class="pill pill--warning">Check</span>` : ''}`;
  const className = `notif__item ${alert.tone ? `notif__item--${alert.tone}` : ''}`;
  return html`
    <li>
      ${alert.bookingId
        ? html`<button class="${className}" type="button" data-action="alert-open" data-index="${index}" data-id="${alert.bookingId}">${body}</button>`
        : html`<a class="${className}" href="${alert.href ?? '#/'}" data-action="alert-close">${body}</a>`}
    </li>`;
}

/** The bell and, while it is open, the list under it. */
export function alertBell(ctx: DeskContext): SafeHTML {
  const alerts = alertsFor(ctx);
  const payments = alerts.filter((alert) => alert.tone === 'payment').length;
  const label = alerts.length
    ? `${plural(alerts.length, 'notification')}${payments ? `, ${plural(payments, 'payment')} to confirm` : ''}`
    : 'No notifications';
  return html`
    <div class="notif" data-alerts>
      <button class="notif__bell ${payments ? 'has-payments' : ''}" type="button" data-action="toggle-alerts"
        aria-expanded="${open ? 'true' : 'false'}" aria-controls="notif-panel" aria-label="${label}" title="${label}">
        ${icon('bell')}
        ${alerts.length ? html`<span class="notif__count" aria-hidden="true">${alerts.length > 99 ? '99+' : alerts.length}</span>` : ''}
      </button>
      ${open ? html`
        <div class="notif__panel" id="notif-panel" role="region" aria-label="Notifications">
          <div class="notif__head">
            <strong>Notifications</strong>
            ${payments ? html`<span class="small muted">${plural(payments, 'payment')} to confirm</span>` : ''}
          </div>
          ${alerts.length
            ? html`<ul class="notif__list">${alerts.map(item)}</ul>`
            : html`<p class="notif__empty">All caught up. Nothing needs you right now.</p>`}
        </div>` : ''}
    </div>`;
}

export const isAlertsOpen = (): boolean => open;

/** Folds the list away; the caller redraws. */
export function closeAlerts(): boolean {
  const was = open;
  open = false;
  return was;
}

export const alertActions: HandlerMap = {
  'toggle-alerts': ({ ctx }) => {
    open = !open;
    ctx.redraw();
    if (open) document.querySelector<HTMLElement>('.notif__item')?.focus();
  },

  // A link inside the list: let it navigate, and fold the list away after.
  'alert-close': ({ ctx }) => {
    open = false;
    setTimeout(ctx.redraw);
  },

  'alert-open': ({ el, ctx }) => {
    open = false;
    const booking = findBooking(ctx.state, el.dataset.id);
    if (!booking) {
      ctx.redraw();
      return;
    }
    // Go to the booking's day on the Bookings page, then open it there.
    if (ctx.canView('bookings')) showBookingsOn(booking.date);
    ctx.redraw(); // already on Bookings, the hash does not change
    ctx.openBooking(booking.id);
  },
};
