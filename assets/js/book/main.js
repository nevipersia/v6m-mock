// Single-use booking page. A staff member sends the link; the guest fills this
// in once and the booking appears on the V6M Desk calendar.

import { bookingLinkProblem, findBookingLink, useBookingLink } from '../core/actions.js';
import { $, html, on, render } from '../core/dom.js';
import { formatDate, formatTime, isPHMobile, parseDigits, peso, plural } from '../core/format.js';
import { checkAvailability, findStaff, findUnit, productLabel, quote } from '../core/rules.js';
import { getState, loadStore } from '../core/store.js';

const app = $('#app');
const code = new URLSearchParams(window.location.search).get('code') ?? '';

const draft = {
  guestName: '', mobile: '', product: 'daytour', date: '', adults: 2, kids: 0, notes: '',
};
let error = '';

const card = (content) => html`<section class="book__card">${content}</section>`;

function header(state) {
  return html`
    <header class="book__head">
      <img src="../assets/img/logo.svg" alt="" width="44" height="44">
      <div>
        <p class="script book__eyebrow">Almost there</p>
        <h1 class="book__title">Confirm your booking</h1>
      </div>
    </header>`;
}

function problemScreen(message) {
  render(app, html`
    ${header()}
    ${card(html`
      <p class="book__problem">${message}</p>
      <p class="small muted">Message V6M Resort on Facebook or Instagram and they will send a fresh link.</p>
      <a class="btn btn--secondary" href="../">Visit the website</a>`)}`);
}

function bookableProducts(state) {
  return [
    ...state.poolSessions.map((session) => ({ value: session.id, label: `${session.label} · ${formatTime(session.start)} – ${formatTime(session.end)}` })),
    ...state.units.filter((unit) => unit.channel !== 'airbnb').map((unit) => ({
      value: unit.id,
      label: `${unit.name} · ${unit.capacityMin > 1 ? `${unit.capacityMin}–${unit.capacityMax}` : `up to ${unit.capacityMax}`} guests`,
    })),
  ];
}

function summary(state) {
  const guests = draft.adults + draft.kids;
  if (!draft.date || guests === 0) return html`<p class="small muted">Pick a date and how many are coming to see the price.</p>`;

  const availability = checkAvailability(state, draft);
  const estimate = quote(state, draft);

  return html`
    <div class="quote-box">
      <div class="quote-box__status">
        ${availability.ok
          ? html`<span class="pill pill--success">Available</span>`
          : html`<span class="pill pill--danger">Not available</span> <span class="small">${availability.reason}</span>`}
      </div>
      <dl class="line-items">
        ${estimate.lines.map((line) => html`
          <div class="line-items__row"><dt>${line.label} <span class="muted">${line.qty} × ${peso(line.unitPrice)}</span></dt><dd>${peso(line.amount)}</dd></div>`)}
        ${estimate.promo ? html`
          <div class="line-items__row line-items__row--discount"><dt>${estimate.promo.name} (${estimate.promo.percent}%)</dt><dd>−${peso(estimate.discount)}</dd></div>` : ''}
        <div class="line-items__row line-items__row--total"><dt>Estimated total</dt><dd>${peso(estimate.total)}</dd></div>
      </dl>
      ${estimate.warnings.map((warning) => html`<p class="form-error">${warning}</p>`)}
    </div>`;
}

function formScreen(state, link) {
  const staff = findStaff(state, link.createdBy);

  render(app, html`
    ${header(state)}
    ${card(html`
      <p class="book__intro">
        ${staff ? `${staff.name} from V6M Resort sent you this link.` : 'V6M Resort sent you this link.'}
        ${link.note ? html`<span class="book__note">“${link.note}”</span>` : ''}
        Fill it in once and the front desk will hold your slot. It expires ${formatDate(link.expiresAt, 'long')}.
      </p>

      <form class="book__form" data-form novalidate>
        <label class="field">
          <span class="field__label">Your name</span>
          <input class="input" name="guestName" data-input value="${draft.guestName}" placeholder="Maria Santos" autocomplete="name">
        </label>
        <label class="field">
          <span class="field__label">Mobile number</span>
          <input class="input" name="mobile" data-input type="tel" inputmode="tel" value="${draft.mobile}" placeholder="0917 123 4567" autocomplete="tel">
        </label>

        <div class="form-grid">
          <label class="field">
            <span class="field__label">What are you booking?</span>
            <select class="input" name="product" data-input>
              ${bookableProducts(state).map((item) => html`<option value="${item.value}" ${item.value === draft.product ? 'selected' : ''}>${item.label}</option>`)}
            </select>
          </label>
          <label class="field">
            <span class="field__label">Date</span>
            <input class="input" name="date" data-input type="date" value="${draft.date}">
          </label>
          <label class="field">
            <span class="field__label">Adults</span>
            <input class="input" name="adults" data-input type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${draft.adults || ''}">
          </label>
          <label class="field">
            <span class="field__label">Kids</span>
            <input class="input" name="kids" data-input type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${draft.kids || ''}">
          </label>
        </div>

        <label class="field">
          <span class="field__label">Anything we should know? (optional)</span>
          <textarea class="input" name="notes" data-input rows="3" placeholder="Celebrating a birthday, bringing a dog…">${draft.notes}</textarea>
        </label>

        <div data-slot="summary">${summary(state)}</div>
        <p class="form-error" data-slot="error">${error}</p>

        <button class="btn btn--primary btn--block" type="submit">Send my booking</button>
        <p class="small muted">No payment here. The front desk will message you the deposit details.</p>
      </form>`)}`);
}

function doneScreen(state, booking) {
  const unit = findUnit(state, booking.product);
  render(app, html`
    ${header(state)}
    ${card(html`
      <p class="script book__thanks">Salamat!</p>
      <p class="book__intro">Your booking is with the front desk. Keep this reference: <strong class="mono">${booking.id}</strong></p>
      <dl class="facts">
        <div class="facts__row"><dt>Booking</dt><dd>${productLabel(state, booking.product)}</dd></div>
        <div class="facts__row"><dt>Date</dt><dd>${formatDate(booking.date, 'long')}</dd></div>
        <div class="facts__row"><dt>Guests</dt><dd>${plural(booking.adults + booking.kids, 'guest')}</dd></div>
        <div class="facts__row"><dt>Estimated total</dt><dd>${peso(booking.total)}</dd></div>
        ${unit ? html`<div class="facts__row"><dt>Check in</dt><dd>${formatTime(unit.checkIn)}</dd></div>` : ''}
      </dl>
      <p class="small muted">V6M holds the slot until the deposit comes in. This link cannot be used again.</p>
      <a class="btn btn--secondary" href="../">Visit the website</a>`)}`);
}

function bindForm(state, link) {
  on(app, 'input', '[data-input]', (event, el) => {
    if (['adults', 'kids'].includes(el.name)) {
      draft[el.name] = parseDigits(el.value);
      const formatted = String(parseDigits(el.value) || '');
      if (formatted !== el.value) el.value = formatted;
    } else {
      draft[el.name] = el.value;
    }
    error = '';
    render($('[data-slot="summary"]', app), summary(state));
    $('[data-slot="error"]', app).textContent = '';
  });

  on(app, 'submit', 'form[data-form]', (event) => {
    event.preventDefault();
    const guests = draft.adults + draft.kids;
    const availability = draft.date ? checkAvailability(state, draft) : { ok: false, reason: 'Pick a date.' };
    const unit = findUnit(state, draft.product);

    if (!draft.guestName.trim()) error = 'Enter your name.';
    else if (!isPHMobile(draft.mobile)) error = 'Enter a PH mobile number, like 0917 123 4567.';
    else if (!draft.date) error = 'Pick a date.';
    else if (guests === 0) error = 'Add at least one guest.';
    else if (!availability.ok) error = availability.reason;
    else if (unit && guests > unit.capacityMax) error = `${unit.name} fits up to ${unit.capacityMax} guests.`;
    else error = '';

    if (error) {
      $('[data-slot="error"]', app).textContent = error;
      return;
    }

    const result = useBookingLink(link.code, draft);
    if (result.error) {
      problemScreen(result.error);
      return;
    }
    doneScreen(state, result.booking);
  });
}

async function start() {
  let state;
  try {
    state = await loadStore();
  } catch (loadError) {
    problemScreen(`${loadError.message}. Start the local server with npm start and open it from there.`);
    return;
  }

  const link = findBookingLink(state, code);
  const problem = bookingLinkProblem(state, link);
  if (problem) {
    problemScreen(problem);
    return;
  }

  draft.date = link.date ?? state.meta.asOf;
  if (link.product) draft.product = link.product;
  const unit = findUnit(state, draft.product);
  if (unit?.capacityMin > 1) draft.adults = unit.capacityMin;

  formScreen(state, link);
  bindForm(getState(), link);
}

start();
