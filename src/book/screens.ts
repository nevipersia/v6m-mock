// Markup for the booking page's three screens: the form, the thank-you and
// the "this link can't be used" message. Wording comes from booking-page.json.

import type { GuestBooking } from '../core/actions.js';
import { html, type SafeHTML, type TemplateValue } from '../core/dom.js';
import { formatDate, formatTime, peso, plural } from '../core/format.js';
import { checkAvailability, findStaff, findUnit, productLabel, quote } from '../core/rules.js';
import type { Booking, BookingLink, BookingPageSettings, State } from '../core/types.js';

export type Draft = Required<Pick<GuestBooking, 'guestName' | 'mobile' | 'product' | 'date' | 'adults' | 'kids' | 'notes'>>;

const card = (content: TemplateValue): SafeHTML => html`<section class="book__card">${content}</section>`;

function header(page: BookingPageSettings): SafeHTML {
  return html`
    <header class="book__head">
      <img src="../assets/img/logo.svg" alt="" width="44" height="44">
      <div>
        ${page.copy.eyebrow ? html`<p class="script book__eyebrow">${page.copy.eyebrow}</p>` : ''}
        <h1 class="book__title">${page.copy.title}</h1>
      </div>
    </header>`;
}

export interface ProductOption {
  value: string;
  label: string;
}

/** Everything a guest can book, narrowed to the products the page settings allow. */
export function bookableProducts(state: State, page: BookingPageSettings): ProductOption[] {
  const all: ProductOption[] = [
    ...state.poolSessions.map((session) => ({
      value: session.id,
      label: `${session.label} · ${formatTime(session.start)} – ${formatTime(session.end)}`,
    })),
    ...state.units.filter((unit) => unit.channel !== 'airbnb').map((unit) => ({
      value: unit.id,
      label: `${unit.name} · ${unit.capacityMin > 1 ? `${unit.capacityMin}–${unit.capacityMax}` : `up to ${unit.capacityMax}`} guests`,
    })),
  ];
  const allowed = all.filter((option) => page.products.includes(option.value));
  return allowed.length ? allowed : all;
}

export function summary(state: State, page: BookingPageSettings, draft: Draft): SafeHTML | '' {
  if (!page.fields.priceEstimate) return '';
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

function houseRules(page: BookingPageSettings): SafeHTML | '' {
  if (!page.houseRules.length) return '';
  return html`
    <ul class="book__rules">
      ${page.houseRules.map((rule) => html`<li>${rule}</li>`)}
    </ul>`;
}

export function problemScreen(page: BookingPageSettings, message: string): SafeHTML {
  return html`
    ${header(page)}
    ${card(html`
      <p class="book__problem">${message}</p>
      <p class="small muted">${page.copy.problemHelp}</p>`)}`;
}

export function formScreen(state: State, page: BookingPageSettings, link: BookingLink, draft: Draft, error: string): SafeHTML {
  const staff = findStaff(state, link.createdBy);
  const { copy, fields } = page;

  return html`
    ${header(page)}
    ${card(html`
      <p class="book__intro">
        ${staff ? `${staff.name} from V6M Resort sent you this link.` : 'V6M Resort sent you this link.'}
        ${link.note ? html`<span class="book__note">“${link.note}”</span>` : ''}
        ${copy.intro} It expires ${formatDate(link.expiresAt, 'long')}.
      </p>

      <form class="book__form" data-form novalidate>
        <label class="field">
          <span class="field__label">${copy.nameLabel}</span>
          <input class="input" name="guestName" data-input value="${draft.guestName}" placeholder="Maria Santos" autocomplete="name">
        </label>
        <label class="field">
          <span class="field__label">${copy.mobileLabel}</span>
          <input class="input" name="mobile" data-input type="tel" inputmode="tel" value="${draft.mobile}" placeholder="0917 123 4567" autocomplete="tel">
        </label>

        <div class="form-grid">
          <label class="field">
            <span class="field__label">${copy.productLabel}</span>
            <select class="input" name="product" data-input>
              ${bookableProducts(state, page).map((item) => html`<option value="${item.value}" ${item.value === draft.product ? 'selected' : ''}>${item.label}</option>`)}
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
          ${fields.kids ? html`
            <label class="field">
              <span class="field__label">Kids</span>
              <input class="input" name="kids" data-input type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${draft.kids || ''}">
            </label>` : ''}
        </div>

        ${fields.notes ? html`
          <label class="field">
            <span class="field__label">${copy.notesLabel}</span>
            <textarea class="input" name="notes" data-input rows="3" placeholder="${copy.notesPlaceholder}">${draft.notes}</textarea>
          </label>` : ''}

        <div data-slot="summary">${summary(state, page, draft)}</div>
        ${houseRules(page)}
        <p class="form-error" data-slot="error">${error}</p>

        <button class="btn btn--primary btn--block" type="submit">${copy.submitLabel}</button>
        <p class="small muted">${copy.paymentNote}</p>
      </form>`)}`;
}

export function doneScreen(state: State, page: BookingPageSettings, booking: Booking): SafeHTML {
  const unit = findUnit(state, booking.product);
  return html`
    ${header(page)}
    ${card(html`
      ${page.copy.thanksScript ? html`<p class="script book__thanks">${page.copy.thanksScript}</p>` : ''}
      <p class="book__intro">${page.copy.thanksText} <strong class="mono">${booking.id}</strong></p>
      <dl class="facts">
        <div class="facts__row"><dt>Booking</dt><dd>${productLabel(state, booking.product)}</dd></div>
        <div class="facts__row"><dt>Date</dt><dd>${formatDate(booking.date, 'long')}</dd></div>
        <div class="facts__row"><dt>Guests</dt><dd>${plural(booking.adults + booking.kids, 'guest')}</dd></div>
        <div class="facts__row"><dt>Estimated total</dt><dd>${peso(booking.total)}</dd></div>
        ${unit ? html`<div class="facts__row"><dt>Check in</dt><dd>${formatTime(unit.checkIn)}</dd></div>` : ''}
      </dl>
      <p class="small muted">${page.copy.doneNote}</p>`)}`;
}
