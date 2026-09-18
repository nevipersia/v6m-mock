// New booking drawer with a live availability check and price quote.

import { createBooking } from '../../core/actions.js';
import { $, html, render } from '../../core/dom.js';
import { formatDate, isPHMobile, peso } from '../../core/format.js';
import {
  METHOD_LABELS, SOURCE_LABELS, checkAvailability, closingEvent, depositRequired, findUnit, periodDays, quote,
} from '../../core/rules.js';

const SOURCES = ['walk_in', 'phone', 'messenger', 'instagram', 'website'];
const METHODS = ['gcash', 'cash', 'bank_transfer'];
const NUMBER_FIELDS = ['adults', 'kids', 'deposit'];

function bookableProducts(state) {
  return [
    ...state.poolSessions.map((session) => ({ value: session.id, label: `${session.label} entrance` })),
    ...state.units.filter((unit) => unit.channel !== 'airbnb').map((unit) => ({
      value: unit.id,
      label: `${unit.name} (${unit.capacityMin > 1 ? `${unit.capacityMin}–` : 'up to '}${unit.capacityMax})`,
    })),
  ];
}

function initialDraft(state, prefill) {
  const days = periodDays(state);
  const products = bookableProducts(state).map((option) => option.value);
  const product = products.includes(prefill.product) ? prefill.product : 'daytour';
  const unit = findUnit(state, product);
  return {
    guestName: prefill.guestName ?? '',
    mobile: prefill.mobile ?? '',
    source: SOURCES.includes(prefill.source) ? prefill.source : 'walk_in',
    product,
    date: days.includes(prefill.date) ? prefill.date : state.meta.asOf,
    adults: unit?.capacityMin > 1 ? unit.capacityMin : 2,
    kids: 0,
    deposit: 0,
    method: 'gcash',
    reference: '',
    notes: '',
    inquiryId: prefill.inquiryId ?? null,
  };
}

const option = (value, label, selected) =>
  html`<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`;

function summaryTemplate(state, draft) {
  const guests = draft.adults + draft.kids;
  if (guests === 0) return html`<p class="small muted">Add guests to see the price.</p>`;

  const availability = checkAvailability(state, draft);
  const estimate = quote(state, draft);
  const suggested = depositRequired(state, draft.product, estimate.total);

  return html`
    <div class="quote-box">
      <div class="quote-box__status">
        ${availability.ok
          ? html`<span class="pill pill--success">Available</span>${availability.slotsLeft != null ? html` <span class="small muted">${availability.slotsLeft} pool slots left before this booking</span>` : ''}`
          : html`<span class="pill pill--danger">Not available</span> <span class="small">${availability.reason}</span>`}
      </div>
      <dl class="line-items">
        ${estimate.lines.map((line) => html`
          <div class="line-items__row"><dt>${line.label} <span class="muted">${line.qty} × ${peso(line.unitPrice)}</span></dt><dd>${peso(line.amount)}</dd></div>`)}
        ${estimate.promo ? html`
          <div class="line-items__row line-items__row--discount"><dt>${estimate.promo.name} (${estimate.promo.percent}%)</dt><dd>−${peso(estimate.discount)}</dd></div>` : ''}
        <div class="line-items__row line-items__row--total"><dt>Total</dt><dd>${peso(estimate.total)}</dd></div>
        <div class="line-items__row"><dt>Balance after deposit</dt><dd>${peso(Math.max(0, estimate.total - draft.deposit))}</dd></div>
      </dl>
      ${estimate.warnings.map((warning) => html`<p class="form-error">${warning}</p>`)}
      <button class="btn btn--quiet btn--sm" type="button" data-action="use-suggested-deposit" data-amount="${suggested}">
        Use suggested deposit of ${peso(suggested)}
      </button>
    </div>`;
}

export function createBookingForm(prefill) {
  let draft = null;
  let error = '';

  const refreshSummary = (root, state) => {
    render($('[data-slot="summary"]', root), summaryTemplate(state, draft));
    $('[data-slot="error"]', root).textContent = error;
  };

  return {
    live: false,
    title: 'New booking',

    render(ctx) {
      const { state } = ctx;
      if (!draft) draft = initialDraft(state, prefill);

      return html`
        <form class="booking-form" data-submit="save-booking" novalidate>
          ${draft.inquiryId ? html`<p class="notice">Linked to inquiry ${draft.inquiryId}. It will be marked as booked.</p>` : ''}

          <fieldset class="form-section">
            <legend class="form-section__title">Guest</legend>
            <label class="field">
              <span class="field__label">Name</span>
              <input class="input" name="guestName" data-input="field" value="${draft.guestName}" autocomplete="off" placeholder="Maria Santos" required>
            </label>
            <div class="form-grid">
              <label class="field">
                <span class="field__label">Mobile (optional)</span>
                <input class="input" name="mobile" data-input="field" type="tel" value="${draft.mobile}" placeholder="0917 123 4567">
              </label>
              <label class="field">
                <span class="field__label">Booked via</span>
                <select class="input" name="source" data-input="field">
                  ${SOURCES.map((source) => option(source, SOURCE_LABELS[source], draft.source))}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset class="form-section">
            <legend class="form-section__title">Stay</legend>
            <div class="form-grid">
              <label class="field">
                <span class="field__label">Booking</span>
                <select class="input" name="product" data-input="field">
                  ${bookableProducts(state).map((item) => option(item.value, item.label, draft.product))}
                </select>
              </label>
              <label class="field">
                <span class="field__label">Date</span>
                <select class="input" name="date" data-input="field">
                  ${periodDays(state).map((day) => option(day, `${formatDate(day)}${closingEvent(state, day) ? ' · closed' : ''}`, draft.date))}
                </select>
              </label>
              <label class="field">
                <span class="field__label">Adults</span>
                <input class="input" name="adults" data-input="field" type="number" min="0" max="200" step="1" value="${draft.adults}" inputmode="numeric">
              </label>
              <label class="field">
                <span class="field__label">Kids</span>
                <input class="input" name="kids" data-input="field" type="number" min="0" max="200" step="1" value="${draft.kids}" inputmode="numeric">
              </label>
            </div>
            <label class="field">
              <span class="field__label">Notes (optional)</span>
              <input class="input" name="notes" data-input="field" value="${draft.notes}" placeholder="Celebrating a birthday">
            </label>
          </fieldset>

          <div data-slot="summary">${summaryTemplate(state, draft)}</div>

          <fieldset class="form-section">
            <legend class="form-section__title">Deposit received</legend>
            <div class="form-grid">
              <label class="field">
                <span class="field__label">Amount (₱)</span>
                <input class="input" name="deposit" data-input="field" type="number" min="0" step="1" value="${draft.deposit}" inputmode="numeric">
              </label>
              <label class="field">
                <span class="field__label">Method</span>
                <select class="input" name="method" data-input="field">
                  ${METHODS.map((method) => option(method, METHOD_LABELS[method], draft.method))}
                </select>
              </label>
            </div>
            <label class="field">
              <span class="field__label">Reference (optional)</span>
              <input class="input" name="reference" data-input="field" value="${draft.reference}" placeholder="GCash or bank reference number">
            </label>
            <p class="small muted">Leave the amount at ₱0 to hold the slot without a deposit.</p>
          </fieldset>

          <p class="form-error" data-slot="error" role="alert">${error}</p>

          <div class="button-row button-row--end">
            <button class="btn btn--quiet" type="button" data-action="close-drawer">Cancel</button>
            <button class="btn btn--primary" type="submit">Save booking</button>
          </div>
        </form>`;
    },

    inputs: {
      field: ({ el, ctx, root }) => {
        draft[el.name] = NUMBER_FIELDS.includes(el.name) ? Math.max(0, Number.parseInt(el.value, 10) || 0) : el.value;
        error = '';
        refreshSummary(root, ctx.state);
      },
    },

    actions: {
      'use-suggested-deposit': ({ el, ctx, root }) => {
        draft.deposit = Number(el.dataset.amount);
        $('[name="deposit"]', root).value = draft.deposit;
        refreshSummary(root, ctx.state);
      },

      'save-booking': ({ ctx, root }) => {
        const { state } = ctx;
        const guests = draft.adults + draft.kids;
        const availability = checkAvailability(state, draft);
        const estimate = quote(state, draft);
        const unit = findUnit(state, draft.product);

        if (!draft.guestName.trim()) error = 'Enter the guest name.';
        else if (draft.mobile.trim() && !isPHMobile(draft.mobile)) error = 'Enter a PH mobile number, like 0917 123 4567, or leave it blank.';
        else if (guests === 0) error = 'Add at least one guest.';
        else if (!availability.ok) error = availability.reason;
        else if (unit && guests > unit.capacityMax) error = `${unit.name} fits up to ${unit.capacityMax} guests.`;
        else if (draft.deposit > estimate.total) error = `The deposit can't be more than the ${peso(estimate.total)} total.`;
        else error = '';

        if (error) {
          refreshSummary(root, state);
          return;
        }

        const booking = createBooking({ ...draft, mobile: draft.mobile.trim() }, ctx.staff.id);
        ctx.toast(booking.paid ? `Booking saved and confirmed with a ${peso(booking.paid)} deposit` : 'Booking saved on hold until a deposit comes in');
        ctx.openBooking(booking.id);
      },
    },
  };
}
