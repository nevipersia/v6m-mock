// Booking detail drawer: summary, price, payments, and the actions staff can
// take (check a guest's GCash receipt, record payment, check in, check out, cancel).

import {
  REJECT_REASONS, applyDiscount, cancelBooking, checkIn, checkOut, confirmPaymentCheck, extendQuote, extendStay, payByQr, recordPayment,
  rejectPaymentCheck, removeDiscount, setGuestList,
} from '../../core/actions.js';
import { $, $maybe, html, type SafeHTML, type TemplateValue } from '../../core/dom.js';
import { blankCompanion, fitGuestList, guestListEditor, readGuestListField } from '../../core/guest-list.js';
import { blankPaymentCard, paymentCard, type PaymentCardState } from '../../core/payment-card.js';
import { appReferenceProblem, qrPaymentRequest, receiptWarnings, sampleReference } from '../../core/qr-payment.js';
import { formatDate, formatDateTime, peso, plural, stayText, timeOf } from '../../core/format.js';
import {
  METHOD_LABELS, canStayLonger, downpaymentName, SOURCE_LABELS, discountAmount, discountLabel, findBooking, stillToConfirm, isEditable, findGuest, findPackage, findStaff, isActive, pendingPaymentCheck,
  productLabel,
} from '../../core/rules.js';
import type { Booking, Companion, PaymentCheck, PaymentMethod, State } from '../../core/types.js';
import type { DeskContext, DrawerContent } from '../types.js';
import { kindDot, paymentPill, statusPill } from './badges.js';
import { downloadBookingPdf } from './booking-pdf.js';
import { blankDiscount, discountFields, readDiscountField, type DiscountDraft } from './discount-fields.js';
import { askConfirm } from './confirm.js';
import { icon } from './icons.js';

const ACTIVITY_LABELS: Record<string, string> = {
  'booking.created': 'Booking created',
  'booking.checked_in': 'Checked in',
  'booking.checked_out': 'Checked out',
  'booking.extended': 'Stay extended',
  'booking.cancelled': 'Cancelled',
  'payment.recorded': 'Payment recorded',
  'payment.check_sent': 'GCash receipt sent',
  'payment.check_confirmed': 'Receipt confirmed',
  'payment.check_rejected': 'Receipt rejected',
  'booking.confirmed': 'Confirmed',
  'booking.discounted': 'Discount given',
  'booking.discount_removed': 'Discount removed',
  'booking.unconfirmed': 'Back on hold',
  'booking.updated': 'Edited',
  'booking.guest_list': 'Guest list updated',
  'event.created': 'Event added',
  'event.booked': 'Event booked',
  'event.updated': 'Event changed',
  'event.removed': 'Inquiry removed',
  'event.done': 'Event done',
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
    ['When', booking.nights > 1
      ? html`${stayText(booking.date, booking.nights)}<br><span class="muted">In ${timeOf(booking.startsAt)}, out ${timeOf(booking.endsAt)}</span>`
      : html`${formatDate(booking.date, 'long')}<br><span class="muted">${timeOf(booking.startsAt)} – ${timeOf(booking.endsAt)}${booking.endsAt.slice(0, 10) !== booking.date ? ' next day' : ''}</span>`],
    ['Guests', guestsText(booking)],
    ['Source', SOURCE_LABELS[booking.source] ?? booking.source],
    ['Contact', guest?.mobile ?? '—'],
  ];
  if (guest?.email) rows.push(['Email', guest.email]);
  if (guest?.address) rows.push(['Address', guest.address]);
  if (booking.scPwd) rows.push(['SC / PWD', String(booking.scPwd)]);
  if (pkg && event) rows.push(['Package', pkg.name]);
  if (booking.pets) rows.push(['Pets', `${booking.pets.count} ${booking.pets.type}, rules acknowledged`]);
  if (booking.notes) rows.push(['Notes', booking.notes]);
  if (booking.cancelReason) rows.push(['Cancelled', booking.cancelReason]);

  return html`
    <dl class="facts">
      ${rows.map(([label, value]) => html`<div class="facts__row"><dt>${label}</dt><dd>${value}</dd></div>`)}
    </dl>`;
}

function priceSection(state: State, booking: Booking): SafeHTML {
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
        ${booking.discount ? html`
          <div class="line-items__row line-items__row--discount">
            <dt>
              ${discountLabel(booking.discount)}
              <span class="line-items__note">${findStaff(state, booking.discount.by)?.name ?? 'Removed account'}${booking.discount.note ? ` · “${booking.discount.note}”` : ' · no note'}</span>
            </dt>
            <dd>−${peso(booking.discount.amount)}</dd>
          </div>` : ''}
        <div class="line-items__row line-items__row--total"><dt>Total</dt><dd>${peso(booking.total)}</dd></div>
        <div class="line-items__row line-items__row--downpayment ${stillToConfirm(booking) && isActive(booking) ? 'is-due' : ''}">
          <dt>${downpaymentName(state, booking.product, booking.nights)}</dt>
          <dd>${peso(booking.depositRequired)}${booking.paid >= booking.depositRequired ? ' ✓' : ''}</dd>
        </div>
        <div class="line-items__row"><dt>Paid</dt><dd>${peso(booking.paid)}</dd></div>
        <div class="line-items__row line-items__row--balance ${booking.balance > 0 && isActive(booking) ? 'is-due' : ''}">
          <dt>Balance</dt><dd>${peso(booking.balance)}</dd>
        </div>
      </dl>
      ${stillToConfirm(booking) > 0 && isActive(booking)
        ? html`<p class="small muted">${peso(stillToConfirm(booking))} more confirms this booking. Until then it stays on hold.</p>` : ''}
    </section>`;
}

function paymentsSection(state: State, booking: Booking, receiptShown: string | null): SafeHTML | '' {
  const payments = state.payments.filter((payment) => payment.bookingId === booking.id);
  const checkFor = (paymentId: string) => state.paymentChecks.find((check) => check.paymentId === paymentId);
  if (!payments.length) return '';
  return html`
    <section class="detail-section">
      <h3 class="detail-section__title">Payments</h3>
      <ul class="plain-list">
        ${payments.map((payment) => {
          const check = checkFor(payment.id);
          return html`
          <li class="plain-list__row">
            <span>
              <strong>${peso(payment.amount)}</strong> ${METHOD_LABELS[payment.method]} · ${payment.type === 'deposit' ? 'downpayment' : payment.type}
              ${check ? html`<span class="pill pill--success">Receipt checked</span>` : payment.via === 'qr' ? html`<span class="pill pill--success">GCash QR</span>` : ''}
              <span class="small muted">${formatDateTime(payment.receivedAt)}${payment.receivedBy ? ` · ${findStaff(state, payment.receivedBy)?.name}` : ''}</span>
              ${payment.senderName || payment.sentAt ? html`
                <span class="small muted">${payment.method === 'gcash' ? 'GCash sender' : 'Sent by'}: ${payment.senderName ?? '—'}${payment.sentAt ? ` · sent ${timeOf(payment.sentAt)}` : ''}</span>` : ''}
            </span>
            <span class="plain-list__end">
              ${payment.reference ? html`<span class="small muted mono">${payment.reference}</span>` : ''}
              ${check?.receipt ? html`
                <button class="btn btn--quiet btn--sm" type="button" data-action="toggle-receipt" data-id="${check.id}" aria-expanded="${receiptShown === check.id ? 'true' : 'false'}">
                  ${receiptShown === check.id ? 'Hide receipt' : 'Receipt'}
                </button>` : ''}
            </span>
            ${check?.receipt && receiptShown === check.id ? html`
              <div class="plain-list__full"><img class="receipt-view receipt-view--inline" src="${check.receipt}" alt="GCash receipt from ${check.senderName}"></div>` : ''}
          </li>`;
        })}
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
  const ui: {
    checkInOpen: boolean;
    /** Check-out with a balance: collect it, then the guest leaves. */
    checkOutOpen: boolean;
    /** Extending a room stay, and by how many nights. */
    extendOpen: boolean;
    extendNights: number;
    guestListOpen: boolean;
    guestList: Companion[];
    qrOpen: boolean;
    discountOpen: boolean;
    discount: DiscountDraft;
    discountError: string;
    card: PaymentCardState;
    errors: { checkIn?: string; payment?: string };
    /** The receipt being checked is shown large. */
    receiptLarge: boolean;
    checkError: string;
    /** A past receipt opened from the payments list. */
    receiptShown: string | null;
  } = {
    checkInOpen: false, checkOutOpen: false, extendOpen: false, extendNights: 1, guestListOpen: false, guestList: [], qrOpen: false, discountOpen: false, discount: blankDiscount(), discountError: '',
    card: blankPaymentCard(), errors: {},
    receiptLarge: false, checkError: '', receiptShown: null,
  };

  const discountKindChanged = (before: DiscountDraft['kind']) => before !== ui.discount.kind;
  const discountAmountFor = (booking: Booking) => discountAmount(booking.pricing.total, ui.discount.kind, ui.discount.value);

  function guestListSection(ctx: DeskContext, booking: Booking): SafeHTML {
    const list = booking.guestList ?? [];
    const pax = booking.adults + booking.kids;
    const canEdit = ctx.can('bookings.write') && booking.status !== 'cancelled';
    if (ui.guestListOpen) {
      return html`
        <section class="detail-section">
          <h3 class="detail-section__title">Guest list</h3>
          <form class="guest-list-form" data-submit="save-guest-list" novalidate>
            ${guestListEditor(ui.guestList, pax, { required: false })}
            <div class="button-row button-row--end">
              <button class="btn btn--quiet" type="button" data-action="cancel-guest-list">Cancel</button>
              <button class="btn btn--primary" type="submit">Save guest list</button>
            </div>
          </form>
        </section>`;
    }
    return html`
      <section class="detail-section">
        <div class="detail-section__head">
          <h3 class="detail-section__title">Guest list <span class="muted">${list.length} of ${pax}</span></h3>
          <div class="button-row">
            ${list.length < pax ? html`<span class="pill pill--warning">${pax - list.length} missing</span>` : html`<span class="pill pill--success">Complete</span>`}
            ${canEdit ? html`<button class="btn btn--quiet btn--sm" type="button" data-action="edit-guest-list">${list.length ? 'Edit names' : 'Add names'}</button>` : ''}
          </div>
        </div>
        ${list.length ? html`
          <table class="guest-table">
            <thead><tr><th scope="col">#</th><th scope="col">Name</th><th scope="col">Gender</th><th scope="col" class="num">Age</th><th scope="col">Remarks</th></tr></thead>
            <tbody>
              ${list.map((row, index) => html`
                <tr><td class="muted">${index + 1}</td><td>${row.name}</td><td>${row.gender || '—'}</td><td class="num">${row.age ?? '—'}</td><td class="muted">${row.remarks}</td></tr>`)}
            </tbody>
          </table>` : html`<p class="small muted">No names yet. The registration sheet PDF leaves blank lines for them to fill in at the gate.</p>`}
      </section>`;
  }

  function discountSection(ctx: DeskContext, booking: Booking): SafeHTML | '' {
    const open = ['hold', 'confirmed', 'checked_in'].includes(booking.status);
    if (!open || !ctx.can('discounts.apply')) return '';
    if (!ui.discountOpen) {
      return html`
        <div class="button-row">
          <button class="btn btn--quiet btn--sm" type="button" data-action="open-discount">
            ${booking.discount ? 'Change discount' : 'Give a discount'}
          </button>
          ${booking.discount ? html`<button class="btn btn--quiet btn--sm btn--danger-text" type="button" data-action="remove-discount">Remove discount</button>` : ''}
        </div>`;
    }
    return html`
      <form class="action-card" data-submit="save-discount" novalidate>
        <h4 class="action-card__title">${booking.discount ? 'Change the discount' : 'Give a discount'}</h4>
        ${discountFields(ctx.staff, ui.discount, booking.pricing.total, 'discount')}
        ${booking.paid ? html`<p class="small muted">${booking.guestName} already paid ${peso(booking.paid)}, so the total can't go below that.</p>` : ''}
        <p class="form-error">${ui.discountError}</p>
        <div class="button-row">
          <button class="btn btn--quiet" type="button" data-action="close-discount">Cancel</button>
          <button class="btn btn--primary" type="submit">Save discount</button>
        </div>
      </form>`;
  }

  function qrSection(ctx: DeskContext, booking: Booking): SafeHTML | '' {
    const request = qrPaymentRequest(booking);
    if (!request || booking.status !== 'hold' || !ctx.can('payments.write') || ui.checkInOpen) return '';
    if (pendingPaymentCheck(ctx.state, booking.id)) return '';
    if (!ui.qrOpen) {
      return html`
        <button class="btn btn--secondary btn--block" type="button" data-action="open-qr">
          Collect the ${peso(request.amount)} downpayment by GCash QR
        </button>`;
    }
    return html`
      <form class="action-card" data-submit="verify-qr" novalidate>
        <div class="action-card__head">
          <h4 class="action-card__title">Show this to ${booking.guestName}</h4>
          <button class="btn btn--quiet btn--sm" type="button" data-action="close-qr">Hide</button>
        </div>
        ${paymentCard(request, ui.card, { partial: booking.paid > 0, desk: true })}
      </form>`;
  }

  /** The guest's GCash receipt, for staff to find in the resort's GCash and confirm or turn down. */
  function checkSection(ctx: DeskContext, booking: Booking, check: PaymentCheck): SafeHTML {
    const canDecide = ctx.can('payments.write');
    const warnings = receiptWarnings(ctx.state, booking, check);
    return html`
      <section class="detail-section pay-check" id="payment-check" aria-labelledby="payment-check-title">
        <div class="pay-check__head">
          <h3 class="pay-check__title" id="payment-check-title">${icon('wallet')} GCash payment to confirm</h3>
          <span class="pill pill--warning">Waiting</span>
        </div>
        <div class="pay-check__body ${ui.receiptLarge ? 'is-large' : ''}">
          ${check.receipt ? html`
            <button class="pay-check__receipt" type="button" data-action="toggle-receipt-size" title="${ui.receiptLarge ? 'Make it smaller' : 'See it larger'}">
              <img class="receipt-view" src="${check.receipt}" alt="GCash receipt from ${check.senderName}">
              <span class="pay-check__zoom small">${ui.receiptLarge ? 'Smaller' : 'Larger'}</span>
            </button>` : html`<p class="small muted">No receipt picture was sent.</p>`}
          <dl class="pay-check__facts">
            <div><dt>Should be</dt><dd><strong>${peso(check.amount)}</strong></dd></div>
            <div><dt>GCash sender</dt><dd>${check.senderName}</dd></div>
            <div><dt>Sent</dt><dd>${formatDateTime(check.sentAt)}</dd></div>
          </dl>
        </div>
        ${warnings.length ? html`
          <div class="pay-check__warn" role="note">
            <p class="pay-check__warn-title">${icon('alert')} Check before you confirm</p>
            <ul>${warnings.map((warning) => html`<li>${warning}</li>`)}</ul>
          </div>` : ''}
        <p class="small muted">A screenshot can be edited. Only the resort’s GCash app shows the money really arrived.</p>
        ${canDecide ? html`
          <div class="button-row">
            <button class="btn btn--primary" type="button" data-action="confirm-check" data-id="${check.id}">${icon('check')} Found it · confirm payment</button>
            <button class="btn btn--quiet btn--danger-text" type="button" data-action="ask-reject" data-id="${check.id}">Not found</button>
          </div>` : html`<p class="small muted">Someone with payment access confirms it.</p>`}
        <p class="form-error" role="alert">${ui.checkError}</p>
      </section>`;
  }

  /** More nights for a room stay, if the room is free for them. */
  function extendSection(ctx: DeskContext, booking: Booking): SafeHTML | '' {
    if (!ctx.can('bookings.write') || !canStayLonger(ctx.state, booking.product)) return '';
    if (!['hold', 'confirmed', 'checked_in'].includes(booking.status) || ui.checkInOpen || ui.checkOutOpen) return '';
    if (!ui.extendOpen) {
      return html`
        <button class="btn btn--secondary btn--block" type="button" data-action="open-extend">${icon('plus')} Extend stay</button>`;
    }
    const found = extendQuote(ctx.state, booking, ui.extendNights);
    return html`
      <div class="action-card">
        <h4 class="action-card__title">Extend ${booking.guestName}'s stay</h4>
        <div class="stepper" role="group" aria-label="Extra nights">
          <button class="btn btn--secondary btn--icon" type="button" data-action="extend-step" data-step="-1" aria-label="One night fewer" ${ui.extendNights <= 1 ? 'disabled' : ''}>−</button>
          <span class="stepper__value"><strong>${ui.extendNights}</strong> more ${ui.extendNights === 1 ? 'night' : 'nights'}</span>
          <button class="btn btn--secondary btn--icon" type="button" data-action="extend-step" data-step="1" aria-label="One night more">+</button>
        </div>
        ${found.error !== undefined
          ? html`<p class="form-error">${found.error}</p>`
          : html`
            <dl class="pay-check__facts">
              <div><dt>New stay</dt><dd>${stayText(booking.date, found.nights)}</dd></div>
              <div><dt>Adds to the bill</dt><dd><strong>${peso(found.added)}</strong></dd></div>
            </dl>
            <p class="small muted">It is added to the balance, paid by check-out. ${booking.status === 'confirmed' ? 'The booking stays confirmed.' : ''}</p>`}
        <div class="button-row">
          <button class="btn btn--quiet" type="button" data-action="close-extend">Cancel</button>
          <button class="btn btn--primary" type="button" data-action="confirm-extend" ${found.error !== undefined ? 'disabled' : ''}>Extend stay</button>
        </div>
      </div>`;
  }

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
            <p class="small muted">${booking.balance > 0 ? `The ${peso(booking.balance)} balance is collected at check-out.` : 'Fully paid.'}</p>
            <p class="form-error">${ui.errors.checkIn}</p>
            <div class="button-row">
              <button class="btn btn--quiet" type="button" data-action="cancel-check-in">Not now</button>
              <button class="btn btn--primary" type="button" data-action="confirm-check-in">Confirm check-in</button>
            </div>
          </div>`);
      }
    }

    if (booking.status === 'checked_in' && ctx.can('bookings.write')) {
      if (booking.balance > 0 && ui.checkOutOpen) {
        // The bill is settled as the guest leaves (walk-ins mostly pay this way).
        parts.push(html`
          <div class="action-card">
            <h4 class="action-card__title">Check out ${booking.guestName}</h4>
            <label class="field">
              <span class="field__label">Collect the ${peso(booking.balance)} balance via</span>
              <select class="input" name="checkOutMethod">${methodOptions('cash')}</select>
            </label>
            <div class="button-row">
              <button class="btn btn--quiet" type="button" data-action="cancel-check-out">Not now</button>
              <button class="btn btn--primary" type="button" data-action="confirm-check-out">Collect and check out</button>
            </div>
          </div>`);
      } else {
        parts.push(html`
          <button class="btn btn--primary btn--block" type="button" data-action="check-out">Check out guest</button>
          ${booking.balance > 0 ? html`<p class="small muted">${peso(booking.balance)} to collect as they leave.</p>` : ''}`);
      }
    }

    const extend = extendSection(ctx, booking);
    if (extend) parts.push(extend);

    const qr = qrSection(ctx, booking);
    if (qr) parts.push(qr);

    const discount = discountSection(ctx, booking);
    if (discount) parts.push(discount);

    if (isActive(booking) && booking.status !== 'checked_out' && booking.balance > 0 && ctx.can('payments.write') && !ui.checkInOpen && !ui.qrOpen) {
      const suggested = stillToConfirm(booking) || booking.balance;
      parts.push(html`
        <form class="action-card" data-submit="record-payment" novalidate>
          <h4 class="action-card__title">Record a payment</h4>
          <div class="form-grid">
            <label class="field">
              <span class="field__label">Amount (₱)</span>
              <input class="input" name="amount" type="number" min="1" max="${booking.balance}" step="1" value="${suggested}" inputmode="numeric">
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
          ${stillToConfirm(booking) ? html`<p class="small muted">${peso(stillToConfirm(booking))} completes the downpayment and confirms the booking.</p>` : ''}
          <p class="form-error">${ui.errors.payment}</p>
          <button class="btn btn--secondary" type="submit">Record payment</button>
        </form>`);
    }

    if (canArrive && ctx.can('bookings.cancel')) {
      parts.push(html`
        <button class="btn btn--quiet btn--danger-text" type="button" data-action="ask-cancel">Cancel booking</button>`);
    }

    if (!parts.length) return '';
    return html`<section class="detail-section detail-actions">${parts}</section>`;
  }

  return {
    live: true,

    title: (ctx) => findBooking(ctx.state, bookingId)?.guestName ?? 'Booking',

    tools(ctx) {
      const booking = findBooking(ctx.state, bookingId);
      if (!booking) return '';
      return html`
        ${ctx.can('bookings.write') && isEditable(ctx.state, booking) ? html`
          <button class="btn btn--secondary btn--sm" type="button" data-action="edit-booking" title="Edit this booking">
            ${icon('pencil')} Edit
          </button>` : ''}
        <button class="btn btn--secondary btn--sm" type="button" data-action="download-pdf" title="Download the registration sheet">
          ${icon('download')} Sheet
        </button>`;
    },

    render(ctx) {
      const booking = findBooking(ctx.state, bookingId);
      if (!booking) return html`<p class="muted">This booking no longer exists.</p>`;
      const pending = pendingPaymentCheck(ctx.state, booking.id);
      return html`
        <div class="detail">
          <div class="detail__status">
            ${statusPill(booking)} ${paymentPill(booking)}
            <span class="small muted mono">${booking.id}</span>
          </div>

          ${pending ? checkSection(ctx, booking, pending) : ''}
          ${facts(ctx.state, booking)}
          ${priceSection(ctx.state, booking)}
          ${guestListSection(ctx, booking)}
          ${paymentsSection(ctx.state, booking, ui.receiptShown)}
          ${activitySection(ctx.state, booking)}
          ${actionsSection(ctx, booking)}
        </div>`;
    },

    inputs: {
      companion: ({ el }) => {
        const field = el as HTMLInputElement | HTMLSelectElement;
        const shown = readGuestListField(ui.guestList, field);
        if (shown !== null && shown !== field.value) field.value = shown;
      },

      discount: ({ el, ctx, root }) => {
        const field = el as HTMLInputElement | HTMLSelectElement;
        const kindBefore = ui.discount.kind;
        const formatted = readDiscountField(ui.discount, field);
        if (formatted !== null && formatted !== field.value) field.value = formatted;
        ui.discountError = '';
        const booking = findBooking(ctx.state, bookingId);
        if (discountKindChanged(kindBefore) && booking) {
          const valueField = $maybe<HTMLInputElement>('[name="discountValue"]', root);
          if (valueField) valueField.value = ui.discount.value ? String(ui.discount.value) : '';
          const label = valueField?.closest('.field')?.querySelector('.field__label');
          if (label) label.textContent = ui.discount.kind === 'percent' ? 'Percent off' : 'Pesos off';
        }
        const preview = $maybe('[data-slot="discount-preview"]', root);
        if (preview && booking) {
          const off = discountAmountFor(booking);
          preview.textContent = off ? `Takes ${peso(off)} off the ${peso(booking.pricing.total)} price.` : '';
        }
      },

      senderName: ({ el }) => {
        ui.card.senderName = (el as HTMLInputElement).value;
        ui.card.error = '';
      },

      reference: ({ el }) => {
        ui.card.reference = (el as HTMLInputElement).value;
        ui.card.error = '';
      },
    },

    actions: {
      'edit-booking': ({ ctx }) => ctx.editBooking(bookingId),

      'edit-guest-list': ({ ctx, redraw }) => {
        const booking = findBooking(ctx.state, bookingId);
        if (!booking) return;
        // A blank line per expected guest, like the paper sheet.
        ui.guestList = fitGuestList((booking.guestList ?? []).map((row) => ({ ...row })), booking.adults + booking.kids);
        ui.guestListOpen = true;
        redraw();
      },

      'add-companion': ({ redraw }) => {
        ui.guestList.push(blankCompanion());
        redraw();
      },

      'remove-companion': ({ el, redraw }) => {
        ui.guestList.splice(Number(el.dataset.row), 1);
        if (!ui.guestList.length) ui.guestList.push(blankCompanion());
        redraw();
      },

      'cancel-guest-list': ({ redraw }) => {
        ui.guestListOpen = false;
        redraw();
      },

      'save-guest-list': ({ ctx, redraw }) => {
        ui.guestListOpen = false;
        const booking = setGuestList(bookingId, ui.guestList, ctx.staff.id);
        redraw();
        ctx.toast(`Guest list saved · ${booking.guestList?.length ?? 0} of ${booking.adults + booking.kids} named`);
      },

      'open-discount': ({ ctx, redraw }) => {
        const booking = findBooking(ctx.state, bookingId);
        const current = booking?.discount;
        ui.discount = current ? { kind: current.kind, value: current.value, note: current.note ?? '' } : blankDiscount();
        ui.discountError = '';
        ui.discountOpen = true;
        redraw();
      },

      'close-discount': ({ redraw }) => {
        ui.discountOpen = false;
        redraw();
      },

      'save-discount': ({ ctx, redraw }) => {
        const result = applyDiscount(bookingId, ui.discount, ctx.staff.id);
        if (result.error !== undefined) {
          ui.discountError = result.error;
          redraw();
          return;
        }
        ui.discountOpen = false;
        redraw();
        ctx.toast(`${peso(result.booking.discount?.amount ?? 0)} discount saved · new total ${peso(result.booking.total)}`);
      },

      'remove-discount': async ({ ctx }) => {
        const booking = findBooking(ctx.state, bookingId);
        if (!booking?.discount) return;
        const answer = await askConfirm({
          title: 'Remove the discount?',
          message: `The ${peso(booking.discount.amount)} discount comes off and the total goes back to ${peso(booking.pricing.total)}.`,
          confirmLabel: 'Remove discount',
        });
        if (!answer) return;
        const result = removeDiscount(bookingId, ctx.staff.id);
        if (result.error !== undefined) ctx.toast(result.error, 'error');
        else ctx.toast(`Discount removed · total back to ${peso(result.booking.total)}`);
      },

      'open-qr': ({ redraw }) => {
        ui.qrOpen = true;
        ui.card = blankPaymentCard();
        redraw();
      },

      'close-qr': ({ redraw }) => {
        ui.qrOpen = false;
        redraw();
      },

      'simulate-payment': ({ ctx, root }) => {
        ui.card.reference = sampleReference(ctx.state, `${bookingId}|${Date.now()}`);
        ui.card.error = '';
        const input = $maybe<HTMLInputElement>('[name="reference"]', root);
        if (input) input.value = ui.card.reference;
        if (!ui.card.senderName.trim()) {
          ui.card.senderName = findBooking(ctx.state, bookingId)?.guestName ?? '';
          const sender = $maybe<HTMLInputElement>('[name="senderName"]', root);
          if (sender) sender.value = ui.card.senderName;
        }
      },

      'verify-qr': ({ ctx, redraw }) => {
        const result = payByQr(bookingId, ui.card.reference, ctx.staff.id, ui.card.senderName);
        if (result.error !== undefined) {
          ui.card.error = result.error;
          redraw();
          return;
        }
        ui.qrOpen = false;
        ctx.toast(`${peso(result.payment.amount)} GCash payment recorded${result.booking.status === 'confirmed' ? ' · booking confirmed' : ''}`);
      },

      'toggle-receipt-size': ({ redraw }) => {
        ui.receiptLarge = !ui.receiptLarge;
        redraw();
      },

      'toggle-receipt': ({ el, redraw }) => {
        ui.receiptShown = ui.receiptShown === el.dataset.id ? null : el.dataset.id ?? null;
        redraw();
      },

      'ask-reject': async ({ el, ctx, redraw }) => {
        const check = ctx.state.paymentChecks.find((item) => item.id === el.dataset.id);
        const booking = findBooking(ctx.state, bookingId);
        if (!check || !booking) return;
        const answer = await askConfirm({
          title: `Reject ${booking.guestName}'s receipt?`,
          message: `The receipt from ${check.senderName} for the ${peso(check.amount)} downpayment. The booking stays on hold, and ${booking.guestName} is asked to send another receipt from their link, with the reason below.`,
          choice: { label: 'Why can’t it be confirmed? The guest sees this.', options: [...REJECT_REASONS] },
          confirmLabel: 'Reject receipt',
          keepLabel: 'Back',
        });
        if (!answer) return;
        const result = rejectPaymentCheck(check.id, answer.choice, ctx.staff.id);
        if (result.error !== undefined) {
          ui.checkError = result.error;
          redraw();
          return;
        }
        ui.checkError = '';
        ui.receiptLarge = false;
        ctx.toast(`Receipt rejected · ${result.booking.guestName} can send another from their link`, 'warning');
      },

      'confirm-check': async ({ el, ctx, redraw }) => {
        const check = ctx.state.paymentChecks.find((item) => item.id === el.dataset.id);
        const booking = findBooking(ctx.state, bookingId);
        if (!check || !booking) return;
        const answer = await askConfirm({
          title: `Is ${peso(check.amount)} in the resort's GCash?`,
          message: `Open the resort's GCash app and find the payment from ${check.senderName}, sent ${formatDateTime(check.sentAt)}. Only confirm if it is there and it is exactly ${peso(check.amount)}; if it is less, choose Not yet and reject it as "Amount does not match".`,
          warnings: receiptWarnings(ctx.state, booking, check),
          input: {
            label: 'Reference number, from the GCash app',
            placeholder: 'Last 4 digits, or all 13',
            hint: 'Read it from the app’s transaction history, not from the guest’s screenshot.',
            numeric: true,
            check: (value) => appReferenceProblem(ctx.state, value, check.amount),
          },
          confirmLabel: 'Found it · confirm payment',
          keepLabel: 'Not yet',
          tone: 'plain',
        });
        if (!answer) return;
        const result = confirmPaymentCheck(check.id, answer.value, ctx.staff.id);
        if (result.error !== undefined) {
          ui.checkError = result.error;
          redraw();
          return;
        }
        ui.checkError = '';
        ui.receiptLarge = false;
        ctx.toast(`${peso(result.payment.amount)} GCash payment confirmed${result.booking.status === 'confirmed' ? ' · booking confirmed' : ''}`);
      },

      'download-pdf': ({ ctx }) => {
        const booking = findBooking(ctx.state, bookingId);
        if (!booking) return;
        downloadBookingPdf(ctx.state, booking);
        ctx.toast('Registration sheet downloaded', 'info');
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
        const booking = findBooking(ctx.state, bookingId);
        if (!booking) return;
        ui.checkInOpen = false;
        ui.errors = {};
        checkIn(bookingId, ctx.staff.id);
        ctx.toast(`${booking.guestName} checked in${booking.balance ? ` · ${peso(booking.balance)} to collect at check-out` : ''}`);
      },

      'check-out': ({ ctx, redraw }) => {
        const booking = findBooking(ctx.state, bookingId);
        if (booking && booking.balance > 0) {
          ui.checkOutOpen = true;
          ui.extendOpen = false;
          redraw();
          return;
        }
        const result = checkOut(bookingId, ctx.staff.id);
        if (result.error !== undefined) ctx.toast(result.error, 'error');
        else ctx.toast(`${result.booking.guestName} checked out`);
      },

      'cancel-check-out': ({ redraw }) => {
        ui.checkOutOpen = false;
        redraw();
      },

      'confirm-check-out': ({ root, ctx }) => {
        const booking = findBooking(ctx.state, bookingId);
        if (!booking) return;
        const collected = booking.balance;
        const method = ($maybe<HTMLSelectElement>('[name="checkOutMethod"]', root)?.value ?? 'cash') as PaymentMethod;
        ui.checkOutOpen = false;
        const result = checkOut(bookingId, ctx.staff.id, { method });
        if (result.error !== undefined) ctx.toast(result.error, 'error');
        else ctx.toast(`${result.booking.guestName} checked out · collected ${peso(collected)}`);
      },

      'open-extend': ({ redraw }) => {
        ui.extendOpen = true;
        ui.extendNights = 1;
        redraw();
      },

      'close-extend': ({ redraw }) => {
        ui.extendOpen = false;
        redraw();
      },

      'extend-step': ({ el, redraw }) => {
        ui.extendNights = Math.max(1, ui.extendNights + (Number(el.dataset.step) || 0));
        redraw();
      },

      'confirm-extend': ({ ctx }) => {
        const result = extendStay(bookingId, ui.extendNights, ctx.staff.id);
        if (result.error !== undefined) {
          ctx.toast(result.error, 'error');
          return;
        }
        ui.extendOpen = false;
        ctx.toast(`Stay extended to ${result.booking.nights} nights · ${peso(result.added)} added to the balance`);
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

      'ask-cancel': async ({ ctx }) => {
        const booking = findBooking(ctx.state, bookingId);
        if (!booking) return;
        const answer = await askConfirm({
          title: `Cancel ${booking.guestName}'s booking?`,
          message: `${productLabel(ctx.state, booking.product)}, ${booking.nights > 1 ? stayText(booking.date, booking.nights) : formatDate(booking.date, 'long')}. The slot opens up again.${booking.paid ? ` The ${peso(booking.paid)} already paid stays on file; refund it separately if needed.` : ''}`,
          choice: { label: 'Reason', options: [...CANCEL_REASONS] },
          confirmLabel: 'Cancel booking',
          keepLabel: 'Keep booking',
        });
        if (!answer) return;
        const cancelled = cancelBooking(bookingId, answer.choice, ctx.staff.id);
        ctx.toast(`${cancelled.guestName}'s booking was cancelled`, 'warning');
      },
    },
  };
}
