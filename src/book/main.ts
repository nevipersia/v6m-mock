// Single-use booking page. A staff member sends the link; the guest fills it
// in once, pays the 50% downpayment by GCash QR, and the booking appears on
// the V6M Desk calendar (on hold until the downpayment is verified).

import { bookingLinkStage, payByQr, useBookingLink } from '../core/actions.js';
import { $, $maybe, on, render } from '../core/dom.js';
import { DEFAULT_BOOKING_PAGE, loadBookingPage, readableInk } from '../core/booking-page.js';
import { isPHMobile, parseDigits } from '../core/format.js';
import { VERIFY_DELAY_MS, type PaymentCardState } from '../core/payment-card.js';
import { qrPaymentRequest, sampleReference } from '../core/qr-payment.js';
import { checkAvailability, findBooking, findUnit } from '../core/rules.js';
import { loadStore, requireState } from '../core/store.js';
import type { Booking, BookingLink, BookingPageSettings, State } from '../core/types.js';
import { bookableProducts, doneScreen, formScreen, payScreen, problemScreen, summary, type Draft } from './screens.js';

const app = $('#app');
const code = new URLSearchParams(window.location.search).get('code') ?? '';

const draft: Draft = {
  guestName: '', mobile: '', product: 'daytour', date: '', adults: 2, kids: 0, notes: '',
};
let error = '';
const card: PaymentCardState = { reference: '', error: '', checking: false };

type Screen = { name: 'form'; link: BookingLink } | { name: 'pay'; bookingId: string } | { name: 'other' };
let screen: Screen = { name: 'other' };

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

function showPay(page: BookingPageSettings, booking: Booking): void {
  const request = qrPaymentRequest(booking);
  if (!request) {
    render(app, doneScreen(requireState(), page, booking));
    screen = { name: 'other' };
    return;
  }
  screen = { name: 'pay', bookingId: booking.id };
  render(app, payScreen(page, booking, request, card));
  window.scrollTo({ top: 0 });
}

function bind(page: BookingPageSettings): void {
  on<HTMLInputElement>(app, 'input', '[data-input]', (_event, field) => {
    if (field.name === 'reference') {
      card.reference = field.value;
      card.error = '';
      const slot = $maybe('[data-slot="pay-error"]', app);
      if (slot) slot.textContent = '';
      return;
    }
    if (screen.name !== 'form') return;
    if (field.name === 'adults' || field.name === 'kids') {
      draft[field.name] = parseDigits(field.value);
      const formatted = String(parseDigits(field.value) || '');
      if (formatted !== field.value) field.value = formatted;
    } else if (field.name === 'guestName' || field.name === 'mobile' || field.name === 'product' || field.name === 'date' || field.name === 'notes') {
      draft[field.name] = field.value;
    }
    error = '';
    render($('[data-slot="summary"]', app), summary(requireState(), page, draft));
    $('[data-slot="error"]', app).textContent = '';
  });

  on<HTMLFormElement>(app, 'submit', 'form[data-form]', (event) => {
    event.preventDefault();
    if (screen.name !== 'form') return;
    error = validate(requireState());
    if (error) {
      $('[data-slot="error"]', app).textContent = error;
      return;
    }
    const result = useBookingLink(screen.link.code, draft);
    if (result.error !== undefined) {
      render(app, problemScreen(page, result.error));
      return;
    }
    showPay(page, result.booking);
  });

  on<HTMLFormElement>(app, 'submit', 'form[data-pay-form]', (event) => {
    event.preventDefault();
    if (screen.name !== 'pay' || card.checking) return;
    const { bookingId } = screen;
    const booking = findBooking(requireState(), bookingId);
    if (!booking) return;

    card.checking = true;
    card.error = '';
    showPay(page, booking);
    // Mock verification: pretend to check the reference with GCash.
    setTimeout(() => {
      card.checking = false;
      const result = payByQr(bookingId, card.reference, null);
      if (result.error !== undefined) {
        card.error = result.error;
        const current = findBooking(requireState(), bookingId);
        if (current) showPay(page, current);
        return;
      }
      screen = { name: 'other' };
      render(app, doneScreen(requireState(), page, result.booking, result.payment));
      window.scrollTo({ top: 0 });
    }, VERIFY_DELAY_MS);
  });

  on(app, 'click', '[data-action="simulate-payment"]', () => {
    if (screen.name !== 'pay') return;
    card.reference = sampleReference(requireState(), `${screen.bookingId}|${Date.now()}`);
    card.error = '';
    const input = $maybe<HTMLInputElement>('[name="reference"]', app);
    if (input) input.value = card.reference;
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

  bind(page);
  const stage = bookingLinkStage(state, code);
  if (stage.stage === 'problem') {
    render(app, problemScreen(page, stage.message));
    return;
  }
  if (stage.stage === 'pay') {
    showPay(page, stage.booking);
    return;
  }

  const { link } = stage;
  const offered = bookableProducts(state, page).map((option) => option.value);
  draft.date = link.date ?? state.meta.asOf;
  draft.product = link.product && offered.includes(link.product) ? link.product : offered[0] ?? 'daytour';
  const unit = findUnit(state, draft.product);
  if (unit && unit.capacityMin > 1) draft.adults = unit.capacityMin;

  screen = { name: 'form', link };
  render(app, formScreen(state, page, link, draft, error));
}

void start();
