// The bell in the top bar, in two parts.
//
// New: what guests did lately (a receipt sent, a booking made from a link, a
// message in the inbox). Clear empties it for this account in this browser.
// Needs attention: what is still to be done (receipts to confirm first, then
// downpayments due, events owing…). It stays until the work is done; Clear
// leaves it alone.
//
// A receipt or booking opens that booking on the Bookings page, where the
// receipt can be confirmed or turned down. A receipt arriving while the desk
// is open also pops up in the corner with a chime (announcePayments).

import { html, type SafeHTML } from '../../core/dom.js';
import { addDays, formatDate, formatDateTime, peso, plural } from '../../core/format.js';
import { downpaymentDue, findBooking, isActive, liveEvents, pendingPaymentCheck, pendingPaymentChecks, productLabel } from '../../core/rules.js';
import { demoNow } from '../../core/actions.js';
import type { State, Staff, Timestamp } from '../../core/types.js';
import type { DeskContext, HandlerMap } from '../types.js';
import { chime } from './chime.js';
import { showBookingsOn } from '../views/bookings.js';
import { icon, type IconName } from './icons.js';
import { showToast } from './toast.js';

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

/** How far back New reaches, and how many it lists. */
const NEW_DAYS = 7;
const MAX_NEW = 15;

const CLEARED_KEY = 'v6m.notifsCleared';

interface Cleared {
  at: Timestamp;
  /** The demo's today when it was cleared: the demo moves its dates to today, so this moves with them. */
  asOf: string;
  /** What was cleared from that same minute, so something arriving later in it still shows. */
  keys: string[];
}

function readCleared(staff: Staff, state: State): Cleared | null {
  try {
    const all = JSON.parse(localStorage.getItem(CLEARED_KEY) ?? '{}') as Record<string, Cleared>;
    const saved = all[staff.id];
    if (!saved) return null;
    const days = Math.round((Date.parse(state.meta.asOf) - Date.parse(saved.asOf)) / 86_400_000);
    return { ...saved, keys: saved.keys ?? [], at: days ? `${addDays(saved.at.slice(0, 10), days)}${saved.at.slice(10)}` : saved.at };
  } catch {
    return null;
  }
}

function writeCleared(staff: Staff, cleared: Cleared): void {
  try {
    const all = JSON.parse(localStorage.getItem(CLEARED_KEY) ?? '{}') as Record<string, Cleared>;
    all[staff.id] = cleared;
    localStorage.setItem(CLEARED_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: the list empties for this visit only.
  }
}

/** Cleared this visit even if storage is blocked. */
let clearedNow: Cleared | null = null;

interface News extends Alert {
  at: Timestamp;
  /** Which record it is about, e.g. "check:PC-0001". */
  key: string;
}

/** Hidden by the last Clear: older than it, or from its minute and in the list then. */
const isCleared = (entry: News, cleared: Cleared | null): boolean =>
  !!cleared && (entry.at < cleared.at || (entry.at === cleared.at && cleared.keys.includes(entry.key)));

/** What guests did lately, newest first, since this account last cleared the list. */
export function newsFor(ctx: DeskContext): News[] {
  const { state } = ctx;
  const now = demoNow(state);
  const saved = readCleared(ctx.staff, state);
  const cleared = [saved, clearedNow].filter((item): item is Cleared => !!item).sort((a, b) => a.at.localeCompare(b.at)).pop() ?? null;
  const from = `${addDays(state.meta.asOf, -NEW_DAYS)}T00:00:00+08:00`;
  const news: News[] = [];

  for (const check of state.paymentChecks) {
    const booking = findBooking(state, check.bookingId);
    if (!booking) continue;
    news.push({
      at: check.sentAt, key: `check:${check.id}`, icon: 'wallet', lead: booking.guestName,
      text: `sent ${peso(check.amount)} by GCash for ${productLabel(state, booking.product)} on ${formatDate(booking.date)}`,
      bookingId: booking.id,
    });
  }

  for (const link of state.bookingLinks) {
    const booking = link.status === 'used' && link.usedAt ? findBooking(state, link.bookingId) : undefined;
    if (!booking || !link.usedAt) continue;
    news.push({
      at: link.usedAt, key: `link:${link.id}`, icon: 'link', lead: booking.guestName,
      text: `booked ${productLabel(state, booking.product)} on ${formatDate(booking.date)} through a booking link`,
      bookingId: booking.id,
    });
  }

  if (ctx.canView('inbox')) {
    for (const inquiry of state.inquiries) {
      news.push({ at: inquiry.receivedAt, key: `inquiry:${inquiry.id}`, icon: 'message', lead: inquiry.from, text: `sent a message: ${inquiry.topic}`, href: '#/inbox' });
    }
  }

  return news
    .filter((entry) => !isCleared(entry, cleared) && entry.at >= from && entry.at <= now)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_NEW)
    .map((entry) => ({ ...entry, meta: formatDateTime(entry.at) }));
}

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
      meta: `From ${check.senderName} · ${formatDateTime(check.sentAt)}`,
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
  const news = newsFor(ctx);
  const alerts = alertsFor(ctx);
  const payments = alerts.filter((alert) => alert.tone === 'payment').length;
  const total = news.length + alerts.length;
  const label = total
    ? [news.length ? `${news.length} new` : '', alerts.length ? `${alerts.length} need attention` : '', payments ? `${plural(payments, 'payment')} to confirm` : '']
      .filter(Boolean).join(', ')
    : 'No notifications';
  return html`
    <div class="notif" data-alerts>
      <button class="notif__bell ${payments ? 'has-payments' : ''}" type="button" data-action="toggle-alerts"
        aria-expanded="${open ? 'true' : 'false'}" aria-controls="notif-panel" aria-label="${label}" title="${label}">
        ${icon('bell')}
        ${total ? html`<span class="notif__count" aria-hidden="true">${total > 99 ? '99+' : total}</span>` : ''}
      </button>
      ${open ? html`
        <div class="notif__panel" id="notif-panel" role="region" aria-label="Notifications">
          <div class="notif__scroll">
            <div class="notif__head">
              <strong>New</strong>
              ${news.length ? html`<button class="btn btn--quiet btn--sm" type="button" data-action="clear-notifs">Clear</button>` : ''}
            </div>
            ${news.length
              ? html`<ul class="notif__list">${news.map(item)}</ul>`
              : html`<p class="notif__empty">No new notifications.</p>`}
            <div class="notif__head notif__head--section">
              <strong>Needs attention</strong>
              ${payments ? html`<span class="small muted">${plural(payments, 'payment')} to confirm</span>` : ''}
            </div>
            ${alerts.length
              ? html`<ul class="notif__list">${alerts.map(item)}</ul>`
              : html`<p class="notif__empty">All caught up. Nothing needs you right now.</p>`}
          </div>
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

/** Goes to the booking's day on the Bookings page and opens the booking there. */
export function goToBooking(ctx: DeskContext, bookingId: string): void {
  open = false;
  const booking = findBooking(ctx.state, bookingId);
  if (!booking) {
    ctx.redraw();
    return;
  }
  if (ctx.canView('bookings')) showBookingsOn(booking.date);
  ctx.redraw(); // already on Bookings, the hash does not change
  ctx.openBooking(booking.id);
}

/** Receipts already seen by this desk; null until the first look after signing in. */
let seenChecks: Set<string> | null = null;

/** Forget what was seen, so signing in again does not announce what was already waiting. */
export function resetPaymentWatch(): void {
  seenChecks = null;
  clearedNow = null;
}

/**
 * Pops up each receipt that arrived since the last look, with one chime.
 * What was already waiting when the desk opened is only in the bell.
 * @param open opens a booking with the desk's current context
 */
export function announcePayments(state: State, open: (bookingId: string) => void): void {
  const pending = pendingPaymentChecks(state);
  if (!seenChecks) {
    seenChecks = new Set(pending.map((check) => check.id));
    return;
  }
  const fresh = pending.filter((check) => !seenChecks?.has(check.id));
  if (!fresh.length) return;
  for (const check of fresh) {
    seenChecks.add(check.id);
    const booking = findBooking(state, check.bookingId);
    if (!booking) continue;
    showToast(`${booking.guestName} sent ${peso(check.amount)} by GCash for ${formatDate(booking.date)}. Click to check it.`, 'warning', {
      icon: 'wallet',
      stayMs: 15000,
      onClick: () => open(booking.id),
    });
  }
  chime();
}

export const alertActions: HandlerMap = {
  'toggle-alerts': ({ ctx }) => {
    open = !open;
    ctx.redraw();
    if (open) document.querySelector<HTMLElement>('.notif__item')?.focus();
  },

  // Empties New only; Needs attention stays until the work is done.
  'clear-notifs': ({ ctx }) => {
    const at = demoNow(ctx.state);
    const keys = newsFor(ctx).filter((entry) => entry.at === at).map((entry) => entry.key);
    clearedNow = { at, asOf: ctx.state.meta.asOf, keys };
    writeCleared(ctx.staff, clearedNow);
    ctx.redraw();
    document.querySelector<HTMLElement>('.notif__bell')?.focus();
  },

  // A link inside the list: let it navigate, and fold the list away after.
  'alert-close': ({ ctx }) => {
    open = false;
    setTimeout(ctx.redraw);
  },

  'alert-open': ({ el, ctx }) => goToBooking(ctx, el.dataset.id ?? ''),
};
