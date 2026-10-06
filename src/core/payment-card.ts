// The GCash payment card, shared by the guest booking page and the booking
// drawer in V6M Desk. The caller supplies the form wrapper and handlers.
//
// The QR is the resort's own GCash account, so it is the same for every
// booking and cannot carry the amount: the card says what to type. On the
// booking page the guest sends back their receipt for staff to check; at the
// desk, staff see the money arrive in GCash and record it there and then.

import { isMock } from './config.js';
import { html, raw, type SafeHTML } from './dom.js';
import { peso } from './format.js';
import { qrSvg } from './qr.js';
import { GCASH_ACCOUNT, type QrPaymentRequest } from './qr-payment.js';
import { DOWNPAYMENT_PERCENT } from './rules.js';

export interface PaymentCardState {
  reference: string;
  /** Name on the GCash account that sent it ("GCash sender" on the guest information form). */
  senderName: string;
  /** The guest's receipt screenshot as a data URL (booking page only). */
  receipt: string | null;
  error: string;
  /** True while the form is being sent, or the receipt photo is being read. */
  checking: boolean;
}

export const blankPaymentCard = (): PaymentCardState => ({ reference: '', senderName: '', receipt: null, error: '', checking: false });

function receiptField(card: PaymentCardState): SafeHTML {
  const off = card.checking ? 'disabled' : '';
  if (card.receipt) {
    return html`
      <div class="field">
        <span class="field__label">GCash receipt</span>
        <div class="receipt-pick receipt-pick--done">
          <img class="receipt-pick__thumb" src="${card.receipt}" alt="Your GCash receipt">
          <span class="receipt-pick__text"><strong>Receipt added</strong><span class="small muted">Check that the amount and reference number can be read.</span></span>
          <label class="btn btn--quiet btn--sm receipt-pick__change">
            Change
            <input class="sr-only" type="file" name="receipt" accept="image/*" data-receipt ${off}>
          </label>
        </div>
      </div>`;
  }
  return html`
    <label class="field">
      <span class="field__label">GCash receipt</span>
      <span class="receipt-pick">
        <span class="receipt-pick__icon" aria-hidden="true">+</span>
        <span class="receipt-pick__text"><strong>Add a screenshot of your receipt</strong><span class="small muted">The screen GCash shows after you pay. PNG or JPG.</span></span>
        <input class="sr-only" type="file" name="receipt" accept="image/*" data-receipt ${off}>
      </span>
    </label>`;
}

export function paymentCard(request: QrPaymentRequest, card: PaymentCardState, { partial = false, desk = false } = {}): SafeHTML {
  const off = card.checking ? 'disabled' : '';
  return html`
    <div class="pay-qr">
      <div class="pay-qr__top">
        <figure class="pay-qr__code">
          ${raw(qrSvg(GCASH_ACCOUNT.qrPayload, `GCash QR for ${GCASH_ACCOUNT.name}`))}
          <figcaption>GCash · ${GCASH_ACCOUNT.name}</figcaption>
        </figure>
        <div class="pay-qr__details">
          <p class="pay-qr__label">${partial ? 'Rest of the downpayment' : `${DOWNPAYMENT_PERCENT}% downpayment`}</p>
          <p class="pay-qr__amount">${peso(request.amount)}</p>
          <dl class="pay-qr__facts">
            <div><dt>Pay to</dt><dd>${GCASH_ACCOUNT.name}</dd></div>
            <div><dt>GCash no.</dt><dd class="mono">${GCASH_ACCOUNT.number}</dd></div>
            <div><dt>Booking</dt><dd class="mono">${request.bookingId}</dd></div>
          </dl>
        </div>
      </div>

      <ol class="pay-qr__steps">
        <li>Open GCash, tap <strong>QR</strong> and scan the code.</li>
        <li>Type exactly <strong>${peso(request.amount)}</strong> and send it.</li>
        <li>${desk
          ? 'Find the payment in the resort’s GCash app, then type its reference number below.'
          : html`Take a screenshot of the receipt GCash shows and add it below.`}</li>
      </ol>

      ${desk ? '' : receiptField(card)}
      <label class="field">
        <span class="field__label">Name on the GCash account</span>
        <input class="input" name="senderName" data-input="senderName" value="${card.senderName}" autocomplete="name"
          placeholder="Who sent the payment" ${off}>
      </label>
      ${desk ? html`
        <label class="field">
          <span class="field__label">GCash reference number</span>
          <input class="input mono" name="reference" data-input="reference" value="${card.reference}" inputmode="numeric"
            autocomplete="off" placeholder="1234 567 890123" ${off}>
        </label>` : ''}
      <p class="form-error" data-slot="pay-error" role="alert">${card.error}</p>

      <div class="button-row">
        <button class="btn btn--primary" type="submit" ${off}>
          ${desk ? 'Record GCash payment' : card.checking ? 'Sending…' : 'Send receipt'}
        </button>
        ${isMock ? html`
          <button class="btn btn--quiet btn--sm" type="button" data-action="simulate-payment" ${off}>
            Simulate a GCash payment
          </button>` : ''}
      </div>
      ${desk
        ? html`<p class="small muted">Only record it once you can see the money in the resort’s GCash.</p>`
        : html`<p class="small muted">The front desk checks your receipt against the resort’s GCash, then confirms your booking.</p>`}
      ${isMock ? html`<p class="small muted">Demo QR: phones cannot scan it and nothing is charged. “Simulate” fills in a test ${desk ? 'reference' : 'receipt'}.</p>` : ''}
    </div>`;
}

/** The longest side a receipt photo is shrunk to before it is kept. */
const RECEIPT_MAX_SIDE = 1200;

/**
 * Reads a receipt screenshot and shrinks it to a JPEG small enough to store
 * with the booking. Resolves to a data URL.
 */
export function readReceipt(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Choose a screenshot (PNG or JPG) of the receipt.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, RECEIPT_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('This browser could not read the picture.'));
        return;
      }
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That picture could not be opened. Try another screenshot.'));
    };
    image.src = url;
  });
}
