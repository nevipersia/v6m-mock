// Markup for the booking page's screens: the form, the downpayment QR, the
// thank-you and the "this link can't be used" message. Wording comes from
// booking-page.json.

import { productGroups, productInfo, type ProductGroup } from '../core/catalog.js';
import { html, type SafeHTML, type TemplateValue } from '../core/dom.js';
import { formatDate, formatTime, peso, plural } from '../core/format.js';
import { guestListRows } from '../core/guest-list.js';
import { paymentCard, type PaymentCardState } from '../core/payment-card.js';
import type { QrPaymentRequest } from '../core/qr-payment.js';
import {
  DOWNPAYMENT_PERCENT, checkAvailability, depositRequired, findExclusive, findStaff, findUnit, productLabel, quote,
} from '../core/rules.js';
import type { Booking, BookingLink, BookingPageSettings, Companion, Payment, State } from '../core/types.js';

export interface Draft {
  guestName: string;
  mobile: string;
  email: string;
  address: string;
  product: string;
  date: string;
  adults: number;
  kids: number;
  scPwd: number;
  notes: string;
  guestList: Companion[];
}

const IMG = '../assets/img/';

const panel = (content: TemplateValue): SafeHTML => html`<section class="book__card">${content}</section>`;

function header(page: BookingPageSettings): SafeHTML {
  return html`
    <header class="book__head">
      <img src="${IMG}logo.svg" alt="" width="44" height="44">
      <div>
        ${page.copy.eyebrow ? html`<p class="script book__eyebrow">${page.copy.eyebrow}</p>` : ''}
        <h1 class="book__title">${page.copy.title}</h1>
      </div>
    </header>`;
}

/** Everything a guest can book, narrowed to the products the page settings allow. */
export function bookableGroups(state: State, page: BookingPageSettings): ProductGroup[] {
  const groups = productGroups(state, 'guest');
  if (!page.products.length) return groups;
  const narrowed = groups
    .map((group) => ({ ...group, options: group.options.filter((option) => page.products.includes(option.value)) }))
    .filter((group) => group.options.length);
  return narrowed.length ? narrowed : groups;
}

export const bookableIds = (state: State, page: BookingPageSettings): string[] =>
  bookableGroups(state, page).flatMap((group) => group.options.map((option) => option.value));

/** The picked product: photo, hours and what is included. */
export function productCard(state: State, product: string): SafeHTML | '' {
  const info = productInfo(state, product);
  if (!info) return '';
  return html`
    <div class="book__product ${info.exclusive ? 'is-exclusive' : ''}">
      ${info.photo ? html`<img src="${IMG}${info.photo}" alt="" loading="lazy">` : ''}
      <div class="book__product-text">
        ${info.exclusive ? html`<span class="book__badge">100% exclusive · no sharing</span>` : ''}
        <strong class="book__product-title">${info.title}</strong>
        <span class="small">${info.hours}</span>
        <span class="small muted">${info.details}</span>
        ${info.provisional ? html`<span class="small muted">Rates to be confirmed by the front desk.</span>` : ''}
      </div>
    </div>`;
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
          <div class="line-items__row"><dt>${line.label}${line.qty > 1 ? html` <span class="muted">${line.qty} × ${peso(line.unitPrice)}</span>` : ''}</dt><dd>${peso(line.amount)}</dd></div>`)}
        ${estimate.promo ? html`
          <div class="line-items__row line-items__row--discount"><dt>${estimate.promo.name} (${estimate.promo.percent}%)</dt><dd>−${peso(estimate.discount)}</dd></div>` : ''}
        <div class="line-items__row line-items__row--total"><dt>Estimated total</dt><dd>${peso(estimate.total)}</dd></div>
        <div class="line-items__row"><dt>${DOWNPAYMENT_PERCENT}% downpayment to confirm</dt><dd>${peso(depositRequired(state, draft.product, estimate.total))}</dd></div>
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
    ${panel(html`
      <p class="book__problem">${message}</p>
      <p class="small muted">${page.copy.problemHelp}</p>`)}`;
}

export function guestListBlock(page: BookingPageSettings, draft: Draft): SafeHTML | '' {
  if (!page.fields.guestList) return '';
  return html`
    <fieldset class="book__fieldset">
      <legend class="field__label">${page.copy.guestListLabel}</legend>
      <p class="small muted">Names on this list sign in at the gate. You can also bring the list on the day.</p>
      <div data-slot="guest-list">${guestListRows(draft.guestList, 'companion', { remarks: false })}</div>
      <button class="btn btn--quiet btn--sm" type="button" data-action="add-companion">+ Add a guest</button>
    </fieldset>`;
}

export function formScreen(state: State, page: BookingPageSettings, link: BookingLink, draft: Draft, error: string): SafeHTML {
  const staff = findStaff(state, link.createdBy);
  const { copy, fields } = page;

  return html`
    ${header(page)}
    ${panel(html`
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
        <div class="form-grid">
          <label class="field">
            <span class="field__label">${copy.mobileLabel}</span>
            <input class="input" name="mobile" data-input type="tel" inputmode="tel" value="${draft.mobile}" placeholder="0917 123 4567" autocomplete="tel">
          </label>
          ${fields.email ? html`
            <label class="field">
              <span class="field__label">${copy.emailLabel}</span>
              <input class="input" name="email" data-input type="email" value="${draft.email}" placeholder="maria@example.com" autocomplete="email">
            </label>` : ''}
        </div>
        <label class="field">
          <span class="field__label">${copy.addressLabel}</span>
          <input class="input" name="address" data-input value="${draft.address}" placeholder="House no., street, barangay, city" autocomplete="street-address">
        </label>

        <label class="field">
          <span class="field__label">${copy.productLabel}</span>
          <select class="input" name="product" data-input>
            ${bookableGroups(state, page).map((group) => html`
              <optgroup label="${group.label}">
                ${group.options.map((item) => html`<option value="${item.value}" ${item.value === draft.product ? 'selected' : ''}>${item.label}</option>`)}
              </optgroup>`)}
          </select>
        </label>
        <div data-slot="product">${productCard(state, draft.product)}</div>

        <div class="form-grid">
          <label class="field">
            <span class="field__label">Date of reservation</span>
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
          <label class="field">
            <span class="field__label">Senior / PWD</span>
            <input class="input" name="scPwd" data-input type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${draft.scPwd || ''}">
          </label>
        </div>

        ${guestListBlock(page, draft)}

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

export function payScreen(state: State, page: BookingPageSettings, booking: Booking, request: QrPaymentRequest, card: PaymentCardState): SafeHTML {
  return html`
    ${header(page)}
    ${panel(html`
      <div class="book__step">
        <h2 class="book__step-title">${page.copy.payTitle}</h2>
        <p class="book__intro">${page.copy.payIntro}</p>
      </div>
      <dl class="facts">
        <div class="facts__row"><dt>Reference</dt><dd class="mono">${booking.id}</dd></div>
        <div class="facts__row"><dt>Booking</dt><dd>${productLabel(state, booking.product)} · ${formatDate(booking.date, 'long')}</dd></div>
        <div class="facts__row"><dt>Estimated total</dt><dd>${peso(booking.total)}</dd></div>
        ${booking.paid ? html`<div class="facts__row"><dt>Already paid</dt><dd>${peso(booking.paid)}</dd></div>` : ''}
      </dl>
      <form class="book__form" data-pay-form novalidate>
        ${paymentCard(request, card, { partial: booking.paid > 0 })}
      </form>
      <p class="small muted">${page.copy.payHelp}</p>`)}`;
}

export function doneScreen(state: State, page: BookingPageSettings, booking: Booking, payment?: Payment): SafeHTML {
  const unit = findUnit(state, booking.product);
  const pkg = findExclusive(state, booking.product);
  return html`
    ${header(page)}
    ${panel(html`
      ${page.copy.thanksScript ? html`<p class="script book__thanks">${page.copy.thanksScript}</p>` : ''}
      <p class="book__intro">${page.copy.thanksText} <strong class="mono">${booking.id}</strong></p>
      <dl class="facts">
        <div class="facts__row"><dt>Booking</dt><dd>${productLabel(state, booking.product)}</dd></div>
        <div class="facts__row"><dt>Date</dt><dd>${formatDate(booking.date, 'long')}</dd></div>
        <div class="facts__row"><dt>Guests</dt><dd>${plural(booking.adults + booking.kids, 'guest')}${booking.guestList?.length ? ` · ${booking.guestList.length} on the list` : ''}</dd></div>
        <div class="facts__row"><dt>Total</dt><dd>${peso(booking.total)}</dd></div>
        <div class="facts__row"><dt>Downpayment paid</dt><dd>${peso(booking.paid)}${payment?.reference ? html`<span class="book__sub mono">GCash ${payment.reference}${payment.senderName ? ` · ${payment.senderName}` : ''}</span>` : ''}</dd></div>
        <div class="facts__row"><dt>Balance at check-in</dt><dd>${peso(booking.balance)}</dd></div>
        ${pkg ? html`<div class="facts__row"><dt>Time</dt><dd>${formatTime(pkg.start)}–${formatTime(pkg.end)}</dd></div>`
          : unit ? html`<div class="facts__row"><dt>Check in</dt><dd>${formatTime(unit.checkIn)}</dd></div>` : ''}
      </dl>
      <p class="small muted">${page.copy.doneNote}</p>`)}`;
}
