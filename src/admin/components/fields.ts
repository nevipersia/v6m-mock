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
import type { DayAvailability } from '../../core/rules.js';
import type { ISODate } from '../../core/types.js';
import { openDatePicker } from './date-picker.js';
import { icon } from './icons.js';
import { placeNear } from './popover.js';

let today: ISODate = new Date().toISOString().slice(0, 10);

/** The desk's today, for the date picker's Today button. Set on every draw. */
export function setFieldsToday(day: ISODate): void {
  today = day;
}

/** For a product (and a booking to leave out), each day's availability; null for a product it doesn't know. */
type Availability = (product: string, excludeId?: string) => ((day: ISODate) => DayAvailability) | null;
let availability: Availability | null = null;

/**
 * How full a day is for a product, for date fields marked data-availability:
 * their picker shows each day's slots for the form's chosen product. The
 * attribute's value, if any, is a booking to leave out (the one being edited).
 */
export function setDayAvailability(fn: Availability): void {
  availability = fn;
}

function dayInfoFor(input: HTMLInputElement): ((day: ISODate) => DayAvailability) | null {
  if (!availability || !('availability' in input.dataset)) return null;
  const product = input.form?.querySelector<HTMLSelectElement | HTMLInputElement>('[name="product"]')?.value;
  return product ? availability(product, input.dataset.availability || undefined) : null;
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
    const dayInfo = dayInfoFor(input);
    openDatePicker({
      value: input.value,
      today,
      min: input.min,
      max: input.max,
      dayInfo,
      legend: dayInfo ? input.dataset.legend ?? '' : '',
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

// ---------- Times ----------
//
// A time field opens three short columns — hour, minute, AM or PM — next to
// its button, the same card as a dropdown. Each pick writes straight into the
// real <input type="time"> (24-hour "HH:MM"), so the form reads it as before.

let openTime: { popup: HTMLElement; trigger: HTMLButtonElement; cleanup: () => void } | null = null;

function closeTime(focusTrigger = false): void {
  if (!openTime) return;
  const { popup, trigger, cleanup } = openTime;
  openTime = null;
  cleanup();
  trigger.setAttribute('aria-expanded', 'false');
  popup.classList.add('is-leaving');
  setTimeout(() => popup.remove(), 120);
  if (focusTrigger && trigger.isConnected) trigger.focus();
}

/** "14:05" as "2:05 PM". */
const timeText = (value: string): string => {
  const [hours = NaN, minutes = NaN] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 'Pick a time';
  const half = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${half}`;
};

function showTime(input: HTMLInputElement, trigger: HTMLButtonElement): void {
  closeTime();
  closeMenu();
  const popup = document.createElement('div');
  popup.className = 'menu timepick';
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', trigger.getAttribute('aria-label') ?? 'Pick a time');
  document.body.append(popup);

  // Without a value yet, start from the current clock rather than midnight.
  const now = new Date();
  const [startHours = now.getHours(), startMinutes = now.getMinutes()] = input.value ? input.value.split(':').map(Number) : [];
  let hour12 = startHours % 12 || 12;
  let minute = startMinutes;
  let pm = startHours >= 12;
  const value = () => `${String((hour12 % 12) + (pm ? 12 : 0)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  const draw = (focusKey?: string) => {
    render(popup, html`
      <div class="timepick__cols">
        <div class="timepick__col" role="listbox" aria-label="Hour">
          ${Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => html`
            <button class="menu__item timepick__item ${hour === hour12 ? 'is-selected' : ''}" type="button" role="option"
              aria-selected="${hour === hour12 ? 'true' : 'false'}" data-part="hour" data-value="${hour}" data-key="h${hour}">${hour}</button>`)}
        </div>
        <div class="timepick__col" role="listbox" aria-label="Minute">
          ${Array.from({ length: 60 }, (_, index) => index).map((item) => html`
            <button class="menu__item timepick__item ${item === minute ? 'is-selected' : ''}" type="button" role="option"
              aria-selected="${item === minute ? 'true' : 'false'}" data-part="minute" data-value="${item}" data-key="m${item}">${String(item).padStart(2, '0')}</button>`)}
        </div>
        <div class="timepick__col timepick__col--half" role="listbox" aria-label="AM or PM">
          ${['AM', 'PM'].map((half) => html`
            <button class="menu__item timepick__item ${(half === 'PM') === pm ? 'is-selected' : ''}" type="button" role="option"
              aria-selected="${(half === 'PM') === pm ? 'true' : 'false'}" data-part="half" data-value="${half}" data-key="${half}">${half}</button>`)}
        </div>
      </div>
      <div class="timepick__foot">
        <button class="btn btn--quiet btn--sm" type="button" data-part="now">Now</button>
        ${'optional' in input.dataset ? html`<button class="btn btn--quiet btn--sm" type="button" data-part="clear">Clear</button>` : ''}
        <button class="btn btn--secondary btn--sm" type="button" data-part="done">Done</button>
      </div>`);
    // Each column scrolls to its pick, so 2:35 shows 2 and 35 without hunting.
    popup.querySelectorAll<HTMLElement>('.timepick__col .is-selected').forEach((item) => {
      const column = item.parentElement as HTMLElement;
      column.scrollTop = item.offsetTop - column.clientHeight / 2 + item.offsetHeight / 2;
    });
    if (focusKey) popup.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
  };

  const write = () => {
    commit(input, value());
    trigger.querySelector('.field-trigger__text')!.textContent = timeText(value());
    trigger.classList.remove('is-placeholder');
    nameAfterField(trigger, input);
  };

  popup.addEventListener('click', (event) => {
    const el = (event.target as Element).closest<HTMLElement>('[data-part]');
    if (!el) return;
    const part = el.dataset.part;
    if (part === 'hour') hour12 = Number(el.dataset.value);
    else if (part === 'minute') minute = Number(el.dataset.value);
    else if (part === 'half') pm = el.dataset.value === 'PM';
    else if (part === 'now') {
      const clock = new Date();
      hour12 = clock.getHours() % 12 || 12;
      minute = clock.getMinutes();
      pm = clock.getHours() >= 12;
    } else if (part === 'clear') {
      commit(input, '');
      trigger.querySelector('.field-trigger__text')!.textContent = timeText('');
      trigger.classList.add('is-placeholder');
      closeTime(true);
      return;
    } else if (part === 'done') {
      write();
      closeTime(true);
      return;
    }
    write();
    draw(el.dataset.key);
  });

  popup.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // the side panel would close too
      closeTime(true);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const current = document.activeElement as HTMLElement | null;
    const column = current?.closest('.timepick__col');
    if (!current || !column) return;
    event.preventDefault();
    const items = [...column.querySelectorAll<HTMLElement>('.timepick__item')];
    const at = items.indexOf(current);
    items[event.key === 'ArrowDown' ? Math.min(items.length - 1, at + 1) : Math.max(0, at - 1)]?.focus();
  });

  const away = (event: Event) => {
    if (!popup.contains(event.target as Node) && !trigger.contains(event.target as Node)) closeTime();
  };
  document.addEventListener('pointerdown', away, true);
  openTime = { popup, trigger, cleanup: () => document.removeEventListener('pointerdown', away, true) };
  trigger.setAttribute('aria-expanded', 'true');
  draw();
  placeNear(popup, trigger);
  popup.querySelector<HTMLElement>('.timepick__col .is-selected')?.focus({ preventScroll: true });
}

function enhanceTime(input: HTMLInputElement): void {
  input.dataset.enhanced = '';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = `input field-trigger field-trigger--time ${input.value ? '' : 'is-placeholder'}`;
  trigger.dataset.fieldFor = input.name;
  trigger.disabled = input.disabled;
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  render(trigger, html`${icon('clock')}<span class="field-trigger__text">${timeText(input.value)}</span>${icon('chevronDown')}`);
  nameAfterField(trigger, input);
  trigger.addEventListener('click', () => {
    if (openTime?.trigger === trigger) closeTime();
    else showTime(input, trigger);
  });
  hide(input);
  input.before(trigger);
}

// ---------- Suggestions ----------
//
// A text field with a <datalist> keeps its typing, but its suggestions open in
// the desk's own list under the field instead of the browser's, filtered by
// what has been typed. Arrow down moves into them; Enter or a click fills the
// field in.

let openSuggest: { menu: HTMLElement; input: HTMLInputElement; cleanup: () => void } | null = null;

function closeSuggest(): void {
  if (!openSuggest) return;
  const { menu, cleanup } = openSuggest;
  openSuggest = null;
  cleanup();
  menu.remove();
}

function showSuggest(input: HTMLInputElement, options: string[]): void {
  const typed = input.value.trim().toLowerCase();
  const matches = options.filter((option) => option.toLowerCase().includes(typed) && option.toLowerCase() !== typed);
  if (!matches.length) {
    closeSuggest();
    return;
  }
  if (openSuggest?.input !== input) closeSuggest();
  let menu = openSuggest?.menu;
  if (!menu) {
    menu = document.createElement('div');
    menu.className = 'menu menu--suggest';
    menu.setAttribute('role', 'listbox');
    document.body.append(menu);
    const list = menu;
    list.addEventListener('pointerdown', (event) => event.preventDefault()); // keep the field focused
    list.addEventListener('click', (event) => {
      const item = (event.target as Element).closest<HTMLButtonElement>('.menu__item');
      if (!item) return;
      commit(input, item.dataset.value ?? '');
      closeSuggest();
      input.focus();
    });
    list.addEventListener('keydown', (event) => {
      const items = [...list.querySelectorAll<HTMLButtonElement>('.menu__item')];
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (event.key === 'ArrowUp' && at <= 0) input.focus();
        else items[event.key === 'ArrowDown' ? Math.min(items.length - 1, at + 1) : at - 1]?.focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeSuggest();
        input.focus();
      }
    });
    const away = (event: Event) => {
      if (!list.contains(event.target as Node) && event.target !== input) closeSuggest();
    };
    document.addEventListener('pointerdown', away, true);
    openSuggest = { menu: list, input, cleanup: () => document.removeEventListener('pointerdown', away, true) };
  }
  render(menu, html`${matches.map((option) => html`
    <button class="menu__item" type="button" role="option" aria-selected="false" data-value="${option}" tabindex="-1">${option}</button>`)}`);
  menu.style.minWidth = `${input.getBoundingClientRect().width}px`;
  placeNear(menu, input);
}

function enhanceSuggestions(input: HTMLInputElement): void {
  const list = document.getElementById(input.getAttribute('list') ?? '');
  const options = list ? [...list.querySelectorAll('option')].map((option) => option.value).filter(Boolean) : [];
  input.dataset.enhanced = '';
  input.removeAttribute('list'); // no browser list on top of ours
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-autocomplete', 'list');
  input.addEventListener('focus', () => showSuggest(input, options));
  input.addEventListener('input', () => showSuggest(input, options));
  input.addEventListener('blur', () => setTimeout(() => {
    if (openSuggest?.input === input && !openSuggest.menu.contains(document.activeElement)) closeSuggest();
  }, 0));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && openSuggest?.input === input) {
      event.preventDefault();
      openSuggest.menu.querySelector<HTMLElement>('.menu__item')?.focus();
    } else if (event.key === 'Escape' && openSuggest?.input === input) {
      event.stopPropagation();
      closeSuggest();
    }
  });
}

// ---------- Watching for new fields ----------

function enhanceAll(root: ParentNode): void {
  root.querySelectorAll<HTMLSelectElement>('select.input:not([data-enhanced]):not([multiple])').forEach(enhanceSelect);
  root.querySelectorAll<HTMLInputElement>('input.input[type="date"]:not([data-enhanced])').forEach(enhanceDate);
  root.querySelectorAll<HTMLInputElement>('input.input[type="time"]:not([data-enhanced])').forEach(enhanceTime);
  root.querySelectorAll<HTMLInputElement>('input.input[list]:not([data-enhanced])').forEach(enhanceSuggestions);
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
      if (openTime && !openTime.trigger.isConnected) closeTime();
      if (openSuggest && !openSuggest.input.isConnected) closeSuggest();
      enhanceAll(document);
    });
  }).observe(document.body, { childList: true, subtree: true });
}
