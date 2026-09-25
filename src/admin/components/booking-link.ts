// Single-use booking link: staff create one, send it to a guest, and the
// booking the guest fills in comes back to the calendar under their name.

import { cancelBookingLink, createBookingLink } from '../../core/actions.js';
import { html, type SafeHTML } from '../../core/dom.js';
import { formatDate, plural } from '../../core/format.js';
import { allProductIds, productGroups } from '../../core/catalog.js';
import { findBooking, findStaff, productLabel } from '../../core/rules.js';
import type { BookingLink, State } from '../../core/types.js';
import { asField, type BookingPrefill, type DrawerContent } from '../types.js';
import { icon } from './icons.js';

const linkUrl = (code: string): string => new URL(`../book/?code=${encodeURIComponent(code)}`, window.location.href).href;

function productOptions(state: State, selected: string): SafeHTML[] {
  return [
    html`<option value="" ${selected ? '' : 'selected'}>Let the guest choose</option>`,
    ...productGroups(state).map((group) => html`
      <optgroup label="${group.label}">
        ${group.options.map((item) => html`<option value="${item.value}" ${item.value === selected ? 'selected' : ''}>${item.label}</option>`)}
      </optgroup>`),
  ];
}

function sentLinks(state: State): BookingLink[] {
  return state.bookingLinks
    .filter((link) => link.status === 'sent')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

interface LinkDraft {
  product: string;
  date: string;
  note: string;
  expiresInDays: number;
}

/** Carries over what staff already chose in the booking form they came from. */
export function createBookingLinkPanel(prefill: BookingPrefill = {}): DrawerContent {
  const draft: LinkDraft = {
    product: prefill.product ?? '', date: prefill.date ?? '', note: '', expiresInDays: 7,
  };
  const ui: { created: BookingLink | null; error: string } = { created: null, error: '' };

  function createdBlock(state: State): SafeHTML | '' {
    if (!ui.created) return '';
    const url = linkUrl(ui.created.code);
    return html`
      <div class="action-card">
        <h4 class="action-card__title">Link ready to send</h4>
        <p class="link-code mono">${url}</p>
        <p class="small muted">
          Works once, expires ${formatDate(ui.created.expiresAt, 'long')}.
          ${ui.created.product ? `Pre-filled for ${productLabel(state, ui.created.product)}.` : 'The guest picks what they want.'}
        </p>
        <div class="button-row">
          <button class="btn btn--primary btn--sm" type="button" data-action="copy-link" data-code="${ui.created.code}">${icon('copy')} Copy link</button>
          <a class="btn btn--secondary btn--sm" href="${url}" target="_blank" rel="noopener">Open it</a>
        </div>
      </div>`;
  }

  return {
    live: true,
    title: 'Send a booking link',

    render(ctx) {
      const { state } = ctx;
      const open = sentLinks(state);
      // A product that has since been retired would leave the select showing nothing.
      if (draft.product && !allProductIds(state).includes(draft.product)) draft.product = '';

      return html`
        <div class="detail">
          <p class="small muted">
            Send this to a guest who is ready to book. They fill in their own details once and pay the
            50% downpayment by GCash QR. The booking lands on your calendar under your name, on hold
            until the downpayment is verified.
          </p>
          <div class="form-aside">
            <p class="small muted">Guest on the phone or at the gate?</p>
            <button class="btn btn--secondary btn--sm" type="button" data-action="book-by-hand">
              ${icon('plus')} Take the booking yourself
            </button>
          </div>

          ${createdBlock(state)}

          <form class="booking-form" data-submit="create-link" novalidate>
            <fieldset class="form-section">
              <legend class="form-section__title">Pre-fill (optional)</legend>
              <div class="form-grid">
                <label class="field">
                  <span class="field__label">Booking</span>
                  <select class="input" name="product" data-input="field">${productOptions(state, draft.product)}</select>
                </label>
                <label class="field">
                  <span class="field__label">Date</span>
                  <input class="input" name="date" data-input="field" type="date" value="${draft.date}">
                </label>
              </div>
              <label class="field">
                <span class="field__label">Note for the guest</span>
                <input class="input" name="note" data-input="field" value="${draft.note}" placeholder="Saw your message about Saturday">
              </label>
              <label class="field">
                <span class="field__label">Expires in</span>
                <select class="input" name="expiresInDays" data-input="field">
                  ${[1, 3, 7, 14].map((days) => html`<option value="${days}" ${days === draft.expiresInDays ? 'selected' : ''}>${plural(days, 'day')}</option>`)}
                </select>
              </label>
            </fieldset>
            <p class="form-error" data-slot="error">${ui.error}</p>
            <div class="button-row button-row--end">
              <button class="btn btn--primary" type="submit">${icon('link')} Create link</button>
            </div>
          </form>

          <section class="detail-section">
            <h3 class="detail-section__title">Links waiting to be used (${open.length})</h3>
            ${open.length ? html`
              <ul class="plain-list">
                ${open.map((link) => html`
                  <li class="plain-list__row">
                    <span>
                      <strong class="mono">${link.code}</strong>
                      <span class="small muted">
                        ${link.product ? productLabel(state, link.product) : 'Guest chooses'}${link.date ? ` · ${formatDate(link.date)}` : ''}
                        · sent by ${findStaff(state, link.createdBy)?.name ?? 'a removed account'}
                        · expires ${formatDate(link.expiresAt)}
                      </span>
                    </span>
                    <span class="button-row">
                      <button class="btn btn--quiet btn--sm" type="button" data-action="copy-link" data-code="${link.code}">Copy</button>
                      <button class="btn btn--quiet btn--sm" type="button" data-action="cancel-link" data-code="${link.code}">Cancel</button>
                    </span>
                  </li>`)}
              </ul>` : html`<p class="small muted">No links waiting.</p>`}
          </section>

          ${state.bookingLinks.some((link) => link.status === 'used') ? html`
            <section class="detail-section">
              <h3 class="detail-section__title">Recently used</h3>
              <ul class="plain-list">
                ${state.bookingLinks.filter((link) => link.status === 'used').slice(-4).reverse().map((link) => {
                  const booking = findBooking(state, link.bookingId);
                  return html`
                    <li class="plain-list__row">
                      <span><strong class="mono">${link.code}</strong> <span class="small muted">${booking ? `${booking.guestName} · ${formatDate(booking.date)}` : 'Booking removed'}</span></span>
                      ${booking ? html`<button class="btn btn--quiet btn--sm" type="button" data-action="open-linked-booking" data-id="${booking.id}">Open</button>` : ''}
                    </li>`;
                })}
              </ul>
            </section>` : ''}
        </div>`;
    },

    inputs: {
      field: ({ el }) => {
        const field = asField(el);
        if (field.name === 'expiresInDays') draft.expiresInDays = Number(field.value);
        else if (field.name === 'product' || field.name === 'date' || field.name === 'note') draft[field.name] = field.value;
        ui.error = '';
      },
    },

    actions: {
      'book-by-hand': ({ ctx }) => ctx.newBooking({ product: draft.product, date: draft.date }),

      'create-link': ({ ctx, redraw }) => {
        ui.created = createBookingLink(draft, ctx.staff.id);
        redraw();
        ctx.toast('Booking link created');
      },

      'copy-link': async ({ el, ctx }) => {
        try {
          await navigator.clipboard.writeText(linkUrl(el.dataset.code ?? ''));
          ctx.toast('Link copied');
        } catch {
          ctx.toast('Copy blocked by the browser, use Open it instead');
        }
      },

      'cancel-link': ({ el, ctx }) => {
        cancelBookingLink(el.dataset.code ?? '', ctx.staff.id);
        if (ui.created?.code === el.dataset.code) ui.created = null;
        ctx.toast('Link cancelled');
      },

      'open-linked-booking': ({ el, ctx }) => ctx.openBooking(el.dataset.id ?? ''),
    },
  };
}
