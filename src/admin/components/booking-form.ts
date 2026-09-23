// Booking form drawer, for new bookings and for editing one that has not
// arrived yet. Live availability check, price quote and discount either way.

import { createBooking, updateBooking, type NewBooking } from '../../core/actions.js';
import { $, $maybe, html, render, type SafeHTML } from '../../core/dom.js';
import { allProductIds, productGroups } from '../../core/catalog.js';
import { formatDigits, isPHMobile, parseDigits, peso } from '../../core/format.js';
import {
  DOWNPAYMENT_PERCENT, METHOD_LABELS, SOURCE_LABELS, checkAvailability, closingEvent, depositRequired, discountAmount,
  discountProblem, findBooking, findExclusive, findGuest, findUnit, quote,
} from '../../core/rules.js';
import type { Booking, BookingSource, Companion, ExtraCharge, PaymentMethod, State } from '../../core/types.js';
import { asField, type BookingPrefill, type DrawerContent } from '../types.js';
import { blankCompanion, fitGuestList, guestListRows, namedGuests, readGuestListField } from '../../core/guest-list.js';
import { blankDiscount, discountFields, readDiscountField, type DiscountDraft } from './discount-fields.js';

const SOURCES: BookingSource[] = ['walk_in', 'phone', 'messenger', 'instagram', 'website', 'booking_link'];
const NEW_SOURCES: BookingSource[] = ['walk_in', 'phone', 'messenger', 'instagram', 'website'];
const METHODS: PaymentMethod[] = ['gcash', 'cash', 'bank_transfer'];

type NumberField = 'adults' | 'kids' | 'deposit' | 'scPwd';
type TextField = 'guestName' | 'mobile' | 'product' | 'date' | 'reference' | 'notes' | 'address' | 'email' | 'sentTime' | 'senderName';

const NUMBER_FIELDS: readonly string[] = ['adults', 'kids', 'deposit', 'scPwd'] satisfies NumberField[];
const TEXT_FIELDS: readonly string[] = [
  'guestName', 'mobile', 'product', 'date', 'reference', 'notes', 'address', 'email', 'sentTime', 'senderName',
] satisfies TextField[];

/** Charges from the registration sheet. Staff type the amount; none of these have set prices. */
const EXTRA_PRESETS = ['Videoke', 'Corkage', 'Extra adult', 'Extra kid', 'Extra cottage', 'Extra room', 'Grill use'];
/** Picked from the dropdown when the charge is not on the list, so staff can type it. */
const EXTRA_OTHER = '__other';

/** A charge being edited: `custom` means it is typed in rather than picked. */
type ExtraDraft = ExtraCharge & { custom: boolean };

const extraDraft = (extra: ExtraCharge): ExtraDraft => ({ ...extra, custom: !EXTRA_PRESETS.includes(extra.label) });

/** The form keeps every field as a plain value; optional text fields are never undefined here. */
type Draft = Omit<NewBooking, 'extras'> & {
  mobile: string; reference: string; notes: string; inquiryId: string | null;
  address: string; email: string; scPwd: number; extras: ExtraDraft[]; sentTime: string; senderName: string;
  guestList: Companion[];
};

const isEmail = (value: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());

function initialDraft(state: State, prefill: BookingPrefill): Draft {
  const products = allProductIds(state);
  const product = prefill.product && products.includes(prefill.product) ? prefill.product : 'daytour';
  const unit = findUnit(state, product);
  const adults = unit && unit.capacityMin > 1 ? unit.capacityMin : 2;
  return {
    guestList: fitGuestList([], adults),
    guestName: prefill.guestName ?? '',
    mobile: prefill.mobile ?? '',
    source: NEW_SOURCES.find((source) => source === prefill.source) ?? 'walk_in',
    product,
    date: prefill.date || state.meta.asOf,
    adults,
    kids: 0,
    deposit: 0,
    method: 'gcash',
    reference: '',
    notes: '',
    inquiryId: prefill.inquiryId ?? null,
    address: '',
    email: '',
    scPwd: 0,
    extras: [],
    sentTime: '',
    senderName: '',
  };
}

function draftFromBooking(state: State, booking: Booking): Draft {
  const guest = findGuest(state, booking.guestId);
  return {
    guestList: fitGuestList((booking.guestList ?? []).map((row) => ({ ...row })), booking.adults + booking.kids),
    address: guest?.address ?? '',
    email: guest?.email ?? '',
    scPwd: booking.scPwd ?? 0,
    extras: (booking.extras ?? []).map(extraDraft),
    sentTime: '',
    senderName: '',
    guestName: booking.guestName,
    mobile: guest?.mobile ?? '',
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

/** Updates just the "3 of 5 named" line while staff type into the rows. */
function refreshGuestCount(root: HTMLElement, form: Draft): void {
  const label = $maybe('.guest-count', root);
  if (!label) return;
  const pax = form.adults + form.kids;
  const named = namedGuests(form.guestList).length;
  label.textContent = `${named} of ${pax} named`;
  label.classList.toggle('guest-count--short', named < pax);
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

  /** The rows and the counter: redrawn on their own when the headcount changes. */
  function guestListBody(form: Draft): SafeHTML {
    const pax = form.adults + form.kids;
    const named = namedGuests(form.guestList).length;
    return html`
      ${guestListRows(form.guestList, 'companion')}
      <div class="guest-rows__foot">
        <button class="btn btn--quiet btn--sm" type="button" data-action="add-companion">+ Add a guest</button>
        <span class="guest-count ${named < pax ? 'guest-count--short' : ''}">${named} of ${pax} named</span>
      </div>`;
  }

  function guestListSection(form: Draft): SafeHTML {
    return html`
      <fieldset class="form-section">
        <legend class="form-section__title">Who is coming</legend>
        <div data-slot="guest-list">${guestListBody(form)}</div>
        <p class="small muted">The names on the registration sheet. Leave blanks if they will sign at the gate.</p>
      </fieldset>`;
  }

  function extrasSection(form: Draft): SafeHTML {
    return html`
      <fieldset class="form-section">
        <legend class="form-section__title">Additional charges</legend>
        ${form.extras.length ? html`
          <ul class="extra-rows">
            ${form.extras.map((extra, index) => html`
              <li class="extra-row ${extra.custom ? 'extra-row--custom' : ''}">
                <select class="input ${extra.custom || extra.label ? '' : 'is-placeholder'}" data-input="extra" data-row="${index}"
                  name="extraKind" aria-label="Charge ${index + 1}">
                  <option value="" ${extra.custom || extra.label ? '' : 'selected'}>Choose a charge…</option>
                  ${EXTRA_PRESETS.map((preset) => html`<option ${!extra.custom && extra.label === preset ? 'selected' : ''}>${preset}</option>`)}
                  <option value="${EXTRA_OTHER}" ${extra.custom ? 'selected' : ''}>Other…</option>
                </select>
                <input class="input input--amount" data-input="extra" data-row="${index}" name="extraAmount" value="${formatDigits(extra.amount)}"
                  inputmode="numeric" placeholder="₱0" aria-label="Charge ${index + 1} amount" autocomplete="off">
                <button class="guest-row__remove" type="button" data-action="remove-extra" data-row="${index}" aria-label="Remove charge ${index + 1}">×</button>
                ${extra.custom ? html`
                  <input class="input extra-row__label" data-input="extra" data-row="${index}" name="extraLabel" value="${extra.label}"
                    placeholder="What is the charge for?" aria-label="Charge ${index + 1} name" autocomplete="off">` : ''}
              </li>`)}
          </ul>` : ''}
        <button class="btn btn--quiet btn--sm" type="button" data-action="add-extra">+ Add a charge</button>
        <p class="small muted">From the registration sheet: videoke, corkage, extra heads, extra cottage or room. Pick “Other…” to type anything else, then the amount.</p>
      </fieldset>`;
  }

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
                <span class="field__label">Contact number</span>
                <input class="input" name="mobile" data-input="field" type="tel" value="${form.mobile}" placeholder="0917 123 4567">
              </label>
              <label class="field">
                <span class="field__label">Email (optional)</span>
                <input class="input" name="email" data-input="field" type="email" value="${form.email}" placeholder="maria@example.com" autocomplete="off">
              </label>
            </div>
            <label class="field">
              <span class="field__label">Complete address</span>
              <input class="input" name="address" data-input="field" value="${form.address}" placeholder="House no., street, barangay, city" autocomplete="off">
            </label>
            <label class="field">
              <span class="field__label">Booked via</span>
              <select class="input" name="source" data-input="field">
                ${sources.map((source) => option(source, SOURCE_LABELS[source], form.source))}
              </select>
            </label>
          </fieldset>

          <fieldset class="form-section">
            <legend class="form-section__title">Stay</legend>
            <div class="form-grid">
              <label class="field">
                <span class="field__label">Booking</span>
                <select class="input" name="product" data-input="field">
                  ${productGroups(state).map((group) => html`
                    <optgroup label="${group.label}">${group.options.map((item) => option(item.value, item.label, form.product))}</optgroup>`)}
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
              <label class="field">
                <span class="field__label">SC / PWD</span>
                <input class="input" name="scPwd" data-input="field" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${form.scPwd || ''}">
              </label>
            </div>
            ${findExclusive(state, form.product) ? html`
              <p class="notice notice--exclusive">Exclusive rental: no other guests are booked while this group is here. ${findExclusive(state, form.product)?.includes}.</p>` : ''}
            <label class="field">
              <span class="field__label">Notes (optional)</span>
              <input class="input" name="notes" data-input="field" value="${form.notes}" placeholder="Celebrating a birthday">
            </label>
          </fieldset>

          ${guestListSection(form)}

          ${extrasSection(form)}

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
              <div class="form-grid">
                <label class="field">
                  <span class="field__label">Time sent</span>
                  <input class="input" name="sentTime" data-input="field" type="time" value="${form.sentTime}">
                </label>
                <label class="field">
                  <span class="field__label">${form.method === 'gcash' ? 'GCash sender' : 'Sent by'}</span>
                  <input class="input" name="senderName" data-input="field" value="${form.senderName}" placeholder="Name on the account" autocomplete="off">
                </label>
              </div>
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
      extra: ({ el, ctx, root, redraw }) => {
        if (!draft) return;
        const field = asField(el);
        const index = Number(field.dataset.row);
        const row = draft.extras[index];
        if (!row) return;
        if (field.name === 'extraKind') {
          // "Other…" swaps the dropdown for a box to type the charge in.
          row.custom = field.value === EXTRA_OTHER;
          row.label = row.custom ? '' : field.value;
          error = '';
          redraw();
          if (row.custom) $maybe<HTMLInputElement>(`[name="extraLabel"][data-row="${index}"]`, root.ownerDocument.body)?.focus();
          return;
        }
        if (field.name === 'extraLabel') row.label = field.value;
        else {
          row.amount = parseDigits(field.value);
          const formatted = formatDigits(field.value);
          if (formatted !== field.value) field.value = formatted;
        }
        error = '';
        refreshSummary(root, ctx.state);
      },

      companion: ({ el, root }) => {
        if (!draft) return;
        const field = asField(el) as HTMLInputElement | HTMLSelectElement;
        const shown = readGuestListField(draft.guestList, field);
        if (shown !== null && shown !== field.value) field.value = shown;
        if (field.name === 'companionName') refreshGuestCount(root, draft);
      },

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
          if (field.name === 'adults' || field.name === 'kids') {
            draft.guestList = fitGuestList(draft.guestList, draft.adults + draft.kids);
            const slot = $maybe('[data-slot="guest-list"]', root);
            if (slot) render(slot, guestListBody(draft));
          }
        } else if (field.name === 'source') {
          draft.source = field.value as BookingSource;
        } else if (field.name === 'method') {
          draft.method = field.value as PaymentMethod;
          const senderLabel = $maybe('[name="senderName"]', root)?.closest('.field')?.querySelector('.field__label');
          if (senderLabel) senderLabel.textContent = draft.method === 'gcash' ? 'GCash sender' : 'Sent by';
        } else if (TEXT_FIELDS.includes(field.name)) {
          draft[field.name as TextField] = field.value;
        }
        error = '';
        refreshSummary(root, ctx.state);
      },
    },

    actions: {
      'add-extra': ({ redraw }) => {
        if (!draft) return;
        draft.extras.push({ label: '', amount: 0, custom: false });
        redraw();
      },

      'add-companion': ({ redraw }) => {
        if (!draft) return;
        draft.guestList.push(blankCompanion());
        redraw();
      },

      'remove-companion': ({ el, redraw }) => {
        if (!draft) return;
        draft.guestList.splice(Number(el.dataset.row), 1);
        if (!draft.guestList.length) draft.guestList.push(blankCompanion());
        redraw();
      },

      'remove-extra': ({ el, redraw }) => {
        if (!draft) return;
        draft.extras.splice(Number(el.dataset.row), 1);
        redraw();
      },

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
        else if (draft.email.trim() && !isEmail(draft.email)) error = 'Enter an email address like maria@example.com, or leave it blank.';
        else if (draft.scPwd > guests) error = 'SC / PWD can\'t be more than the number of guests.';
        else if (draft.extras.some((extra) => extra.amount > 0 && !extra.label.trim())) error = 'Name each additional charge.';
        else if (namedGuests(draft.guestList).length > guests) error = `You listed ${namedGuests(draft.guestList).length} names but only ${guests} ${guests === 1 ? 'guest' : 'guests'}. Raise the headcount or take a name off.`;
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
            address: draft.address,
            email: draft.email,
            scPwd: draft.scPwd,
            extras: draft.extras,
            guestList: draft.guestList,
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
