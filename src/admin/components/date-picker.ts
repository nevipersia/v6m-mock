// The one date pop-up for the whole desk: every date field, and any page that
// steps through months. It wears the same .picker look as the Bookings
// calendar's picker — a year, its twelve months, then that month's days — so
// picking a date feels the same wherever it happens.
//
// It lives outside the app's markup, as its own <dialog>, so it opens over the
// side panel as easily as over a page, and the page's redraws never touch it.

import { html, render, type SafeHTML } from '../../core/dom.js';
import { formatDate, parseDate, toISODate } from '../../core/format.js';
import type { DayAvailability } from '../../core/rules.js';
import type { ISODate } from '../../core/types.js';
import { icon } from './icons.js';
import { placeNear } from './popover.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface DatePickerOptions {
  /** The date already chosen, or '' for none. */
  value: ISODate | '';
  /** The desk's today: the demo date in the mock build. */
  today: ISODate;
  min?: ISODate | '';
  max?: ISODate | '';
  /** 'day' picks a date; 'month' picks a whole month (answering with its 1st). */
  mode?: 'day' | 'month';
  title?: string;
  /** Offers a Clear button that answers ''. */
  clearable?: boolean;
  /**
   * What each day holds for the chosen booking. A day that can't be booked is
   * greyed out; what it holds is only read out to screen readers.
   */
  dayInfo?: ((day: ISODate) => DayAvailability) | null;
  /** The button it opened from: the picker sits next to it. */
  anchor?: HTMLElement | null;
  onPick: (value: ISODate | '') => void;
  /**
   * A stay of one or more nights (rooms): tap the check-in day, then the
   * check-out day. `nights` is the stay already chosen. Answers through
   * onPickStay instead of onPick.
   */
  stay?: { nights: number; maxNights: number; onPickStay: (checkIn: ISODate, nights: number) => void } | null;
}

const monthStart = (year: number, month: number): ISODate => toISODate(new Date(year, month, 1));
const monthEnd = (year: number, month: number): ISODate => toISODate(new Date(year, month + 1, 0));

export function openDatePicker(options: DatePickerOptions): void {
  const { today, min = '', max = '', mode = 'day', clearable = false, dayInfo = null, onPick, stay = null } = options;
  const baseTitle = options.title ?? (mode === 'month' ? 'Go to a month' : 'Pick a date');
  /** The check-in tapped, while waiting for the check-out. */
  let checkIn: ISODate | null = null;
  const nightsBetween = (from: ISODate, to: ISODate): number =>
    Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
  /** Every night from check-in to the night before this day is free. */
  const canLeaveOn = (day: ISODate): boolean => {
    if (!checkIn || day <= checkIn) return false;
    const nights = nightsBetween(checkIn, day);
    if (!stay || nights > stay.maxNights) return false;
    for (let index = 0; index < nights; index += 1) {
      const night = toISODate(new Date(parseDate(checkIn).getFullYear(), parseDate(checkIn).getMonth(), parseDate(checkIn).getDate() + index));
      if (outOfRange(night) || dayInfo?.(night).disabled) return false;
    }
    return true;
  };
  const start = parseDate(options.value || today);
  let year = start.getFullYear();
  let month = start.getMonth();
  const returnTo = document.activeElement as HTMLElement | null;

  const dialog = document.createElement('dialog');
  dialog.className = 'picker is-entering';
  dialog.setAttribute('aria-label', baseTitle);
  document.body.append(dialog);

  const outOfRange = (day: ISODate): boolean => (!!min && day < min) || (!!max && day > max);
  const monthOutOfRange = (y: number, m: number): boolean =>
    (!!min && monthEnd(y, m) < min) || (!!max && monthStart(y, m) > max);

  function draw(focusKey?: string): void {
    const title = stay ? (checkIn ? 'Now the check-out day' : 'Check-in day') : baseTitle;
    const first = new Date(year, month, 1);
    const leading = (first.getDay() + 6) % 7; // Monday first
    const length = new Date(year, month + 1, 0).getDate();
    const days = Array.from({ length }, (_, index) => toISODate(new Date(year, month, index + 1)));
    const chosen = options.value;
    const shownMonth = options.value ? parseDate(options.value) : null;
    // The stay on show: the one being picked, else the one already chosen.
    const rangeFrom = stay ? checkIn ?? (chosen || null) : null;
    const rangeTo = stay && !checkIn && chosen && stay.nights > 1
      ? toISODate(new Date(parseDate(chosen).getFullYear(), parseDate(chosen).getMonth(), parseDate(chosen).getDate() + stay.nights))
      : null;

    const body: SafeHTML = html`
      <div class="picker__body">
        <header class="picker__head">
          <h2 class="picker__title">${title}</h2>
          <button class="picker__icon" type="button" data-pick="close" data-key="close" aria-label="Close">${icon('x')}</button>
        </header>

        <div class="picker__year">
          <button class="picker__icon" type="button" data-pick="year" data-step="-1" data-key="year-back" aria-label="Previous year">${icon('chevronLeft')}</button>
          <span class="picker__year-label" aria-live="polite">${year}</span>
          <button class="picker__icon" type="button" data-pick="year" data-step="1" data-key="year-on" aria-label="Next year">${icon('chevronRight')}</button>
        </div>

        <div class="picker__months" role="group" aria-label="Months of ${year}">
          ${MONTHS.map((name, index) => {
            const isChosen = !!shownMonth && shownMonth.getFullYear() === year && shownMonth.getMonth() === index;
            const isViewed = mode === 'day' && index === month;
            return html`
              <button class="picker__month ${isViewed || (mode === 'month' && isChosen) ? 'is-picked' : ''} ${isChosen ? 'is-shown' : ''}" type="button"
                data-pick="month" data-month="${index}" data-key="month-${index}" ${monthOutOfRange(year, index) ? 'disabled' : ''}
                aria-label="${new Date(year, index, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}">${name}</button>`;
          })}
        </div>

        ${mode === 'day' ? html`
          <div class="picker__days">
            <p class="picker__days-label">${first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
            <div class="picker__grid">
              ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((letter) => html`<span class="picker__weekday" aria-hidden="true">${letter}</span>`)}
              ${Array.from({ length: leading }, () => html`<span></span>`)}
              ${days.map((day) => {
                const info = dayInfo && !outOfRange(day) ? dayInfo(day) : null;
                const label = info ? `${formatDate(day, 'long')}, ${info.label}` : formatDate(day, 'long');
                // Picking a check-out: a later day the whole stay fits before; an earlier one starts over.
                const leaving = !!checkIn && day > checkIn;
                const blocked = outOfRange(day) || (leaving ? !canLeaveOn(day) : !!info?.disabled);
                const picked = stay ? day === rangeFrom || day === rangeTo : day === chosen;
                const inStay = !!rangeFrom && !!rangeTo && day > rangeFrom && day < rangeTo;
                return html`
                <button class="picker__day ${day === today ? 'is-today' : ''} ${picked ? 'is-picked' : ''} ${inStay ? 'is-in-stay' : ''} ${info && !leaving ? `is-${info.tone}` : ''}" type="button"
                  data-pick="day" data-date="${day}" data-key="day-${day}" ${blocked ? 'disabled' : ''}
                  aria-label="${label}">${parseDate(day).getDate()}</button>`;
              })}
            </div>
          </div>` : ''}

        <div class="picker__shortcuts">
          ${mode === 'day'
            ? checkIn
              ? html`<span class="picker__stay small muted">Check-in ${formatDate(checkIn)}</span>
                <button class="btn btn--quiet btn--sm" type="button" data-pick="one-night">Just 1 night</button>`
              : html`<button class="btn btn--secondary btn--sm" type="button" data-pick="today" ${outOfRange(today) || dayInfo?.(today).disabled ? 'disabled' : ''}>Today</button>`
            : html`<button class="btn btn--secondary btn--sm" type="button" data-pick="this-month">This month</button>`}
          ${clearable ? html`<button class="btn btn--quiet btn--sm" type="button" data-pick="clear">Clear</button>` : ''}
        </div>
      </div>`;

    render(dialog, body);
    const target = (focusKey && dialog.querySelector<HTMLElement>(`[data-key="${focusKey}"]`))
      || dialog.querySelector<HTMLElement>('.picker__day.is-picked, .picker__month.is-picked')
      || dialog.querySelector<HTMLElement>('[data-key="close"]');
    target?.focus();
  }

  function close(): void {
    dialog.close();
    dialog.remove();
    if (returnTo?.isConnected) returnTo.focus();
  }

  function answer(value: ISODate | ''): void {
    close();
    onPick(value);
  }

  dialog.addEventListener('click', (event) => {
    // A click on the dialog itself, outside its body, is a click on the backdrop.
    if (event.target === dialog) {
      close();
      return;
    }
    const el = (event.target as Element).closest<HTMLElement>('[data-pick]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    switch (el.dataset.pick) {
      case 'close': close(); break;
      case 'year':
        year += Number(el.dataset.step) || 0;
        draw(el.dataset.key);
        break;
      case 'month':
        month = Number(el.dataset.month) || 0;
        if (mode === 'month') answer(monthStart(year, month));
        else draw(el.dataset.key);
        break;
      case 'day': {
        const day = el.dataset.date ?? '';
        if (!stay) {
          answer(day);
        } else if (checkIn && day > checkIn) {
          const nights = nightsBetween(checkIn, day);
          close();
          stay.onPickStay(checkIn, nights);
        } else {
          checkIn = day;
          draw(`day-${day}`);
        }
        break;
      }
      case 'today':
        if (stay) {
          checkIn = today;
          draw(`day-${today}`);
        } else {
          answer(today);
        }
        break;
      case 'one-night':
        if (stay && checkIn) {
          const from = checkIn;
          close();
          stay.onPickStay(from, 1);
        }
        break;
      case 'this-month': {
        const now = parseDate(today);
        answer(monthStart(now.getFullYear(), now.getMonth()));
        break;
      }
      case 'clear': answer(''); break;
      default: break;
    }
  });

  // Esc closes just this; a side panel underneath listens for Esc as well.
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') event.stopPropagation();
  });

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });

  draw();
  dialog.showModal();
  placeNear(dialog, options.anchor ?? returnTo);
  draw(); // focus lands once the dialog is open
}
