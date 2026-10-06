// Markup for the booking page's screens: the form in steps (what and when,
// your details, who is coming, check and confirm), the downpayment QR, the
// wait while staff check the guest's GCash receipt, the thank-you and the "this link can't be used" message. Wording comes from
// booking-page.json.

import { productGroups, productInfo, type ProductGroup } from '../core/catalog.js';
import { html, type SafeHTML, type TemplateValue } from '../core/dom.js';
import { formatDate, formatTime, peso, plural } from '../core/format.js';
import { guestListEditor, namesAsked } from '../core/guest-list.js';
import { paymentCard, type PaymentCardState } from '../core/payment-card.js';
import type { QrPaymentRequest } from '../core/qr-payment.js';
import {
  DOWNPAYMENT_PERCENT, checkAvailability, depositRequired, findExclusive, findStaff, findUnit, productLabel, quote,
} from '../core/rules.js';
import type { Booking, BookingLink, BookingPageSettings, Companion, Payment, PaymentCheck, State } from '../core/types.js';

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

/** The form's steps, in order. The last one shows everything for the guest to check before sending. */
export type Step = 'booking' | 'details' | 'guests' | 'review';

const STEP_TITLES: Record<Step, string> = {
  booking: 'What and when',
  details: 'Your details',
  guests: 'Guests and notes',
  review: 'Check and confirm',
};

/** "Who is coming" is skipped when the page asks for neither the guest list nor notes. */
export const stepsFor = (page: BookingPageSettings): Step[] =>
  page.fields.guestList || page.fields.notes ? ['booking', 'details', 'guests', 'review'] : ['booking', 'details', 'review'];

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
  if (!draft.product || !draft.date || guests === 0) {
    return html`<p class="small muted">Pick a booking, a date and how many are coming to see the price.</p>`;
  }

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

/** The rows plus the counter, redrawn together as the headcount changes. */
export const guestListBody = (draft: Draft): SafeHTML =>
  guestListEditor(draft.guestList, namesAsked(draft.adults + draft.kids), { remarks: false, required: false });

export function guestListBlock(page: BookingPageSettings, draft: Draft): SafeHTML | '' {
  if (!page.fields.guestList) return '';
  return html`
    <fieldset class="book__fieldset">
      <legend class="field__label">${page.copy.guestListLabel} (optional)</legend>
      <p class="small muted">Write who is coming if you know already, yourself included. Anyone not listed signs the list at the gate.</p>
      <div data-slot="guest-list">${guestListBody(draft)}</div>
    </fieldset>`;
}

function progress(steps: Step[], step: Step): SafeHTML {
  const at = steps.indexOf(step);
  return html`
    <div class="book__progress">
      <ol class="book__steps" aria-label="Steps">
        ${steps.map((item, index) => html`
          <li class="book__steps-item ${index < at ? 'is-done' : ''} ${index === at ? 'is-current' : ''}">
            <span class="sr-only">${STEP_TITLES[item]}${index === at ? ' (this step)' : ''}</span>
          </li>`)}
      </ol>
      <p class="book__step-count">Step ${at + 1} of ${steps.length}</p>
      <h2 class="book__step-title" tabindex="-1" data-step-title>${STEP_TITLES[step]}</h2>
    </div>`;
}

function bookingStep(state: State, page: BookingPageSettings, draft: Draft): SafeHTML {
  const { copy, fields } = page;
  return html`
    <label class="field">
      <span class="field__label">${copy.productLabel}</span>
      <select class="input" name="product" data-input>
        <option value="" ${draft.product ? '' : 'selected'}>Choose a booking</option>
        ${bookableGroups(state, page).map((group) => html`
          <optgroup label="${group.label}">
            ${group.options.map((item) => html`<option value="${item.value}" ${item.value === draft.product ? 'selected' : ''}>${item.label}</option>`)}
          </optgroup>`)}
      </select>
    </label>
    <div data-slot="product">${draft.product ? productCard(state, draft.product) : ''}</div>

    <label class="field">
      <span class="field__label">Date of reservation</span>
      <input class="input" name="date" data-input type="date" value="${draft.date}" min="${state.meta.asOf}"
        data-availability data-legend="Which days are open for the booking you picked.">
    </label>

    <div class="form-grid">
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

    <div data-slot="summary">${summary(state, page, draft)}</div>`;
}

function detailsStep(page: BookingPageSettings, draft: Draft): SafeHTML {
  const { copy, fields } = page;
  return html`
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
    </label>`;
}

function guestsStep(page: BookingPageSettings, draft: Draft): SafeHTML {
  const { copy, fields } = page;
  return html`
    ${guestListBlock(page, draft)}
    ${fields.notes ? html`
      <label class="field">
        <span class="field__label">${copy.notesLabel}</span>
        <textarea class="input" name="notes" data-input rows="3" placeholder="${copy.notesPlaceholder}">${draft.notes}</textarea>
      </label>` : ''}`;
}

const headcount = (draft: Draft): string => [
  plural(draft.adults, 'adult'),
  draft.kids ? plural(draft.kids, 'kid') : '',
  draft.scPwd ? `${draft.scPwd} senior / PWD` : '',
].filter(Boolean).join(' · ');

type Row = [string, TemplateValue];

/** One block of the review: its rows, and a link back to the step that sets them. */
function reviewBlock(title: string, step: Step, rows: Row[]): SafeHTML {
  return html`
    <section class="book__review">
      <header class="book__review-head">
        <h3 class="book__review-title">${title}</h3>
        <button class="link-button" type="button" data-action="go-step" data-step="${step}" aria-label="Edit ${title.toLowerCase()}">Edit</button>
      </header>
      <dl class="facts">
        ${rows.map(([label, value]) => html`<div class="facts__row"><dt>${label}</dt><dd>${value}</dd></div>`)}
      </dl>
    </section>`;
}

function reviewStep(state: State, page: BookingPageSettings, draft: Draft, steps: Step[]): SafeHTML {
  const { fields } = page;
  const named = draft.guestList.map((guest) => guest.name.trim()).filter(Boolean);
  const guestRows: Row[] = [];
  if (fields.guestList) guestRows.push(['Guest list', named.length ? named.join(', ') : 'No names yet. Guests sign the list at the gate.']);
  if (fields.notes) guestRows.push(['Notes', draft.notes.trim() || 'None']);
  const detailRows: Row[] = [['Name', draft.guestName], ['Mobile', draft.mobile]];
  if (fields.email) detailRows.push(['Email', draft.email.trim() || 'None']);
  detailRows.push(['Address', draft.address]);

  return html`
    ${reviewBlock(STEP_TITLES.booking, 'booking', [
      ['Booking', productLabel(state, draft.product)],
      ['Date', formatDate(draft.date, 'long')],
      ['Guests', headcount(draft)],
    ])}
    ${reviewBlock(STEP_TITLES.details, 'details', detailRows)}
    ${steps.includes('guests') ? reviewBlock(STEP_TITLES.guests, 'guests', guestRows) : ''}
    <div data-slot="summary">${summary(state, page, draft)}</div>
    ${houseRules(page)}`;
}

export function formScreen(state: State, page: BookingPageSettings, link: BookingLink, draft: Draft, step: Step, error: string): SafeHTML {
  const staff = findStaff(state, link.createdBy);
  const { copy } = page;
  const steps = stepsFor(page);
  const previous = steps[steps.indexOf(step) - 1];
  const isLast = step === 'review';

  return html`
    ${header(page)}
    ${panel(html`
      ${step === 'booking' ? html`
        <p class="book__intro">
          ${staff ? `${staff.name} from V6M Resort sent you this link.` : 'V6M Resort sent you this link.'}
          ${link.note ? html`<span class="book__note">“${link.note}”</span>` : ''}
          ${copy.intro} It expires ${formatDate(link.expiresAt, 'long')}.
        </p>` : ''}

      ${progress(steps, step)}

      <form class="book__form" data-form novalidate>
        ${step === 'booking' ? bookingStep(state, page, draft)
          : step === 'details' ? detailsStep(page, draft)
          : step === 'guests' ? guestsStep(page, draft)
          : reviewStep(state, page, draft, steps)}

        <p class="form-error" data-slot="error">${error}</p>

        <div class="book__nav">
          ${previous ? html`<button class="btn btn--secondary" type="button" data-action="go-step" data-step="${previous}">Back</button>` : ''}
          <button class="btn btn--primary" type="submit">${isLast ? copy.submitLabel : 'Continue'}</button>
        </div>
        ${isLast ? html`<p class="small muted">${copy.paymentNote}</p>` : ''}
      </form>`)}`;
}

export function payScreen(
  state: State, page: BookingPageSettings, booking: Booking, request: QrPaymentRequest, card: PaymentCardState, rejected?: PaymentCheck,
): SafeHTML {
  return html`
    ${header(page)}
    ${panel(html`
      <div class="book__step">
        <h2 class="book__step-title">${page.copy.payTitle}</h2>
        <p class="book__intro">${page.copy.payIntro}</p>
      </div>
      ${rejected ? html`
        <p class="book__rejected" role="alert">
          <strong>The front desk could not confirm your last receipt</strong> (${rejected.reference}): ${rejected.reason}.
          Check the payment in GCash and send the receipt again.
        </p>` : ''}
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

/** After the guest sends their receipt: the booking is held while staff find the payment in GCash. */
export function checkingScreen(state: State, page: BookingPageSettings, booking: Booking, check: PaymentCheck): SafeHTML {
  return html`
    ${header(page)}
    ${panel(html`
      <div class="book__step">
        <h2 class="book__step-title">${page.copy.checkingTitle}</h2>
        <p class="book__intro">${page.copy.checkingText}</p>
      </div>
      <dl class="facts">
        <div class="facts__row"><dt>Reference</dt><dd class="mono">${booking.id}</dd></div>
        <div class="facts__row"><dt>Booking</dt><dd>${productLabel(state, booking.product)} · ${formatDate(booking.date, 'long')}</dd></div>
        <div class="facts__row"><dt>Sent</dt><dd>${peso(check.amount)} by GCash<span class="book__sub mono">${check.reference} · ${check.senderName}</span></dd></div>
        <div class="facts__row"><dt>Status</dt><dd><span class="pill pill--warning">Waiting for the front desk</span></dd></div>
      </dl>
      ${check.receipt ? html`
        <figure class="book__receipt">
          <img src="${check.receipt}" alt="The GCash receipt you sent">
          <figcaption class="small muted">The receipt you sent</figcaption>
        </figure>` : ''}
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
