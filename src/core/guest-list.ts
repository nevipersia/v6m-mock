// Guest list rows (the companions sheet): name, gender, age and remarks.
// Shared by the booking page and the booking drawer in V6M Desk.

import { html, type SafeHTML } from './dom.js';
import type { Companion } from './types.js';

export const blankCompanion = (): Companion => ({ name: '', gender: '', age: null, remarks: '' });

/**
 * Editable rows. Each field carries data-input="`input`", data-row and a
 * name of guestName / gender / age / remarks. `remarks` rows are desk only.
 */
export function guestListRows(list: Companion[], input: string, { remarks = true } = {}): SafeHTML {
  return html`
    <ol class="guest-rows">
      ${list.map((row, index) => html`
        <li class="guest-row ${remarks ? '' : 'guest-row--short'}">
          <span class="guest-row__number" aria-hidden="true">${index + 1}</span>
          <input class="input" data-input="${input}" data-row="${index}" name="companionName" value="${row.name}"
            placeholder="Full name" aria-label="Guest ${index + 1} name" autocomplete="off">
          <select class="input" data-input="${input}" data-row="${index}" name="companionGender" aria-label="Guest ${index + 1} gender">
            <option value="" ${row.gender ? '' : 'selected'}>Gender</option>
            <option ${row.gender === 'Female' ? 'selected' : ''}>Female</option>
            <option ${row.gender === 'Male' ? 'selected' : ''}>Male</option>
          </select>
          <input class="input" data-input="${input}" data-row="${index}" name="companionAge" value="${row.age ?? ''}"
            inputmode="numeric" placeholder="Age" aria-label="Guest ${index + 1} age" autocomplete="off">
          ${remarks ? html`
            <input class="input" data-input="${input}" data-row="${index}" name="companionRemarks" value="${row.remarks}"
              placeholder="Remarks (SC/PWD, allergies…)" aria-label="Guest ${index + 1} remarks" autocomplete="off">` : ''}
          <button class="guest-row__remove" type="button" data-action="remove-companion" data-row="${index}" aria-label="Remove guest ${index + 1}">×</button>
        </li>`)}
    </ol>`;
}

/** Applies one field's input to the list. Returns the value the field should show (ages keep digits only). */
export function readGuestListField(list: Companion[], field: HTMLInputElement | HTMLSelectElement): string | null {
  const row = list[Number(field.dataset.row)];
  if (!row) return null;
  if (field.name === 'companionName') row.name = field.value;
  else if (field.name === 'companionGender') row.gender = field.value === 'Female' || field.value === 'Male' ? field.value : '';
  else if (field.name === 'companionRemarks') row.remarks = field.value;
  else if (field.name === 'companionAge') {
    const digits = field.value.replace(/\D/g, '').slice(0, 3);
    row.age = digits ? Number(digits) : null;
    return digits;
  }
  return null;
}
