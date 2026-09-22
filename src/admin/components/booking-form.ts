// New booking drawer with a live availability check and price quote.

import { createBooking, type NewBooking } from '../../core/actions.js';
import { $, $maybe, html, render, type SafeHTML } from '../../core/dom.js';
import { formatDigits, isPHMobile, parseDigits, peso } from '../../core/format.js';
import {
  DOWNPAYMENT_PERCENT, METHOD_LABELS, SOURCE_LABELS, checkAvailability, closingEvent, depositRequired, discountAmount,
  discountProblem, findUnit, quote,
} from '../../core/rules.js';
import type { BookingSource, PaymentMethod, State } from '../../core/types.js';
import { asField, type BookingPrefill, type DrawerContent } from '../types.js';
import { blankDiscount, discountFields, readDiscountField, type DiscountDraft } from './discount-fields.js';

const SOURCES: BookingSource[] = ['walk_in', 'phone', 'messenger', 'instagram', 'website'];
const METHODS: PaymentMethod[] = ['gcash', 'cash', 'bank_transfer'];

type NumberField = 'adults' | 'kids' | 'deposit';
type TextField = 'guestName' | 'mobile' | 'product' | 'date' | 'reference' | 'notes';

const NUMBER_FIELDS: readonly string[] = ['adults', 'kids', 'deposit'] satisfies NumberField[];
const TEXT_FIELDS: readonly string[] = ['guestName', 'mobile', 'product', 'date', 'reference', 'notes'] satisfies TextField[];

/** The form keeps every field as a plain value; mobile, reference and notes are never undefined here. */
type Draft = NewBooking & { mobile: string; reference: string; notes: string; inquiryId: string | null };

function bookableProducts(state: State): { value: string; label: string }[] {
  return [
    ...state.poolSessions.map((session) => ({ value: session.id, label: `${session.label} entrance` })),
    ...state.units.filter((unit) => unit.channel !== 'airbnb').map((unit) => ({
      value: unit.id,
      label: `${unit.name} (${unit.capacityMin > 1 ? `${unit.capacityMin}–` : 'up to '}${unit.capacityMax})`,
    })),
  ];
}

function initialDraft(state: State, prefill: BookingPrefill): Draft {
  const products = bookableProducts(state).map((option) => option.value);
  const product = prefill.product && products.includes(prefill.product) ? prefill.product : 'daytour';
  const unit = findUnit(state, product);
  return {
    guestName: prefill.guestName ?? '',
    mobile: prefill.mobile ?? '',
    source: SOURCES.find((source) => source === prefill.source) ?? 'walk_in',
    product,
    date: prefill.date || state.meta.asOf,
    adults: unit && unit.capacityMin > 1 ? unit.capacityMin : 2,
    kids: 0,
    deposit: 0,
    method: 'gcash',
    reference: '',
    notes: '',
    inquiryId: prefill.inquiryId ?? null,
  };
}

const option = (value: string, label: string, selected: string): SafeHTML =>
  html`<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`;

/** The list price after any promo, the manual discount in pesos, and what the guest pays. */
function priced(state: State, draft: Draft, discount: DiscountDraft | null) {
  const estimate = quote(state, draft);
  const off = discount ? discountAmount(estimate.total, discount.kind, discount.value) : 0;
  return { estimate, off, total: estimate.total - off };
}

function summaryTemplate(state: State, draft: Draft, discount: DiscountDraft | null): SafeHTML {
  const guests = draft.adults + draft.kids;
  if (guests === 0) return html`<p class="small muted">Add guests to see the price.</p>`;

  const availability = checkAvailability(state, draft);
  const { estimate, off, total } = priced(state, draft, discount);
  const required = depositRequired(state, draft.product, total);
  const short = draft.deposit > 0 && draft.deposit < required;

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
        ${off && discount ? html`
          <div class="line-items__row line-items__row--discount"><dt>Discount${discount.kind === 'percent' ? ` (${discount.value}%)` : ''}</dt><dd>−${peso(off)}</dd></div>` : ''}
        <div class="line-items__row line-items__row--total"><dt>Total</dt><dd>${peso(total)}</dd></div>
        <div class="line-items__row line-items__row--downpayment"><dt>${DOWNPAYMENT_PERCENT}% downpayment to confirm</dt><dd>${peso(required)}</dd></div>
        <div class="line-items__row"><dt>Balance after this payment</dt><dd>${peso(Math.max(0, total - draft.deposit))}</dd></div>
      </dl>
      ${estimate.warnings.map((warning) => html`<p class="form-error">${warning}</p>`)}
      <p class="small ${short ? 'is-due' : 'muted'}">
        ${draft.deposit >= required
          ? 'The downpayment is covered, so the booking is saved as confirmed.'
          : short
            ? `${peso(required - draft.deposit)} short of the downpayment, so the booking stays on hold.`
            : 'No payment yet, so the booking is saved on hold.'}
      </p>
      ${draft.deposit === required ? '' : html`
        <button class="btn btn--quiet btn--sm" type="button" data-action="use-suggested-deposit" data-amount="${required}">
          Use the ${DOWNPAYMENT_PERCENT}% downpayment of ${peso(required)}
        </button>`}
    </div>`;
}

export function createBookingForm(prefill: BookingPrefill = {}): DrawerContent {
  let draft: Draft | null = null;
  let error = '';
  const discount = blankDiscount();
  let canDiscount = false;
  const activeDiscount = () => (canDiscount && discount.value > 0 ? discount : null);

  const refreshSummary = (root: HTMLElement, state: State) => {
    if (!draft) return;
    render($('[data-slot="summary"]', root), summaryTemplate(state, draft, activeDiscount()));
    const preview = $maybe('[data-slot="discount-preview"]', root);
    if (preview) {
      const { estimate, off } = priced(state, draft, activeDiscount());
      preview.textContent = off ? `Takes ${peso(off)} off the ${peso(estimate.total)} price.` : '';
    }
    $('[data-slot="error"]', root).textContent = error;
  };

  return {
    live: false,
    title: 'New booking',

    render(ctx) {
      const { state } = ctx;
      draft ??= initialDraft(state, prefill);
      const form = draft;
      canDiscount = ctx.can('discounts.apply');

      return html`
        <form class="booking-form" data-submit="save-booking" novalidate>
          ${form.inquiryId ? html`<p class="notice">Linked to inquiry ${form.inquiryId}. It will be marked as booked.</p>` : ''}

          <fieldset class="form-section">
            <legend class="form-section__title">Guest</legend>
            <label class="field">
              <span class="field__label">Name</span>
              <input class="input" name="guestName" data-input="field" value="${form.guestName}" autocomplete="off" placeholder="Maria Santos" required>
            </label>
            <div class="form-grid">
              <label class="field">
                <span class="field__label">Mobile (optional)</span>
                <input class="input" name="mobile" data-input="field" type="tel" value="${form.mobile}" placeholder="0917 123 4567">
              </label>
              <label class="field">
                <span class="field__label">Booked via</span>
                <select class="input" name="source" data-input="field">
                  ${SOURCES.map((source) => option(source, SOURCE_LABELS[source], form.source))}
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
                  ${bookableProducts(state).map((item) => option(item.value, item.label, form.product))}
                </select>
              </label>
              <label class="field">
                <span class="field__label">Date</span>
                <input class="input" name="date" data-input="field" type="date" value="${form.date}">
                ${closingEvent(state, form.date) ? html`<span class="small muted">Closed that day for a private event.</span>` : ''}
              </label>
              <label class="field">
                <span class="field__label">Adults</span>
                <input class="input" name="adults" data-input="field" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${form.adults || ''}">
              </label>
              <label class="field">
                <span class="field__label">Kids</span>
                <input class="input" name="kids" data-input="field" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${form.kids || ''}">
              </label>
            </div>
            <label class="field">
              <span class="field__label">Notes (optional)</span>
              <input class="input" name="notes" data-input="field" value="${form.notes}" placeholder="Celebrating a birthday">
            </label>
          </fieldset>

          ${canDiscount ? html`
            <fieldset class="form-section">
              <legend class="form-section__title">Discount (optional)</legend>
              ${discountFields(ctx.staff, discount, quote(state, form).total, 'discount')}
            </fieldset>` : ''}

          <div data-slot="summary">${summaryTemplate(state, form, activeDiscount())}</div>

          <fieldset class="form-section">
            <legend class="form-section__title">Downpayment received</legend>
            <div class="form-grid">
              <label class="field">
                <span class="field__label">Amount (₱)</span>
                <input class="input input--amount" name="deposit" data-input="field" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${formatDigits(form.deposit)}">
              </label>
              <label class="field">
                <span class="field__label">Method</span>
                <select class="input" name="method" data-input="field">
                  ${METHODS.map((method) => option(method, METHOD_LABELS[method], form.method))}
                </select>
              </label>
            </div>
            <label class="field">
              <span class="field__label">Reference (optional)</span>
              <input class="input" name="reference" data-input="field" value="${form.reference}" placeholder="GCash or bank reference number">
            </label>
            <p class="small muted">A booking is confirmed once ${DOWNPAYMENT_PERCENT}% is paid. Leave the amount blank to hold the slot; the guest can pay later by GCash QR from the booking.</p>
          </fieldset>

          <p class="form-error" data-slot="error" role="alert">${error}</p>

          <div class="button-row button-row--end">
            <button class="btn btn--quiet" type="button" data-action="close-drawer">Cancel</button>
            <button class="btn btn--primary" type="submit">Save booking</button>
          </div>
        </form>`;
    },

    inputs: {
      discount: ({ el, ctx, root }) => {
        const field = asField(el) as HTMLInputElement | HTMLSelectElement;
        const kindBefore = discount.kind;
        const formatted = readDiscountField(discount, field);
        if (formatted !== null && formatted !== field.value) field.value = formatted;
        if (discount.kind !== kindBefore) {
          const valueField = $maybe<HTMLInputElement>('[name="discountValue"]', root);
          if (valueField) valueField.value = discount.value ? String(discount.value) : '';
          const label = valueField?.closest('.field')?.querySelector('.field__label');
          if (label) label.textContent = discount.kind === 'percent' ? 'Percent off' : 'Pesos off';
        }
        error = '';
        refreshSummary(root, ctx.state);
      },

      field: ({ el, ctx, root }) => {
        if (!draft) return;
        const field = asField(el);
        if (field instanceof HTMLInputElement && NUMBER_FIELDS.includes(field.name)) {
          const caretAtEnd = field.selectionStart === field.value.length;
          draft[field.name as NumberField] = parseDigits(field.value);
          const formatted = field.name === 'deposit' ? formatDigits(field.value) : String(parseDigits(field.value) || '');
          if (formatted !== field.value) {
            field.value = formatted;
            if (caretAtEnd) field.setSelectionRange(formatted.length, formatted.length);
          }
        } else if (field.name === 'source') {
          draft.source = field.value as BookingSource;
        } else if (field.name === 'method') {
          draft.method = field.value as PaymentMethod;
        } else if (TEXT_FIELDS.includes(field.name)) {
          draft[field.name as TextField] = field.value;
        }
        error = '';
        refreshSummary(root, ctx.state);
      },
    },

    actions: {
      'use-suggested-deposit': ({ el, ctx, root }) => {
        if (!draft) return;
        draft.deposit = Number(el.dataset.amount);
        $<HTMLInputElement>('[name="deposit"]', root).value = formatDigits(draft.deposit);
        refreshSummary(root, ctx.state);
      },

      'save-booking': ({ ctx, root }) => {
        if (!draft) return;
        const { state } = ctx;
        const guests = draft.adults + draft.kids;
        const availability = checkAvailability(state, draft);
        const { estimate, total } = priced(state, draft, activeDiscount());
        const unit = findUnit(state, draft.product);
        const chosen = activeDiscount();
        const discountError = chosen ? discountProblem(ctx.staff, chosen, estimate.total) : null;

        if (!draft.guestName.trim()) error = 'Enter the guest name.';
        else if (!draft.date) error = 'Pick a date.';
        else if (draft.mobile.trim() && !isPHMobile(draft.mobile)) error = 'Enter a PH mobile number, like 0917 123 4567, or leave it blank.';
        else if (guests === 0) error = 'Add at least one guest.';
        else if (!availability.ok) error = availability.reason ?? 'Not available.';
        else if (unit && guests > unit.capacityMax) error = `${unit.name} fits up to ${unit.capacityMax} guests.`;
        else if (discountError) error = discountError;
        else if (!chosen && discount.note.trim() && canDiscount) error = 'Enter the discount amount, or clear the reason.';
        else if (draft.deposit > total) error = `The payment can't be more than the ${peso(total)} total.`;
        else error = '';

        if (error) {
          refreshSummary(root, state);
          return;
        }

        const booking = createBooking({ ...draft, mobile: draft.mobile.trim(), discount: chosen }, ctx.staff.id);
        ctx.toast(booking.status === 'confirmed'
          ? `Booking confirmed with a ${peso(booking.paid)} downpayment`
          : booking.paid
            ? `Booking on hold: ${peso(booking.depositRequired - booking.paid)} more needed to confirm`
            : `Booking on hold until the ${DOWNPAYMENT_PERCENT}% downpayment is paid`);
        ctx.openBooking(booking.id);
      },
    },
  };
}
