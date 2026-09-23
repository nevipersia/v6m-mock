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

/** Rows with a name typed in. */
export const namedGuests = (list: Companion[]): Companion[] => list.filter((row) => row.name.trim());

/**
 * How many names the booking page insists on. Big groups (an exclusive rental
 * takes up to 120) would never finish a form asking for every name, so they
 * list this many and the rest sign the sheet at the gate.
 */
export const NAMES_ASKED_CAP = 20;

export const namesAsked = (pax: number): number => Math.max(1, Math.min(pax, NAMES_ASKED_CAP));

/**
 * Grows the list so there is a line per guest the page asks about. Never drops
 * a typed name.
 */
export function fitGuestList(list: Companion[], pax: number): Companion[] {
  const want = namesAsked(pax);
  const next = list.slice();
  while (next.length < want) next.push(blankCompanion());
  // Trim only the blank lines past the headcount, keeping what was typed.
  while (next.length > want && !next[next.length - 1]!.name.trim()) next.pop();
  return next;
}

/** Why the list is not complete yet, or '' when everyone the page asks for is named. */
export function guestListProblem(list: Companion[], pax: number): string {
  const asked = namesAsked(pax);
  const named = namedGuests(list).length;
  if (named >= asked) return '';
  const missing = asked - named;
  const rest = pax > asked ? ' The rest can sign the list at the gate.' : '';
  return named === 0
    ? `Write the names of everyone coming (${asked}).${rest}`
    : `${missing} more ${missing === 1 ? 'name' : 'names'} to go — the list needs ${asked}.${rest}`;
}
