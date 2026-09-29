// Single-use booking page. A staff member sends the link; the guest fills it
// in once, pays the 50% downpayment by GCash QR, and the booking appears on
// the V6M Desk calendar (on hold until the downpayment is verified).

import { guestBookingProblem } from '../core/actions.js';
import { isMock } from '../core/config.js';
import { $, $maybe, on, render } from '../core/dom.js';
import { DEFAULT_BOOKING_PAGE, loadBookingPage, readableInk } from '../core/booking-page.js';
import { parseDigits } from '../core/format.js';
import { blankCompanion, fitGuestList, namesAsked, readGuestListField, updateGuestCount } from '../core/guest-list.js';
import { VERIFY_DELAY_MS, type PaymentCardState } from '../core/payment-card.js';
import { qrPaymentRequest, sampleReference } from '../core/qr-payment.js';
import { findBooking, findUnit } from '../core/rules.js';
import { requireState } from '../core/store.js';
import type { Booking, BookingLink, BookingPageSettings, State } from '../core/types.js';
import { openLink, payDownpayment, submitBooking, type OpenResult } from './api.js';
import {
  bookableIds, doneScreen, formScreen, guestListBody, payScreen, problemScreen, productCard, summary, type Draft,
} from './screens.js';

const app = $('#app');
const code = new URLSearchParams(window.location.search).get('code') ?? '';

const draft: Draft = {
  guestName: '', mobile: '', email: '', address: '', product: 'daytour', date: '', adults: 2, kids: 0, scPwd: 0, notes: '',
  guestList: [blankCompanion(), blankCompanion()],
};
let error = '';
const card: PaymentCardState = { reference: '', senderName: '', error: '', checking: false };

type Screen = { name: 'form'; link: BookingLink } | { name: 'pay'; bookingId: string } | { name: 'other' };
let screen: Screen = { name: 'other' };

function applyTheme(page: BookingPageSettings): void {
  const { style } = document.body;
  style.setProperty('--book-accent', page.theme.accent);
  style.setProperty('--book-background', page.theme.background);
  style.setProperty('--book-head-ink', readableInk(page.theme.background));
}

function validate(state: State, page: BookingPageSettings): string {
  if (!page.fields.email && draft.email) draft.email = '';
  return guestBookingProblem(state, draft, { guestListRequired: page.fields.guestList });
}

function showPay(page: BookingPageSettings, booking: Booking): void {
  const request = qrPaymentRequest(booking);
  if (!request) {
    render(app, doneScreen(requireState(), page, booking));
    screen = { name: 'other' };
    return;
  }
  screen = { name: 'pay', bookingId: booking.id };
  if (!card.senderName) card.senderName = booking.guestName;
  render(app, payScreen(requireState(), page, booking, request, card));
  window.scrollTo({ top: 0 });
}

const redrawGuestList = () => {
  const slot = $maybe('[data-slot="guest-list"]', app);
  if (slot) render(slot, guestListBody(draft));
};

function bind(page: BookingPageSettings): void {
  on<HTMLInputElement>(app, 'input', '[data-input]', (_event, field) => {
    if (field.name === 'reference' || field.name === 'senderName') {
      card[field.name] = field.value;
      card.error = '';
      const slot = $maybe('[data-slot="pay-error"]', app);
      if (slot) slot.textContent = '';
      return;
    }
    if (screen.name !== 'form') return;
    if (field.dataset.row !== undefined) {
      const shown = readGuestListField(draft.guestList, field);
      if (shown !== null && shown !== field.value) field.value = shown;
      if (field.name === 'companionName') updateGuestCount(app, draft.guestList, namesAsked(draft.adults + draft.kids));
      return;
    }
    if (field.name === 'adults' || field.name === 'kids' || field.name === 'scPwd') {
      draft[field.name] = parseDigits(field.value);
      const formatted = String(parseDigits(field.value) || '');
      if (formatted !== field.value) field.value = formatted;
      // Keep a line per guest, so the list always asks for everyone.
      if (field.name !== 'scPwd') {
        draft.guestList = fitGuestList(draft.guestList, draft.adults + draft.kids);
        redrawGuestList();
      }
    } else if (['guestName', 'mobile', 'email', 'address', 'product', 'date', 'notes'].includes(field.name)) {
      draft[field.name as 'guestName'] = field.value;
    }
    if (field.name === 'product') render($('[data-slot="product"]', app), productCard(requireState(), draft.product));
    error = '';
    render($('[data-slot="summary"]', app), summary(requireState(), page, draft));
    $('[data-slot="error"]', app).textContent = '';
  });

  on(app, 'click', '[data-action="add-companion"]', () => {
    draft.guestList.push(blankCompanion());
    redrawGuestList();
    const inputs = app.querySelectorAll<HTMLInputElement>('[name="companionName"]');
    inputs[inputs.length - 1]?.focus();
  });

  on(app, 'click', '[data-action="remove-companion"]', (_event, el) => {
    draft.guestList.splice(Number(el.dataset.row), 1);
    if (!draft.guestList.length) draft.guestList.push(blankCompanion());
    redrawGuestList();
  });

  let submitting = false;
  on<HTMLFormElement>(app, 'submit', 'form[data-form]', async (event, form) => {
    event.preventDefault();
    if (screen.name !== 'form' || submitting) return;
    error = validate(requireState(), page);
    if (error) {
      $('[data-slot="error"]', app).textContent = error;
      return;
    }
    submitting = true;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const result = await submitBooking(screen.link.code, { ...draft, guestList: page.fields.guestList ? draft.guestList : [] });
      if (result.error !== undefined && result.retry) {
        $('[data-slot="error"]', app).textContent = result.error;
        return;
      }
      if (result.error !== undefined) {
        render(app, problemScreen(page, result.error));
        return;
      }
      showPay(page, result.booking);
    } catch (submitError) {
      // Keep what they typed; they can press the button again.
      $('[data-slot="error"]', app).textContent = (submitError as Error).message;
    } finally {
      submitting = false;
      if (button?.isConnected) button.disabled = false;
    }
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
    setTimeout(async () => {
      let result;
      try {
        result = await payDownpayment(code, bookingId, card.reference, card.senderName);
      } catch (payError) {
        result = { error: (payError as Error).message };
      }
      card.checking = false;
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

  let opened: OpenResult;
  try {
    opened = await openLink(code);
  } catch (loadError) {
    const hint = isMock ? ' Start the local server with npm start and open it from there.' : ' Reload the page to try again.';
    render(app, problemScreen(DEFAULT_BOOKING_PAGE, `${(loadError as Error).message.replace(/\.$/, '')}.${hint}`));
    return;
  }

  bind(page);
  const { state, stage } = opened;
  if (stage.stage === 'problem') {
    render(app, problemScreen(page, stage.message));
    return;
  }
  if (stage.stage === 'pay') {
    showPay(page, stage.booking);
    return;
  }

  const { link } = stage;
  const offered = bookableIds(state, page);
  draft.date = link.date ?? state.meta.asOf;
  draft.product = link.product && offered.includes(link.product) ? link.product : offered[0] ?? 'daytour';
  const unit = findUnit(state, draft.product);
  if (unit && unit.capacityMin > 1) draft.adults = unit.capacityMin;
  draft.guestList = fitGuestList(draft.guestList, draft.adults + draft.kids);

  screen = { name: 'form', link };
  render(app, formScreen(state, page, link, draft, error));
}

void start();
