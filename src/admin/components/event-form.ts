// New private event: the pipeline record, and the booking that closes the date
// once the event is reserved. Given an inquiry's id, the same form edits it.

import { createEvent, deleteEvent, updateEvent, type NewEvent } from '../../core/actions.js';
import { $maybe, html, render, type SafeHTML } from '../../core/dom.js';
import { formatDigits, isPHMobile, parseDigits, peso, plural } from '../../core/format.js';
import { DOWNPAYMENT_PERCENT, METHOD_LABELS, STAGE_LABELS, closingEvent, findGuest, findPackage, live } from '../../core/rules.js';
import type { EventStage, PaymentMethod, ResortEvent, State } from '../../core/types.js';
import { asField, type DrawerContent } from '../types.js';
import { icon } from './icons.js';

const STAGES: EventStage[] = ['inquiry', 'reserved', 'paid'];
const METHODS: PaymentMethod[] = ['gcash', 'cash', 'bank_transfer'];

/** Stages that take the date: these write a booking as well as the event. */
const BOOKS_THE_DATE: EventStage[] = ['reserved', 'paid'];

const ADD_ON_PRESETS = ['Extra guests', 'Sound system', 'Extra hours', 'Styling and setup', 'Catering corkage', 'Extra room'];

type Draft = NewEvent;

function initialDraft(state: State): Draft {
  const first = live(state.eventPackages)[0];
  return {
    title: '',
    date: state.meta.asOf,
    packageId: first?.id ?? '',
    addOns: [],
    guests: first?.maxGuests ?? 50,
    exclusive: first?.exclusive ?? true,
    stage: 'inquiry',
    contactName: '',
    contactMobile: '',
    coordinatorId: '',
    notes: '',
    deposit: 0,
    method: 'gcash',
  };
}

/** The form filled in from a saved inquiry. */
function draftFrom(state: State, event: ResortEvent): Draft {
  const contact = findGuest(state, event.contactGuestId);
  // A name the desk made up for a nameless inquiry shows as an empty box.
  const madeUp = event.title === 'Event inquiry' || (contact && event.title === `${contact.name} inquiry`);
  return {
    title: madeUp ? '' : event.title,
    date: event.date,
    packageId: event.packageId,
    addOns: event.addOns.map((addOn) => ({ ...addOn })),
    guests: event.guests,
    exclusive: event.exclusive,
    stage: event.stage,
    // A contact saved from a number alone is named after it; show that as no name.
    contactName: contact && contact.name !== contact.mobile ? contact.name : '',
    contactMobile: contact?.mobile ?? '',
    coordinatorId: event.coordinatorId,
    notes: event.notes ?? '',
    deposit: 0,
    method: 'gcash',
  };
}

const option = (value: string, label: string, selected: string): SafeHTML =>
  html`<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`;

const addOnTotal = (draft: Draft): number =>
  draft.addOns.reduce((sum, addOn) => sum + (addOn.item.trim() ? addOn.amount : 0), 0);

export function createEventForm(eventId?: string): DrawerContent {
  let draft: Draft | null = null;
  let error = '';
  let confirmRemove = false;

  function summary(state: State, form: Draft): SafeHTML {
    const pkg = findPackage(state, form.packageId);
    if (!pkg) return html`<p class="small muted">Pick a package to see the price.</p>`;
    const total = pkg.price + addOnTotal(form);
    const books = BOOKS_THE_DATE.includes(form.stage);
    const closes = form.exclusive && books;
    const clash = closes ? closingEvent(state, form.date) : undefined;

    return html`
      <div class="quote-box">
        <dl class="line-items">
          <div class="line-items__row"><dt>${pkg.name}</dt><dd>${peso(pkg.price)}</dd></div>
          ${form.addOns.filter((addOn) => addOn.item.trim() && addOn.amount > 0).map((addOn) => html`
            <div class="line-items__row"><dt>${addOn.item}</dt><dd>${peso(addOn.amount)}</dd></div>`)}
          <div class="line-items__row line-items__row--total"><dt>Total</dt><dd>${peso(total)}</dd></div>
          ${books ? html`
            <div class="line-items__row line-items__row--downpayment"><dt>${DOWNPAYMENT_PERCENT}% downpayment to confirm</dt><dd>${peso(Math.ceil(total * 0.5))}</dd></div>` : ''}
        </dl>
        <p class="small ${clash ? 'is-due' : 'muted'}">
          ${clash
            ? `${clash.title} already closes the resort that day.`
            : books
              ? closes
                ? `Saved as a booking and the resort closes on that date, up to ${plural(pkg.maxGuests, 'guest')}.`
                : 'Saved as a booking. Other guests can still book that day.'
              : 'Kept in the pipeline only. Nothing is booked and the date stays open. Every detail is optional for an inquiry.'}
        </p>
      </div>`;
  }

  const refresh = (root: HTMLElement, state: State) => {
    if (!draft) return;
    const slot = $maybe('[data-slot="event-summary"]', root);
    if (slot) render(slot, summary(state, draft));
    const errorSlot = $maybe('[data-slot="error"]', root);
    if (errorSlot) errorSlot.textContent = error;
  };

  return {
    live: false,
    title: eventId ? 'Edit inquiry' : 'New event',

    render(ctx) {
      const { state } = ctx;
      const editing = eventId ? state.events.find((event) => event.id === eventId) : undefined;
      if (eventId && (!editing || editing.bookingId)) {
        return html`<p class="muted">${editing ? 'This event is booked now. Change it from its booking.' : 'This event no longer exists.'}</p>`;
      }
      if (!draft) draft = editing ? draftFrom(state, editing) : initialDraft(state);
      const form = draft;
      const pkg = findPackage(state, form.packageId);
      const books = BOOKS_THE_DATE.includes(form.stage);

      return html`
        <form class="booking-form" data-submit="save-event" novalidate>
          <fieldset class="form-section">
            <legend class="form-section__title">Event</legend>
            <label class="field">
              <span class="field__label">What is it called</span>
              <input class="input" name="title" data-input="field" value="${form.title}" placeholder="Cruz 18th debut" autocomplete="off">
            </label>
            <label class="field">
              <span class="field__label">Package</span>
              <select class="input" name="packageId" data-input="field">
                ${live(state.eventPackages).map((item) => option(item.id, `${item.name} · ${peso(item.price)} · up to ${item.maxGuests}`, form.packageId))}
              </select>
            </label>
            ${pkg ? html`<p class="small muted">${pkg.hours.replace('-', '–')} · ${pkg.inclusions.join(' · ')}</p>` : ''}
            <div class="form-grid">
              <label class="field">
                <span class="field__label">Date</span>
                <input class="input" name="date" data-input="field" type="date" value="${form.date}">
              </label>
              <label class="field">
                <span class="field__label">Guests</span>
                <input class="input" name="guests" data-input="field" type="text" inputmode="numeric" autocomplete="off" value="${form.guests || ''}">
              </label>
            </div>
            <label class="checkbox">
              <input type="checkbox" name="exclusive" data-input="field" ${form.exclusive ? 'checked' : ''}>
              <span>Closes the resort for the day</span>
            </label>
          </fieldset>

          <fieldset class="form-section">
            <legend class="form-section__title">Who is arranging it</legend>
            <div class="form-grid">
              <label class="field">
                <span class="field__label">Contact name</span>
                <input class="input" name="contactName" data-input="field" value="${form.contactName}" placeholder="Nico Dela Cruz" autocomplete="off">
              </label>
              <label class="field">
                <span class="field__label">Contact number</span>
                <input class="input" name="contactMobile" data-input="field" type="tel" value="${form.contactMobile}" placeholder="0917 123 4567">
              </label>
            </div>
            <label class="field">
              <span class="field__label">Coordinator</span>
              <select class="input" name="coordinatorId" data-input="field">
                ${state.staff.filter((person) => person.status === 'active')
                  .map((person) => option(person.id, person.name, form.coordinatorId || ctx.staff.id))}
              </select>
            </label>
          </fieldset>

          <fieldset class="form-section">
            <legend class="form-section__title">Add-ons</legend>
            ${form.addOns.length ? html`
              <ul class="extra-rows">
                ${form.addOns.map((addOn, index) => html`
                  <li class="extra-row">
                    <input class="input" data-input="addon" data-row="${index}" name="addOnItem" value="${addOn.item}"
                      list="addon-presets" placeholder="Sound system, extra hours…" aria-label="Add-on ${index + 1}" autocomplete="off">
                    <input class="input input--amount" data-input="addon" data-row="${index}" name="addOnAmount" value="${addOn.amount ? formatDigits(addOn.amount) : ''}"
                      inputmode="numeric" placeholder="₱0" aria-label="Add-on ${index + 1} amount" autocomplete="off">
                    <button class="guest-row__remove" type="button" data-action="remove-addon" data-row="${index}" aria-label="Remove add-on ${index + 1}">×</button>
                  </li>`)}
              </ul>` : ''}
            <datalist id="addon-presets">${ADD_ON_PRESETS.map((preset) => html`<option value="${preset}"></option>`)}</datalist>
            <button class="btn btn--quiet btn--sm" type="button" data-action="add-addon">+ Add an add-on</button>
          </fieldset>

          <fieldset class="form-section">
            <legend class="form-section__title">Where it stands</legend>
            <label class="field">
              <span class="field__label">Stage</span>
              <select class="input" name="stage" data-input="field">
                ${STAGES.map((stage) => option(stage, STAGE_LABELS[stage], form.stage))}
              </select>
            </label>
            <label class="field">
              <span class="field__label">Notes (optional)</span>
              <input class="input" name="notes" data-input="field" value="${form.notes}" placeholder="Program starts 6 PM">
            </label>
          </fieldset>

          <div data-slot="event-summary">${summary(state, form)}</div>

          ${books ? html`
            <fieldset class="form-section">
              <legend class="form-section__title">Downpayment received</legend>
              <div class="form-grid">
                <label class="field">
                  <span class="field__label">Amount (₱)</span>
                  <input class="input input--amount" name="deposit" data-input="field" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${form.deposit ? formatDigits(form.deposit) : ''}">
                </label>
                <label class="field">
                  <span class="field__label">Method</span>
                  <select class="input" name="method" data-input="field">
                    ${METHODS.map((method) => option(method, METHOD_LABELS[method], form.method))}
                  </select>
                </label>
              </div>
              <p class="small muted">Leave it blank to hold the date until they pay.</p>
            </fieldset>` : ''}

          <p class="form-error" data-slot="error" role="alert">${error}</p>

          <div class="button-row button-row--end">
            <button class="btn btn--quiet" type="button" data-action="close-drawer">Cancel</button>
            <button class="btn btn--primary" type="submit">${eventId ? 'Save changes' : 'Save event'}</button>
          </div>
        </form>

        ${eventId ? html`
          <div class="detail-section">
            ${confirmRemove ? html`
              <div class="action-card action-card--danger">
                <h4 class="action-card__title">Remove ${form.title.trim() || 'this inquiry'}?</h4>
                <p class="small muted">It leaves the pipeline for good. Nothing was booked, so no date or payment changes.</p>
                <div class="button-row">
                  <button class="btn btn--quiet" type="button" data-action="keep-inquiry">Keep it</button>
                  <button class="btn btn--danger" type="button" data-action="confirm-remove-inquiry">Remove</button>
                </div>
              </div>` : html`
              <button class="btn btn--quiet btn--danger-text" type="button" data-action="ask-remove-inquiry">${icon('trash')} Remove inquiry</button>`}
          </div>` : ''}`;
    },

    inputs: {
      field: ({ el, ctx, root, redraw }) => {
        if (!draft) return;
        const field = asField(el);
        if (field.name === 'guests' || field.name === 'deposit') {
          draft[field.name] = parseDigits(field.value);
          const formatted = field.name === 'deposit' ? formatDigits(field.value) : String(parseDigits(field.value) || '');
          if (formatted !== field.value) field.value = formatted;
        } else if (field.name === 'exclusive') {
          draft.exclusive = (field as HTMLInputElement).checked;
        } else if (field.name === 'packageId') {
          draft.packageId = field.value;
          const pkg = findPackage(ctx.state, field.value);
          // A package's own guest ceiling and exclusivity come with it.
          if (pkg) {
            draft.exclusive = pkg.exclusive;
            if (draft.guests > pkg.maxGuests) draft.guests = pkg.maxGuests;
          }
          error = '';
          redraw();
          return;
        } else if (field.name === 'stage') {
          draft.stage = field.value as EventStage;
          error = '';
          redraw();
          return;
        } else if (field.name === 'method') {
          draft.method = field.value as PaymentMethod;
        } else {
          draft[field.name as 'title'] = field.value;
        }
        error = '';
        refresh(root, ctx.state);
      },

      addon: ({ el, ctx, root }) => {
        if (!draft) return;
        const field = el as HTMLInputElement;
        const row = draft.addOns[Number(field.dataset.row)];
        if (!row) return;
        if (field.name === 'addOnItem') row.item = field.value;
        else {
          row.amount = parseDigits(field.value);
          const formatted = formatDigits(field.value);
          if (formatted !== field.value) field.value = formatted;
        }
        error = '';
        refresh(root, ctx.state);
      },
    },

    actions: {
      'ask-remove-inquiry': ({ redraw }) => {
        confirmRemove = true;
        redraw();
      },

      'keep-inquiry': ({ redraw }) => {
        confirmRemove = false;
        redraw();
      },

      'confirm-remove-inquiry': ({ ctx, root }) => {
        if (!eventId) return;
        const result = deleteEvent(eventId, ctx.staff.id);
        if (result.error !== undefined) {
          error = result.error;
          confirmRemove = false;
          refresh(root, ctx.state);
          return;
        }
        ctx.toast(`${result.event.title} removed`, 'warning');
        ctx.closeDrawer();
      },

      'add-addon': ({ redraw }) => {
        if (!draft) return;
        draft.addOns.push({ item: '', amount: 0 });
        redraw();
      },

      'remove-addon': ({ el, redraw }) => {
        if (!draft) return;
        draft.addOns.splice(Number(el.dataset.row), 1);
        redraw();
      },

      'save-event': ({ ctx, root }) => {
        if (!draft) return;
        if (draft.contactMobile.trim() && !isPHMobile(draft.contactMobile)) {
          error = 'Enter a PH mobile number, like 0917 123 4567, or leave it blank.';
          refresh(root, ctx.state);
          return;
        }
        const input = { ...draft, coordinatorId: draft.coordinatorId || ctx.staff.id };
        const result = eventId ? updateEvent(eventId, input, ctx.staff.id) : createEvent(input, ctx.staff.id);
        if (result.error !== undefined) {
          error = result.error;
          refresh(root, ctx.state);
          return;
        }
        ctx.toast(result.booking
          ? `${result.event.title} booked · ${peso(result.booking.total)}${result.booking.status === 'confirmed' ? ' · confirmed' : ' · on hold'}`
          : eventId ? `${result.event.title} saved` : `${result.event.title} added to the pipeline`);
        if (result.booking) ctx.openBooking(result.booking.id);
        else ctx.closeDrawer();
      },
    },
  };
}
