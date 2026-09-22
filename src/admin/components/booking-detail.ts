// Booking detail drawer: summary, price, payments, and the actions staff can
// take (record payment, check in, check out, cancel).

import { cancelBooking, checkIn, checkOut, recordPayment } from '../../core/actions.js';
import { $, $maybe, html, type SafeHTML, type TemplateValue } from '../../core/dom.js';
import { formatDate, formatDateTime, peso, plural, timeOf } from '../../core/format.js';
import {
  METHOD_LABELS, SOURCE_LABELS, findBooking, findGuest, findPackage, findStaff, isActive, productLabel,
} from '../../core/rules.js';
import type { Booking, PaymentMethod, State } from '../../core/types.js';
import type { DeskContext, DrawerContent } from '../types.js';
import { kindDot, paymentPill, stagePill, statusPill } from './badges.js';
import { downloadBookingPdf } from './booking-pdf.js';
import { icon } from './icons.js';

const ACTIVITY_LABELS: Record<string, string> = {
  'booking.created': 'Booking created',
  'booking.checked_in': 'Checked in',
  'booking.checked_out': 'Checked out',
  'booking.cancelled': 'Cancelled',
  'payment.recorded': 'Payment recorded',
};

const CANCEL_REASONS = ['Change of plans', 'Guest request', 'Typhoon or weather', 'Duplicate booking', 'Other'];

const methodOptions = (selected: PaymentMethod): SafeHTML[] => (['gcash', 'cash', 'bank_transfer'] as const).map((method) =>
  html`<option value="${method}" ${method === selected ? 'selected' : ''}>${METHOD_LABELS[method]}</option>`);

function guestsText(booking: Booking): string {
  const parts = [plural(booking.adults, 'adult')];
  if (booking.kids) parts.push(plural(booking.kids, 'kid'));
  return parts.join(', ');
}

function facts(state: State, booking: Booking): SafeHTML {
  const guest = findGuest(state, booking.guestId);
  const event = booking.eventId ? state.events.find((item) => item.id === booking.eventId) : undefined;
  const pkg = event ? findPackage(state, event.packageId) : undefined;

  const rows: [string, TemplateValue][] = [
    ['Booking', html`<span class="inline-kind">${kindDot(state, booking.product)} ${event ? event.title : productLabel(state, booking.product)}</span>`],
    ['When', html`${formatDate(booking.date, 'long')}<br><span class="muted">${timeOf(booking.startsAt)} – ${timeOf(booking.endsAt)}${booking.endsAt.slice(0, 10) !== booking.date ? ' next day' : ''}</span>`],
    ['Guests', guestsText(booking)],
    ['Source', SOURCE_LABELS[booking.source] ?? booking.source],
    ['Mobile', guest?.mobile ?? '—'],
  ];
  if (pkg && event) rows.push(['Package', html`${pkg.name} ${stagePill(event.stage)}`]);
  if (booking.pets) rows.push(['Pets', `${booking.pets.count} ${booking.pets.type}, rules acknowledged`]);
  if (booking.notes) rows.push(['Notes', booking.notes]);
  if (booking.cancelReason) rows.push(['Cancelled', booking.cancelReason]);

  return html`
    <dl class="facts">
      ${rows.map(([label, value]) => html`<div class="facts__row"><dt>${label}</dt><dd>${value}</dd></div>`)}
    </dl>`;
}

function priceSection(booking: Booking): SafeHTML {
  const { pricing } = booking;
  return html`
    <section class="detail-section">
      <h3 class="detail-section__title">Price</h3>
      <dl class="line-items">
        ${pricing.lines.map((line) => html`
          <div class="line-items__row">
            <dt>${line.label} <span class="muted">${line.qty} × ${peso(line.unitPrice)}</span></dt>
            <dd>${peso(line.amount)}</dd>
          </div>`)}
        ${pricing.discount ? html`
          <div class="line-items__row line-items__row--discount">
            <dt>Promo ${pricing.promoId}</dt><dd>−${peso(pricing.discount)}</dd>
          </div>` : ''}
        <div class="line-items__row line-items__row--total"><dt>Total</dt><dd>${peso(booking.total)}</dd></div>
        <div class="line-items__row"><dt>Paid</dt><dd>${peso(booking.paid)}</dd></div>
        <div class="line-items__row line-items__row--balance ${booking.balance > 0 && isActive(booking) ? 'is-due' : ''}">
          <dt>Balance</dt><dd>${peso(booking.balance)}</dd>
        </div>
      </dl>
      ${booking.balance > 0 && booking.paid < booking.depositRequired && isActive(booking)
        ? html`<p class="small muted">Required deposit: ${peso(booking.depositRequired)}</p>` : ''}
    </section>`;
}

function paymentsSection(state: State, booking: Booking): SafeHTML | '' {
  const payments = state.payments.filter((payment) => payment.bookingId === booking.id);
  if (!payments.length) return '';
  return html`
    <section class="detail-section">
      <h3 class="detail-section__title">Payments</h3>
      <ul class="plain-list">
        ${payments.map((payment) => html`
          <li class="plain-list__row">
            <span>
              <strong>${peso(payment.amount)}</strong> ${METHOD_LABELS[payment.method]} · ${payment.type}
              <span class="small muted">${formatDateTime(payment.receivedAt)}${payment.receivedBy ? ` · ${findStaff(state, payment.receivedBy)?.name}` : ''}</span>
            </span>
            ${payment.reference ? html`<span class="small muted mono">${payment.reference}</span>` : ''}
          </li>`)}
      </ul>
    </section>`;
}

function activitySection(state: State, booking: Booking): SafeHTML | '' {
  const entries = state.activityLog.filter((entry) => entry.ref === booking.id).slice(0, 6);
  if (!entries.length) return '';
  return html`
    <section class="detail-section">
      <h3 class="detail-section__title">Activity</h3>
      <ul class="timeline">
        ${entries.map((entry) => html`
          <li>
            <span>${ACTIVITY_LABELS[entry.action] ?? entry.action}${entry.detail ? ` · ${entry.detail}` : ''}</span>
            <span class="small muted">${formatDateTime(entry.at)} · ${entry.staffId ? findStaff(state, entry.staffId)?.name : 'System'}</span>
          </li>`)}
      </ul>
    </section>`;
}

export function createBookingDetail(bookingId: string): DrawerContent {
  const ui: { checkInOpen: boolean; confirmCancel: boolean; errors: { checkIn?: string; payment?: string } } = {
    checkInOpen: false, confirmCancel: false, errors: {},
  };

  function actionsSection(ctx: DeskContext, booking: Booking): SafeHTML | '' {
    const { state } = ctx;
    const parts: SafeHTML[] = [];
    const isToday = booking.date === state.meta.asOf;
    const canArrive = ['hold', 'confirmed'].includes(booking.status);

    if (canArrive && ctx.can('bookings.write')) {
      if (!isToday) {
        parts.push(html`<p class="small muted">Check-in opens on ${formatDate(booking.date, 'long')}.</p>`);
      } else if (!ui.checkInOpen) {
        parts.push(html`<button class="btn btn--primary btn--block" type="button" data-action="start-check-in">Check in guest</button>`);
      } else {
        parts.push(html`
          <div class="action-card">
            <h4 class="action-card__title">Check in ${booking.guestName}</h4>
            <label class="checkbox"><input type="checkbox" name="idChecked"> Valid ID checked</label>
            ${booking.balance > 0 ? html`
              <label class="field">
                <span class="field__label">Collect balance of ${peso(booking.balance)} via</span>
                <select class="input" name="checkInMethod">${methodOptions('cash')}</select>
              </label>` : html`<p class="small muted">Fully paid. Nothing to collect.</p>`}
            <p class="form-error">${ui.errors.checkIn}</p>
            <div class="button-row">
              <button class="btn btn--quiet" type="button" data-action="cancel-check-in">Not now</button>
              <button class="btn btn--primary" type="button" data-action="confirm-check-in">Confirm check-in</button>
            </div>
          </div>`);
      }
    }

    if (booking.status === 'checked_in' && ctx.can('bookings.write')) {
      parts.push(html`<button class="btn btn--primary btn--block" type="button" data-action="check-out">Check out guest</button>`);
    }

    if (isActive(booking) && booking.status !== 'checked_out' && booking.balance > 0 && ctx.can('payments.write') && !ui.checkInOpen) {
      parts.push(html`
        <form class="action-card" data-submit="record-payment" novalidate>
          <h4 class="action-card__title">Record a payment</h4>
          <div class="form-grid">
            <label class="field">
              <span class="field__label">Amount (₱)</span>
              <input class="input" name="amount" type="number" min="1" max="${booking.balance}" step="1" value="${booking.balance}" inputmode="numeric">
            </label>
            <label class="field">
              <span class="field__label">Method</span>
              <select class="input" name="method">${methodOptions('gcash')}</select>
            </label>
          </div>
          <label class="field">
            <span class="field__label">Reference (optional)</span>
            <input class="input" name="reference" placeholder="GCash or bank reference number">
          </label>
          <p class="form-error">${ui.errors.payment}</p>
          <button class="btn btn--secondary" type="submit">Record payment</button>
        </form>`);
    }

    if (canArrive && ctx.can('bookings.cancel')) {
      parts.push(ui.confirmCancel ? html`
        <div class="action-card action-card--danger">
          <h4 class="action-card__title">Cancel this booking?</h4>
          <label class="field">
            <span class="field__label">Reason</span>
            <select class="input" name="cancelReason">
              ${CANCEL_REASONS.map((reason) => html`<option>${reason}</option>`)}
            </select>
          </label>
          <p class="small muted">The slot opens up again. Payments already recorded stay on file.</p>
          <div class="button-row">
            <button class="btn btn--quiet" type="button" data-action="keep-booking">Keep booking</button>
            <button class="btn btn--danger" type="button" data-action="confirm-cancel">Cancel booking</button>
          </div>
        </div>` : html`
        <button class="btn btn--quiet btn--danger-text" type="button" data-action="ask-cancel">Cancel booking</button>`);
    }

    if (!parts.length) return '';
    return html`<section class="detail-section detail-actions">${parts}</section>`;
  }

  return {
    live: true,

    title: (ctx) => findBooking(ctx.state, bookingId)?.guestName ?? 'Booking',

    render(ctx) {
      const booking = findBooking(ctx.state, bookingId);
      if (!booking) return html`<p class="muted">This booking no longer exists.</p>`;
      return html`
        <div class="detail">
          <div class="detail__status">
            ${statusPill(booking)} ${paymentPill(booking)}
            <span class="small muted mono">${booking.id}</span>
          </div>

          <button class="btn btn--secondary btn--block" type="button" data-action="download-pdf">
            ${icon('download')} Download confirmation PDF
          </button>
          ${actionsSection(ctx, booking)}
          ${facts(ctx.state, booking)}
          ${priceSection(booking)}
          ${paymentsSection(ctx.state, booking)}
          ${activitySection(ctx.state, booking)}
        </div>`;
    },

    actions: {
      'download-pdf': ({ ctx }) => {
        const booking = findBooking(ctx.state, bookingId);
        if (!booking) return;
        downloadBookingPdf(ctx.state, booking);
        ctx.toast('Confirmation PDF downloaded');
      },

      'start-check-in': ({ redraw }) => {
        ui.checkInOpen = true;
        ui.errors = {};
        redraw();
      },

      'cancel-check-in': ({ redraw }) => {
        ui.checkInOpen = false;
        redraw();
      },

      'confirm-check-in': ({ root, ctx, redraw }) => {
        if (!$<HTMLInputElement>('[name="idChecked"]', root).checked) {
          ui.errors.checkIn = 'Check a valid ID first.';
          redraw();
          return;
        }
        const method = ($maybe<HTMLSelectElement>('[name="checkInMethod"]', root)?.value ?? 'cash') as PaymentMethod;
        const booking = findBooking(ctx.state, bookingId);
        if (!booking) return;
        const collected = booking.balance;
        ui.checkInOpen = false;
        ui.errors = {};
        checkIn(bookingId, { method }, ctx.staff.id);
        ctx.toast(`${booking.guestName} checked in${collected ? ` · collected ${peso(collected)}` : ''}`);
      },

      'check-out': ({ ctx }) => {
        const booking = checkOut(bookingId, ctx.staff.id);
        ctx.toast(`${booking.guestName} checked out`);
      },

      'record-payment': ({ el, ctx, redraw }) => {
        const booking = findBooking(ctx.state, bookingId);
        if (!booking) return;
        const form = el as HTMLFormElement;
        const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement).value;
        const amount = Math.round(Number(value('amount')));
        if (!(amount > 0)) {
          ui.errors.payment = 'Enter an amount above zero.';
          redraw();
          return;
        }
        if (amount > booking.balance) {
          ui.errors.payment = `That's more than the ${peso(booking.balance)} balance.`;
          redraw();
          return;
        }
        ui.errors = {};
        recordPayment(bookingId, {
          amount,
          method: value('method') as PaymentMethod,
          reference: value('reference').trim(),
        }, ctx.staff.id);
        ctx.toast(`${peso(amount)} recorded for ${booking.guestName}`);
      },

      'ask-cancel': ({ redraw }) => {
        ui.confirmCancel = true;
        redraw();
      },

      'keep-booking': ({ redraw }) => {
        ui.confirmCancel = false;
        redraw();
      },

      'confirm-cancel': ({ root, ctx }) => {
        const reason = $<HTMLSelectElement>('[name="cancelReason"]', root).value;
        ui.confirmCancel = false;
        const booking = cancelBooking(bookingId, reason, ctx.staff.id);
        ctx.toast(`${booking.guestName}'s booking was cancelled`);
      },
    },
  };
}
