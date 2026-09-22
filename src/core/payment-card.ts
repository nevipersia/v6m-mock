// The GCash QR payment card, shared by the guest booking page and the booking
// drawer in V6M Desk. The caller supplies the form wrapper and handlers.

import { html, raw, type SafeHTML } from './dom.js';
import { peso } from './format.js';
import { qrSvg } from './qr.js';
import { QR_MERCHANT, type QrPaymentRequest } from './qr-payment.js';
import { DOWNPAYMENT_PERCENT } from './rules.js';

export interface PaymentCardState {
  reference: string;
  /** Name on the GCash account that sent it ("GCash sender" on the guest information form). */
  senderName: string;
  error: string;
  /** True while the mock verification is "checking with GCash". */
  checking: boolean;
}

export function paymentCard(request: QrPaymentRequest, card: PaymentCardState, { partial = false } = {}): SafeHTML {
  return html`
    <div class="pay-qr">
      <div class="pay-qr__top">
        <figure class="pay-qr__code">
          ${raw(qrSvg(request.payload, `Payment QR for ${peso(request.amount)}`))}
          <figcaption>GCash · QR Ph</figcaption>
        </figure>
        <div class="pay-qr__details">
          <p class="pay-qr__label">${partial ? 'Rest of the downpayment' : `${DOWNPAYMENT_PERCENT}% downpayment`}</p>
          <p class="pay-qr__amount">${peso(request.amount)}</p>
          <dl class="pay-qr__facts">
            <div><dt>Pay to</dt><dd>${QR_MERCHANT}</dd></div>
            <div><dt>Booking</dt><dd class="mono">${request.bookingId}</dd></div>
            <div><dt>Check code</dt><dd class="mono">${request.code}</dd></div>
          </dl>
        </div>
      </div>

      <ol class="pay-qr__steps">
        <li>Open GCash and tap <strong>Pay QR</strong>.</li>
        <li>Scan the code and pay exactly ${peso(request.amount)}.</li>
        <li>Type the 13-digit reference number from your receipt below.</li>
      </ol>

      <label class="field">
        <span class="field__label">Name on the GCash account</span>
        <input class="input" name="senderName" data-input="senderName" value="${card.senderName}" autocomplete="name"
          placeholder="Who sent the payment" ${card.checking ? 'disabled' : ''}>
      </label>
      <label class="field">
        <span class="field__label">GCash reference number</span>
        <input class="input mono" name="reference" data-input="reference" value="${card.reference}" inputmode="numeric"
          autocomplete="off" placeholder="1234 567 890123" ${card.checking ? 'disabled' : ''}>
      </label>
      <p class="form-error" data-slot="pay-error" role="alert">${card.error}</p>

      <div class="button-row">
        <button class="btn btn--primary" type="submit" ${card.checking ? 'disabled' : ''}>
          ${card.checking ? 'Checking with GCash…' : 'Verify payment'}
        </button>
        <button class="btn btn--quiet btn--sm" type="button" data-action="simulate-payment" ${card.checking ? 'disabled' : ''}>
          Simulate a GCash payment
        </button>
      </div>
      <p class="small muted">Demo QR: phones cannot scan it and nothing is charged. “Simulate” fills in a test reference.</p>
    </div>`;
}

/** How long the mock verification pretends to take. */
export const VERIFY_DELAY_MS = 1100;
