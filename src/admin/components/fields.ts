// Every dropdown and date field on the desk opens the same kind of pop-up as
// the Bookings page, instead of the browser's own.
//
// The forms keep their real <select> and <input type="date">: they still hold
// the value, sit in the form, and fire the input events the views listen for.
// This only lays a button over each one, which opens a styled list (for a
// dropdown) or the shared date picker (for a date), and writes the choice back
// into the real control. Anything new in the page is picked up as it appears,
// side panels included, so no view has to opt in.

import { html, render } from '../../core/dom.js';
import { parseDate } from '../../core/format.js';
import type { ISODate } from '../../core/types.js';
import { openDatePicker } from './date-picker.js';
import { icon } from './icons.js';

let today: ISODate = new Date().toISOString().slice(0, 10);

/** The desk's today, for the date picker's Today button. Set on every draw. */
export function setFieldsToday(day: ISODate): void {
  today = day;
}

/** Writes a value into the real control and tells the page, as typing would. */
function commit(control: HTMLSelectElement | HTMLInputElement, value: string): void {
  if (control.value === value) return;
  control.value = value;
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

/** After a pick the page may redraw, replacing the button: find its successor by name. */
function refocus(trigger: HTMLElement, name: string): void {
  requestAnimationFrame(() => {
    if (trigger.isConnected) {
      trigger.focus();
      return;
    }
    document.querySelector<HTMLElement>(`[data-field-for="${CSS.escape(name)}"]`)?.focus();
  });
}

// ---------- Dropdowns ----------

let openMenu: { menu: HTMLElement; trigger: HTMLButtonElement; cleanup: () => void } | null = null;

function closeMenu(focusTrigger = false): void {
  if (!openMenu) return;
  const { menu, trigger, cleanup } = openMenu;
  openMenu = null;
  cleanup();
  trigger.setAttribute('aria-expanded', 'false');
  menu.classList.add('is-leaving');
  setTimeout(() => menu.remove(), 120);
  if (focusTrigger && trigger.isConnected) trigger.focus();
}

const selectedText = (select: HTMLSelectElement): string =>
  select.selectedOptions[0]?.textContent?.trim() || 'Choose…';

function showMenu(select: HTMLSelectElement, trigger: HTMLButtonElement): void {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', trigger.getAttribute('aria-label') ?? 'Options');

  render(menu, html`${[...select.children].map((child) => {
    if (child instanceof HTMLOptGroupElement) {
      return html`
        <p class="menu__group" role="presentation">${child.label}</p>
        ${[...child.children].map((option) => menuItem(option as HTMLOptionElement, select))}`;
    }
    return menuItem(child as HTMLOptionElement, select);
  })}`);
  document.body.append(menu);

  // Under the button, or above it when there is no room below; never off screen.
  const box = trigger.getBoundingClientRect();
  menu.style.minWidth = `${Math.max(box.width, 200)}px`;
  const height = Math.min(menu.scrollHeight, 320);
  const below = window.innerHeight - box.bottom - 12;
  const top = below >= height || below >= box.top ? box.bottom + 6 : box.top - height - 6;
  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.left = `${Math.min(box.left, window.innerWidth - Math.max(box.width, 200) - 8)}px`;
  menu.style.maxHeight = `${height}px`;

  const items = () => [...menu.querySelectorAll<HTMLButtonElement>('.menu__item:not(:disabled)')];
  const pick = (item: HTMLButtonElement) => {
    const name = select.name;
    closeMenu();
    commit(select, item.dataset.value ?? '');
    trigger.querySelector('.field-trigger__text')!.textContent = selectedText(select);
    trigger.classList.toggle('is-placeholder', !select.value);
    nameAfterField(trigger, select);
    refocus(trigger, name);
  };

  menu.addEventListener('click', (event) => {
    const item = (event.target as Element).closest<HTMLButtonElement>('.menu__item');
    if (item && !item.disabled) pick(item);
  });

  // Arrows move, Enter picks, Esc and Tab leave, a letter jumps to the next match.
  menu.addEventListener('keydown', (event) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? Math.min(list.length - 1, at + 1) : Math.max(0, at - 1);
      list[next]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      (event.key === 'Home' ? list[0] : list[list.length - 1])?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // the side panel would close too
      closeMenu(true);
    } else if (event.key === 'Tab') {
      closeMenu(true);
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      const letter = event.key.toLowerCase();
      const rest = [...list.slice(at + 1), ...list.slice(0, at + 1)];
      rest.find((item) => item.textContent?.trim().toLowerCase().startsWith(letter))?.focus();
    }
  });

  const away = (event: Event) => {
    if (!menu.contains(event.target as Node) && !trigger.contains(event.target as Node)) closeMenu();
  };
  const moved = (event: Event) => {
    if (!menu.contains(event.target as Node)) closeMenu();
  };
  document.addEventListener('pointerdown', away, true);
  window.addEventListener('scroll', moved, true);
  window.addEventListener('resize', moved);
  openMenu = {
    menu,
    trigger,
    cleanup: () => {
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('scroll', moved, true);
      window.removeEventListener('resize', moved);
    },
  };

  trigger.setAttribute('aria-expanded', 'true');
  (menu.querySelector<HTMLButtonElement>('.menu__item.is-selected:not(:disabled)') ?? items()[0])?.focus();
}

function menuItem(option: HTMLOptionElement, select: HTMLSelectElement) {
  const selected = option.value === select.value;
  return html`
    <button class="menu__item ${selected ? 'is-selected' : ''} ${option.value === '' ? 'is-placeholder' : ''}" type="button"
      role="option" aria-selected="${selected ? 'true' : 'false'}" data-value="${option.value}" ${option.disabled ? 'disabled' : ''}>
      <span>${option.textContent?.trim() ?? ''}</span>
      ${selected ? icon('check') : ''}
    </button>`;
}

function enhanceSelect(select: HTMLSelectElement): void {
  select.dataset.enhanced = '';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = `input field-trigger ${select.value ? '' : 'is-placeholder'}`;
  trigger.dataset.fieldFor = select.name;
  trigger.disabled = select.disabled;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  render(trigger, html`<span class="field-trigger__text">${selectedText(select)}</span>${icon('chevronDown')}`);
  nameAfterField(trigger, select);
  trigger.addEventListener('click', () => {
    if (openMenu?.trigger === trigger) closeMenu();
    else showMenu(select, trigger);
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      showMenu(select, trigger);
    }
  });
  hide(select);
  select.before(trigger);
}

// ---------- Dates ----------

const dateText = (value: string): string =>
  value
    ? parseDate(value).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : 'Pick a date';

function enhanceDate(input: HTMLInputElement): void {
  input.dataset.enhanced = '';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = `input field-trigger field-trigger--date ${input.value ? '' : 'is-placeholder'}`;
  trigger.dataset.fieldFor = input.name;
  trigger.disabled = input.disabled;
  trigger.setAttribute('aria-haspopup', 'dialog');
  const label = input.getAttribute('aria-label')
    ?? input.closest('.field')?.querySelector('.field__label')?.textContent?.trim();
  render(trigger, html`${icon('calendar')}<span class="field-trigger__text">${dateText(input.value)}</span>${icon('chevronDown')}`);
  nameAfterField(trigger, input);
  trigger.addEventListener('click', () => {
    const name = input.name;
    openDatePicker({
      value: input.value,
      today,
      min: input.min,
      max: input.max,
      // Only a date the form can do without offers Clear: mark it data-optional.
      clearable: 'optional' in input.dataset,
      title: label ?? 'Pick a date',
      anchor: trigger,
      onPick: (value) => {
        commit(input, value);
        trigger.querySelector('.field-trigger__text')!.textContent = dateText(value);
        trigger.classList.toggle('is-placeholder', !value);
        nameAfterField(trigger, input);
        refocus(trigger, name);
      },
    });
  });
  hide(input);
  input.before(trigger);
}

let ids = 0;

/**
 * Names the button after its field — "Method, GCash" — by pointing at the
 * field's label and at the button's own text, so a screen reader hears both.
 */
function nameAfterField(trigger: HTMLButtonElement, control: HTMLElement): void {
  if (control.getAttribute('aria-label')) {
    trigger.setAttribute('aria-label', `${control.getAttribute('aria-label')}: ${trigger.textContent?.trim() ?? ''}`);
    return;
  }
  const label = control.closest('.field')?.querySelector<HTMLElement>('.field__label');
  const text = trigger.querySelector<HTMLElement>('.field-trigger__text');
  if (!label || !text) return;
  label.id ||= `field-label-${(ids += 1)}`;
  text.id ||= `field-value-${(ids += 1)}`;
  trigger.setAttribute('aria-labelledby', `${label.id} ${text.id}`);
}

/** Out of sight and out of the tab order, but still in the form with its value. */
function hide(control: HTMLElement): void {
  control.classList.add('field-native');
  control.tabIndex = -1;
  control.setAttribute('aria-hidden', 'true');
}

// ---------- Watching for new fields ----------

function enhanceAll(root: ParentNode): void {
  root.querySelectorAll<HTMLSelectElement>('select.input:not([data-enhanced]):not([multiple])').forEach(enhanceSelect);
  root.querySelectorAll<HTMLInputElement>('input.input[type="date"]:not([data-enhanced])').forEach(enhanceDate);
}

/** Starts watching the page. Call once. */
export function startFields(): void {
  enhanceAll(document);
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      // A redraw under an open list replaced its button: the list is stale.
      if (openMenu && !openMenu.trigger.isConnected) closeMenu();
      enhanceAll(document);
    });
  }).observe(document.body, { childList: true, subtree: true });
}
