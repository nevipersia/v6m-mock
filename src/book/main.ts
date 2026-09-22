// Single-use booking page. A staff member sends the link; the guest fills this
// in once and the booking appears on the V6M Desk calendar.

import { bookingLinkProblem, findBookingLink, useBookingLink } from '../core/actions.js';
import { $, on, render } from '../core/dom.js';
import { DEFAULT_BOOKING_PAGE, loadBookingPage, readableInk } from '../core/booking-page.js';
import { isPHMobile, parseDigits } from '../core/format.js';
import { checkAvailability, findUnit } from '../core/rules.js';
import { loadStore } from '../core/store.js';
import type { BookingLink, BookingPageSettings, State } from '../core/types.js';
import { bookableProducts, doneScreen, formScreen, problemScreen, summary, type Draft } from './screens.js';

const app = $('#app');
const code = new URLSearchParams(window.location.search).get('code') ?? '';

const draft: Draft = {
  guestName: '', mobile: '', product: 'daytour', date: '', adults: 2, kids: 0, notes: '',
};
let error = '';

function applyTheme(page: BookingPageSettings): void {
  const { style } = document.body;
  style.setProperty('--book-accent', page.theme.accent);
  style.setProperty('--book-background', page.theme.background);
  style.setProperty('--book-head-ink', readableInk(page.theme.background));
}

function validate(state: State): string {
  const guests = draft.adults + draft.kids;
  const availability = draft.date ? checkAvailability(state, draft) : { ok: false, reason: 'Pick a date.' };
  const unit = findUnit(state, draft.product);

  if (!draft.guestName.trim()) return 'Enter your name.';
  if (!isPHMobile(draft.mobile)) return 'Enter a PH mobile number, like 0917 123 4567.';
  if (!draft.date) return 'Pick a date.';
  if (guests === 0) return 'Add at least one guest.';
  if (!availability.ok) return availability.reason ?? 'That date is not available.';
  if (unit && guests > unit.capacityMax) return `${unit.name} fits up to ${unit.capacityMax} guests.`;
  return '';
}

function bindForm(state: State, page: BookingPageSettings, link: BookingLink): void {
  on<HTMLInputElement>(app, 'input', '[data-input]', (_event, field) => {
    if (field.name === 'adults' || field.name === 'kids') {
      draft[field.name] = parseDigits(field.value);
      const formatted = String(parseDigits(field.value) || '');
      if (formatted !== field.value) field.value = formatted;
    } else if (field.name === 'guestName' || field.name === 'mobile' || field.name === 'product' || field.name === 'date' || field.name === 'notes') {
      draft[field.name] = field.value;
    }
    error = '';
    render($('[data-slot="summary"]', app), summary(state, page, draft));
    $('[data-slot="error"]', app).textContent = '';
  });

  on<HTMLFormElement>(app, 'submit', 'form[data-form]', (event) => {
    event.preventDefault();
    error = validate(state);
    if (error) {
      $('[data-slot="error"]', app).textContent = error;
      return;
    }

    const result = useBookingLink(link.code, draft);
    if (result.error !== undefined) {
      render(app, problemScreen(page, result.error));
      return;
    }
    render(app, doneScreen(state, page, result.booking));
  });
}

async function start(): Promise<void> {
  const page = await loadBookingPage();
  applyTheme(page);

  let state: State;
  try {
    state = await loadStore();
  } catch (loadError) {
    render(app, problemScreen(DEFAULT_BOOKING_PAGE, `${(loadError as Error).message}. Start the local server with npm start and open it from there.`));
    return;
  }

  const link = findBookingLink(state, code);
  const problem = bookingLinkProblem(state, link);
  if (problem || !link) {
    render(app, problemScreen(page, problem ?? 'This booking link is not valid.'));
    return;
  }

  const offered = bookableProducts(state, page).map((option) => option.value);
  draft.date = link.date ?? state.meta.asOf;
  draft.product = link.product && offered.includes(link.product) ? link.product : offered[0] ?? 'daytour';
  const unit = findUnit(state, draft.product);
  if (unit && unit.capacityMin > 1) draft.adults = unit.capacityMin;

  render(app, formScreen(state, page, link, draft, error));
  bindForm(state, page, link);
}

void start();
