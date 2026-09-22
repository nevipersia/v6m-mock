// Booking form drawer, for new bookings and for editing one that has not
// arrived yet. Live availability check, price quote and discount either way.

import { createBooking, updateBooking, type NewBooking } from '../../core/actions.js';
import { $, $maybe, html, render, type SafeHTML } from '../../core/dom.js';
import { formatDigits, isPHMobile, parseDigits, peso } from '../../core/format.js';
import {
  DOWNPAYMENT_PERCENT, METHOD_LABELS, SOURCE_LABELS, checkAvailability, closingEvent, depositRequired, discountAmount,
  discountProblem, findBooking, findGuest, findUnit, quote,
} from '../../core/rules.js';
import type { Booking, BookingSource, PaymentMethod, State } from '../../core/types.js';
import { asField, type BookingPrefill, type DrawerContent } from '../types.js';
import { blankDiscount, discountFields, readDiscountField, type DiscountDraft } from './discount-fields.js';

const SOURCES: BookingSource[] = ['walk_in', 'phone', 'messenger', 'instagram', 'website', 'booking_link'];
const NEW_SOURCES: BookingSource[] = ['walk_in', 'phone', 'messenger', 'instagram', 'website'];
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
    source: NEW_SOURCES.find((source) => source === prefill.source) ?? 'walk_in',
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

function draftFromBooking(state: State, booking: Booking): Draft {
  return {
    guestName: booking.guestName,
    mobile: findGuest(state, booking.guestId)?.mobile ?? '',
    source: booking.source,
    product: booking.product,
    date: booking.date,
    adults: booking.adults,
    kids: booking.kids,
    deposit: 0,
    method: 'gcash',
    reference: '',
    notes: booking.notes ?? '',
    inquiryId: null,
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

interface SummaryContext {
  discount: DiscountDraft | null;
  /** The booking being edited: its payments stay, so they count toward the downpayment. */
  editing: Booking | null;
}

function summaryTemplate(state: State, draft: Draft, { discount, editing }: SummaryContext): SafeHTML {
  const guests = draft.adults + draft.kids;
  if (guests === 0) return html`<p class="small muted">Add guests to see the price.</p>`;

  const availability = checkAvailability(state, { ...draft, excludeId: editing?.id });
  const { estimate, off, total } = priced(state, draft, discount);
  const required = depositRequired(state, draft.product, total);
  const paid = editing ? editing.paid : draft.deposit;
  const short = paid > 0 && paid < required;

  return html`
    <div class="quote-box">
      <div class="quote-box__status">
        ${availability.ok
          ? html`<span class="pill pill--success">Available</span>${availability.slotsLeft != null ? html` <span class="small muted">${availability.slotsLeft} pool slots left${editing ? '' : ' before this booking'}</span>` : ''}`
          : html`<span class="pill pill--danger">Not available</span> <span class="small">${availability.reason}</span>`}
      </div>
      <dl class="line-items">
        ${estimate.lines.map((line) => html`
          <div class="line-items__row"><dt>${line.label} <span class="muted">${line.qty} × ${peso(line.unitPrice)}</span></dt><dd>${peso(line.amount)}</dd></div>`)}
        ${estimate.promo ? html`
          <div class="line-items__row line-items__row--discount"><dt>${estimate.promo.name} (${estimate.promo.percent}%)</dt><dd>−${peso(estimate.discount)}</dd></div>` : ''}
        ${off && discount ? html`
          <div class="line-items__row line-items__row--discount"><dt>Discount${discount.kind === 'percent' ? ` (${discount.value}%)` : ''}</dt><dd>−${peso(off)}</dd></div>` : ''}
        <div class="line-items__row line-items__row--total"><dt>${editing ? 'New total' : 'Total'}</dt><dd>${peso(total)}</dd></div>
        ${editing && editing.total !== total ? html`
          <div class="line-items__row"><dt>Was</dt><dd class="muted">${peso(editing.total)}</dd></div>` : ''}
        <div class="line-items__row line-items__row--downpayment"><dt>${DOWNPAYMENT_PERCENT}% downpayment to confirm</dt><dd>${peso(required)}</dd></div>
        ${editing ? html`<div class="line-items__row"><dt>Already paid</dt><dd>${peso(editing.paid)}</dd></div>` : ''}
        <div class="line-items__row"><dt>${editing ? 'Balance' : 'Balance after this payment'}</dt><dd>${peso(Math.max(0, total - paid))}</dd></div>
      </dl>
      ${estimate.warnings.map((warning) => html`<p class="form-error">${warning}</p>`)}
      ${editing && total < editing.paid ? html`<p class="form-error">The guest already paid ${peso(editing.paid)}, so the total can't go below that.</p>` : ''}
      <p class="small ${short ? 'is-due' : 'muted'}">
        ${paid >= required
          ? `The downpayment is covered, so the booking ${editing ? 'stays' : 'is saved as'} confirmed.`
          : short
            ? `${peso(required - paid)} short of the downpayment, so the booking ${editing ? 'will be' : 'stays'} on hold.`
            : `No payment yet, so the booking ${editing ? 'stays' : 'is saved'} on hold.`}
      </p>
      ${editing || draft.deposit === required ? '' : html`
        <button class="btn btn--quiet btn--sm" type="button" data-action="use-suggested-deposit" data-amount="${required}">
          Use the ${DOWNPAYMENT_PERCENT}% downpayment of ${peso(required)}
        </button>`}
    </div>`;
}

const sameDiscount = (a: DiscountDraft, b: DiscountDraft): boolean =>
  a.kind === b.kind && a.value === b.value && a.note.trim() === b.note.trim();

interface FormOptions {
  /** Edit this booking instead of creating one. */
  editId?: string;
}

export function createBookingForm(prefill: BookingPrefill = {}, { editId }: FormOptions = {}): DrawerContent {
  let draft: Draft | null = null;
  let error = '';
  let discount = blankDiscount();
  let startingDiscount = blankDiscount();
  let canDiscount = false;
  const activeDiscount = () => (discount.value > 0 ? discount : null);

  const editingBooking = (state: State): Booking | null => (editId ? findBooking(state, editId) ?? null : null);
  const summaryContext = (state: State): SummaryContext => ({ discount: activeDiscount(), editing: editingBooking(state) });

  const refreshSummary = (root: HTMLElement, state: State) => {
    if (!draft) return;
    render($('[data-slot="summary"]', root), summaryTemplate(state, draft, summaryContext(state)));
    const preview = $maybe('[data-slot="discount-preview"]', root);
    if (preview) {
      const { estimate, off } = priced(state, draft, activeDiscount());
      preview.textContent = off ? `Takes ${peso(off)} off the ${peso(estimate.total)} price.` : '';
    }
    $('[data-slot="error"]', root).textContent = error;
  };

  function discountSection(ctx: Parameters<DrawerContent['render']>[0], form: Draft, editing: Booking | null): SafeHTML | '' {
    if (canDiscount) {
      return html`
        <fieldset class="form-section">
          <legend class="form-section__title">Discount (optional)</legend>
          ${discountFields(ctx.staff, discount, quote(ctx.state, form).total, 'discount')}
          ${editing?.discount ? html`<p class="small muted">Set the amount to 0 to remove the discount.</p>` : ''}
        </fieldset>`;
    }
    if (editing?.discount) {
      return html`<p class="notice">This booking keeps its ${peso(editing.discount.amount)} discount. Only accounts that can give discounts can change it.</p>`;
    }
    return '';
  }

  return {
    live: false,
    title: editId ? 'Edit booking' : 'New booking',

    render(ctx) {
      const { state } = ctx;
      const editing = editingBooking(state);
      if (editId && !editing) return html`<p class="muted">This booking no longer exists.</p>`;
      if (!draft) {
        draft = editing ? draftFromBooking(state, editing) : initialDraft(state, prefill);
        if (editing?.discount) {
          const { kind, value, note } = editing.discount;
          discount = { kind, value, note: note ?? '' };
          startingDiscount = { ...discount };
        }
      }
      const form = draft;
      canDiscount = ctx.can('discounts.apply');
      const sources = editing ? SOURCES : NEW_SOURCES;

      return html`
        <form class="booking-form" data-submit="save-booking" novalidate>
          ${form.inquiryId ? html`<p class="notice">Linked to inquiry ${form.inquiryId}. It will be marked as booked.</p>` : ''}
          ${editing ? html`<p class="small muted">Editing <span class="mono">${editing.id}</span>. Payments stay as they are; the price and downpayment are worked out again.</p>` : ''}

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
                  ${sources.map((source) => option(source, SOURCE_LABELS[source], form.source))}
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

          ${discountSection(ctx, form, editing)}

          <div data-slot="summary">${summaryTemplate(state, form, summaryContext(state))}</div>

          ${editing ? '' : html`
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
            </fieldset>`}

          <p class="form-error" data-slot="error" role="alert">${error}</p>

          <div class="button-row button-row--end">
            ${editing
              ? html`<button class="btn btn--quiet" type="button" data-action="back-to-booking">Cancel</button>`
              : html`<button class="btn btn--quiet" type="button" data-action="close-drawer">Cancel</button>`}
            <button class="btn btn--primary" type="submit">${editing ? 'Save changes' : 'Save booking'}</button>
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

      'back-to-booking': ({ ctx }) => {
        if (editId) ctx.openBooking(editId);
      },

      'save-booking': ({ ctx, root }) => {
        if (!draft) return;
        const { state } = ctx;
        const editing = editingBooking(state);
        const guests = draft.adults + draft.kids;
        const availability = checkAvailability(state, { ...draft, excludeId: editing?.id });
        const { estimate, total } = priced(state, draft, activeDiscount());
        const unit = findUnit(state, draft.product);
        const chosen = activeDiscount();
        const discountChanged = !sameDiscount(discount, startingDiscount);
        const discountError = chosen && canDiscount && discountChanged
          ? discountProblem(ctx.staff, chosen, estimate.total, editing?.paid ?? 0)
          : null;

        if (!draft.guestName.trim()) error = 'Enter the guest name.';
        else if (!draft.date) error = 'Pick a date.';
        else if (draft.mobile.trim() && !isPHMobile(draft.mobile)) error = 'Enter a PH mobile number, like 0917 123 4567, or leave it blank.';
        else if (guests === 0) error = 'Add at least one guest.';
        else if (!availability.ok) error = availability.reason ?? 'Not available.';
        else if (unit && guests > unit.capacityMax) error = `${unit.name} fits up to ${unit.capacityMax} guests.`;
        else if (discountError) error = discountError;
        else if (!chosen && discount.note.trim() && canDiscount && discountChanged) error = 'Enter the discount amount, or clear the reason.';
        else if (editing && total < editing.paid) error = `The guest already paid ${peso(editing.paid)}, so the total can't go below that.`;
        else if (!editing && draft.deposit > total) error = `The payment can't be more than the ${peso(total)} total.`;
        else error = '';

        if (error) {
          refreshSummary(root, state);
          return;
        }

        if (editing) {
          const result = updateBooking(editing.id, {
            guestName: draft.guestName,
            mobile: draft.mobile,
            source: draft.source,
            product: draft.product,
            date: draft.date,
            adults: draft.adults,
            kids: draft.kids,
            notes: draft.notes,
            discount: canDiscount && discountChanged ? chosen : 'keep',
          }, ctx.staff.id);
          if (result.error !== undefined) {
            error = result.error;
            refreshSummary(root, state);
            return;
          }
          const status = result.booking.status !== editing.status
            ? ` · now ${result.booking.status === 'confirmed' ? 'confirmed' : 'on hold'}`
            : '';
          ctx.toast(`Booking updated · total ${peso(result.booking.total)}${status}`);
          ctx.openBooking(editing.id);
          return;
        }

        const booking = createBooking({ ...draft, mobile: draft.mobile.trim(), discount: canDiscount ? chosen : null }, ctx.staff.id);
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
