// Discount inputs shared by the new booking form and the booking drawer.
// Owners may leave the note blank; everyone else must say why.

import { html, type SafeHTML } from '../../core/dom.js';
import { formatDigits, peso } from '../../core/format.js';
import { discountAmount, discountNeedsNote } from '../../core/rules.js';
import type { DiscountKind, Staff } from '../../core/types.js';

export interface DiscountDraft {
  kind: DiscountKind;
  value: number;
  note: string;
}

export const blankDiscount = (): DiscountDraft => ({ kind: 'amount', value: 0, note: '' });

/** `input` is the data-input name the fields report to; each field's `name` says which part changed. */
export function discountFields(staff: Staff, draft: DiscountDraft, base: number, input: string): SafeHTML {
  const needsNote = discountNeedsNote(staff);
  const amount = discountAmount(base, draft.kind, draft.value);
  return html`
    <div class="discount-fields">
      <div class="form-grid">
        <label class="field">
          <span class="field__label">Discount type</span>
          <select class="input" name="discountKind" data-input="${input}">
            <option value="amount" ${draft.kind === 'amount' ? 'selected' : ''}>Amount (₱)</option>
            <option value="percent" ${draft.kind === 'percent' ? 'selected' : ''}>Percent (%)</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">${draft.kind === 'percent' ? 'Percent off' : 'Pesos off'}</span>
          <input class="input input--amount" name="discountValue" data-input="${input}" type="text" inputmode="numeric"
            autocomplete="off" placeholder="0" value="${draft.kind === 'percent' ? (draft.value || '') : formatDigits(draft.value)}">
        </label>
      </div>
      <label class="field">
        <span class="field__label">${needsNote ? 'Reason (required)' : 'Reason (optional for owners)'}</span>
        <input class="input" name="discountNote" data-input="${input}" value="${draft.note}" autocomplete="off"
          placeholder="${needsNote ? 'Returning guest, promo from Messenger, service issue…' : 'Optional'}">
      </label>
      <p class="small muted" data-slot="discount-preview">${amount ? `Takes ${peso(amount)} off the ${peso(base)} price.` : ''}</p>
    </div>`;
}

/**
 * Updates the draft from one field's input event. Returns the formatted value
 * the field should show, so callers can keep the caret where it was.
 */
export function readDiscountField(draft: DiscountDraft, field: HTMLInputElement | HTMLSelectElement): string | null {
  if (field.name === 'discountKind') {
    draft.kind = field.value === 'percent' ? 'percent' : 'amount';
    draft.value = draft.kind === 'percent' ? Math.min(draft.value, 100) : draft.value;
    return null;
  }
  if (field.name === 'discountValue') {
    const digits = Number(field.value.replace(/\D/g, '')) || 0;
    draft.value = draft.kind === 'percent' ? Math.min(digits, 100) : digits;
    return draft.kind === 'percent' ? String(draft.value || '') : formatDigits(draft.value);
  }
  if (field.name === 'discountNote') draft.note = field.value;
  return null;
}
