// The calendar side of the Bookings page: a month (by default) or a week, and
// any day opened from them in their place. Navigation is free: staff can step
// back through past dates or jump ahead, not just the sample data week.

import { $maybe, flag, html, type SafeHTML, type TemplateValue } from '../../core/dom.js';
import { addDays, formatDate, parseDate, peso, plural, timeOf, toISODate } from '../../core/format.js';
import {
  bookingWindow, closingEvent, exclusiveOn, exclusiveOverlapping, findSession, isActive, poolGuests, productLabel, unitBookingOn,
} from '../../core/rules.js';
import type { ISODate, State, Unit } from '../../core/types.js';
import type { DeskContext, HandlerMap } from '../types.js';
import { paymentPill } from '../components/badges.js';
import { icon } from '../components/icons.js';
import { emptyState, pageHead } from '../layout.js';

type RangeId = 'week' | 'month';

const RANGES: { id: RangeId; label: string }[] = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Anchor is the date the view is centred on; null means "follow the demo date".
// pickedDay is the day the narrow-screen strip has open; null means "today, or
// the first day of the week on screen".
const ui: {
  range: RangeId;
  anchor: ISODate | null;
  pickedDay: ISODate | null;
  /** A day opened from the month or week, shown in their place until Back. */
  openDay: ISODate | null;
  /** The pop-up date picker, and the month its small calendar is showing. */
  picker: { open: boolean; year: number; month: number };
} = { range: 'month', anchor: null, pickedDay: null, openDay: null, picker: { open: false, year: 0, month: 0 } };

const anchorOf = (state: State): ISODate => ui.anchor ?? state.meta.asOf;

/** Which way the last move went, so the new period slides in from that side. */
let motion: 'back' | 'on' | 'in' | 'out' | 'swap' = 'swap';

const startOfWeek = (date: ISODate): ISODate => addDays(date, -((parseDate(date).getDay() + 6) % 7)); // Monday
const startOfMonth = (date: ISODate): ISODate => `${date.slice(0, 8)}01`;

/** Every day of a month, from any date inside it. */
function monthDays(date: ISODate): ISODate[] {
  const first = parseDate(startOfMonth(date));
  const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return Array.from({ length }, (_, index) => addDays(toISODate(first), index));
}

function daysInView(state: State): ISODate[] {
  const anchor = anchorOf(state);
  if (ui.range === 'week') return Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(anchor), index));
  return monthDays(anchor);
}

/** "September 2026" in full for a month; "Sep 14 – Sep 20" for a week, so it fits between the arrows. */
function rangeLabel(state: State): string {
  const days = daysInView(state);
  const first = days[0] ?? state.meta.asOf;
  const last = days[days.length - 1] ?? first;
  if (ui.range === 'month') return parseDate(first).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `${formatDate(first, 'monthDay')} – ${formatDate(last, 'monthDay')}`;
}

const shortName = (name: string): string => {
  const [first = '', ...rest] = name.split(' ');
  const last = rest[rest.length - 1];
  return last ? `${first} ${last.charAt(0)}.` : first;
};

const bookingsOn = (state: State, day: ISODate) => state.bookings.filter((booking) => isActive(booking) && booking.date === day);

// ---------- Day view ----------

function dayView(ctx: DeskContext, day: ISODate): SafeHTML {
  const { state } = ctx;
  const event = closingEvent(state, day);
  const bookings = bookingsOn(state, day).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return html`
    ${event ? html`<p class="notice notice--event">Closed for ${event.title}. Walk-ins and other bookings are blocked.</p>` : ''}
    ${exclusiveOn(state, day) ? html`
      <p class="notice notice--exclusive">
        Exclusive rental: ${exclusiveOn(state, day)?.guestName} has ${productLabel(state, exclusiveOn(state, day)?.product ?? '')}
        (${timeOf(exclusiveOn(state, day)?.startsAt ?? '')}–${timeOf(exclusiveOn(state, day)?.endsAt ?? '')}). No other guests during that time.
      </p>` : ''}

    <div class="day-grid">
      <section class="panel" data-part="Bookings that day">
        <header class="panel__head">
          <h2 class="panel__title">Bookings</h2>
          <span class="panel__count">${bookings.length}</span>
        </header>
        ${bookings.length ? html`
          <ul class="rows">
            ${bookings.map((booking) => html`
              <li class="row">
                <button class="row__main" type="button" data-action="open-booking" data-id="${booking.id}">
                  <span class="row__title">${booking.guestName}</span>
                  <span class="row__meta">${productLabel(state, booking.product)} · ${timeOf(booking.startsAt)} · ${plural(booking.adults + booking.kids, 'guest')} · ${peso(booking.total)}</span>
                </button>
                <span class="row__badges">${paymentPill(booking)}</span>
              </li>`)}
          </ul>` : emptyState('Nothing booked', 'This day is completely open.')}
      </section>

      <section class="panel" data-part="What is still free">
        <header class="panel__head"><h2 class="panel__title">Availability</h2></header>
        <ul class="rows">
          ${state.poolSessions.map((session) => {
            const guests = poolGuests(state, day, session.id);
            const held = exclusiveOverlapping(state, bookingWindow(state, session.id, day));
            return html`
              <li class="row">
                <span class="row__main"><span class="row__title">${session.label}</span></span>
                <span class="small muted">${held ? 'Exclusive' : plural(guests, 'guest')}</span>
              </li>`;
          })}
          ${state.units.map((unit) => {
            const booking = unitBookingOn(state, unit.id, day);
            const held = exclusiveOverlapping(state, bookingWindow(state, unit.id, day));
            return html`
              <li class="row">
                <span class="row__main"><span class="row__title">${unit.name}</span></span>
                ${booking
                  ? html`<button class="btn btn--quiet btn--sm" type="button" data-action="open-booking" data-id="${booking.id}">${shortName(booking.guestName)}</button>`
                  : event || held || !ctx.can('bookings.write')
                    ? html`<span class="small muted">${event ? 'Closed' : held ? 'Exclusive' : 'Open'}</span>`
                    : html`<button class="btn btn--secondary btn--sm" type="button" data-action="new-booking" data-product="${unit.id}" data-date="${day}">Book</button>`}
              </li>`;
          })}
        </ul>
      </section>
    </div>`;
}

// ---------- Week view (resource grid) ----------

function poolCell(ctx: DeskContext, sessionId: string, day: ISODate): SafeHTML | '' {
  const session = findSession(ctx.state, sessionId);
  if (!session) return '';
  if (exclusiveOverlapping(ctx.state, bookingWindow(ctx.state, sessionId, day))) return html`<span class="cal-closed cal-closed--exclusive">Exclusive</span>`;
  const guests = poolGuests(ctx.state, day, sessionId);
  const content = html`<span class="cal-pool__text">${plural(guests, 'guest')}</span>`;

  if (!ctx.can('bookings.write')) return html`<div class="cal-pool">${content}</div>`;
  return html`
    <button class="cal-pool" type="button" data-action="new-booking" data-product="${sessionId}" data-date="${day}"
      aria-label="${session.label} on ${formatDate(day)}: ${plural(guests, 'guest')}. Add booking">${content}</button>`;
}

function unitCell(ctx: DeskContext, unit: Unit, day: ISODate): SafeHTML {
  const booking = unitBookingOn(ctx.state, unit.id, day);
  if (booking) {
    return html`
      <button class="cal-chip cal-chip--${unit.kind} cal-chip--${booking.status}" type="button" data-action="open-booking" data-id="${booking.id}"
        title="${booking.guestName} · ${booking.id}">${shortName(booking.guestName)}</button>`;
  }
  if (exclusiveOverlapping(ctx.state, bookingWindow(ctx.state, unit.id, day))) return html`<span class="cal-closed cal-closed--exclusive">Exclusive</span>`;
  if (!ctx.can('bookings.write')) return html`<span class="cal-empty"></span>`;
  return html`
    <button class="cal-add" type="button" data-action="new-booking" data-product="${unit.id}" data-date="${day}"
      aria-label="Book ${unit.name} on ${formatDate(day)}">${icon('plus')}</button>`;
}

function exclusiveCell(ctx: DeskContext, day: ISODate): SafeHTML {
  const booking = exclusiveOn(ctx.state, day);
  if (booking) {
    return html`
      <button class="cal-chip cal-chip--exclusive cal-chip--${booking.status}" type="button" data-action="open-booking" data-id="${booking.id}"
        title="${booking.guestName} · ${productLabel(ctx.state, booking.product)}">${shortName(booking.guestName)}</button>`;
  }
  if (!ctx.can('bookings.write')) return html`<span class="cal-empty"></span>`;
  return html`
    <button class="cal-add" type="button" data-action="new-booking" data-product="EX-DAY-FULL" data-date="${day}"
      aria-label="Book an exclusive rental on ${formatDate(day)}">${icon('plus')}</button>`;
}

function eventCell(ctx: DeskContext, day: ISODate): SafeHTML {
  const event = ctx.state.events.find((item) => item.date === day);
  if (!event) return html`<span class="cal-empty"></span>`;
  if (event.bookingId) {
    return html`<button class="cal-chip cal-chip--event" type="button" data-action="open-booking" data-id="${event.bookingId}" title="${event.title}">${event.title}</button>`;
  }
  return html`<span class="cal-chip cal-chip--event ${event.blocksCalendar ? '' : 'cal-chip--hold'}" title="${event.title}">${event.title}</span>`;
}

interface GridRow {
  label: string;
  cell: (day: ISODate) => TemplateValue;
  alwaysShow?: boolean;
}

/** The day the strip has open: the one tapped, else today, else the first day shown. */
function pickedDay(state: State, days: ISODate[]): ISODate {
  if (ui.pickedDay && days.includes(ui.pickedDay)) return ui.pickedDay;
  if (days.includes(state.meta.asOf)) return state.meta.asOf;
  return days[0] ?? state.meta.asOf;
}

function weekView(ctx: DeskContext, days: ISODate[]): SafeHTML {
  const { state } = ctx;
  const rows: GridRow[] = [
    { label: 'Events', cell: (day) => eventCell(ctx, day), alwaysShow: true },
    { label: 'Exclusive rental', cell: (day) => exclusiveCell(ctx, day) },
    ...state.poolSessions.map((session): GridRow => ({ label: session.label, cell: (day) => poolCell(ctx, session.id, day) })),
    ...state.units.map((unit): GridRow => ({ label: unit.name, cell: (day) => unitCell(ctx, unit, day) })),
  ];

  const picked = pickedDay(state, days);

  return html`
    <div class="week-narrow" data-part="Pick a day">
      ${weekStrip(ctx, days, picked)}
      ${dayView(ctx, picked)}
    </div>

    <div class="panel panel--flush week-wide" data-part="The grid">
      <div class="table-scroll">
        <table class="calendar">
          <caption class="sr-only">Bookings by unit and day</caption>
          <thead>
            <tr>
              <th scope="col" class="calendar__corner"></th>
              ${days.map((day) => html`
                <th scope="col" class="${day === state.meta.asOf ? 'is-today' : ''}">
                  <button class="calendar__head-day" type="button" data-action="open-day" data-date="${day}" aria-label="Open ${formatDate(day, 'long')}">
                    <span class="calendar__weekday">${formatDate(day, 'weekday')}</span>
                    <span class="calendar__day">${parseDate(day).getDate()}</span>
                  </button>
                </th>`)}
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => html`
              <tr>
                <th scope="row">${row.label}</th>
                ${days.map((day) => {
                  const closed = closingEvent(state, day) && !row.alwaysShow;
                  return html`<td class="${day === state.meta.asOf ? 'is-today' : ''}">${closed ? html`<span class="cal-closed">Closed</span>` : row.cell(day)}</td>`;
                })}
              </tr>`)}
          </tbody>
        </table>
      </div>
    </div>`;
}

/**
 * Narrow screens get a strip of the week's days and the day below it, instead
 * of a 7-by-12 grid that only fits two and a half columns. The grid itself is
 * still in the page for anything wider; CSS decides which one shows.
 */
function weekStrip(ctx: DeskContext, days: ISODate[], picked: ISODate): SafeHTML {
  const { state } = ctx;
  return html`
    <div class="day-strip" role="tablist" aria-label="Day of the week">
      ${days.map((day) => {
        const count = bookingsOn(state, day).length;
        const closed = closingEvent(state, day);
        return html`
          <button class="day-strip__day ${day === picked ? 'is-picked' : ''} ${day === state.meta.asOf ? 'is-today' : ''}"
            type="button" role="tab" aria-selected="${flag(day === picked)}" data-action="pick-day" data-date="${day}">
            <span class="day-strip__weekday">${formatDate(day, 'weekday')}</span>
            <span class="day-strip__date">${parseDate(day).getDate()}</span>
            <span class="day-strip__mark ${closed ? 'is-closed' : ''}">${closed ? '×' : count ? count : ''}</span>
          </button>`;
      })}
    </div>`;
}

// ---------- Month view ----------

function monthView(ctx: DeskContext, days: ISODate[]): SafeHTML {
  const { state } = ctx;
  const leading = (parseDate(days[0] ?? state.meta.asOf).getDay() + 6) % 7; // Monday-first grid

  return html`
    <div class="panel panel--flush" data-part="The month">
      <div class="month">
        ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => html`<span class="month__weekday">${label}</span>`)}
        ${Array.from({ length: leading }, () => html`<span class="month__cell month__cell--blank"></span>`)}
        ${days.map((day) => {
          const bookings = bookingsOn(state, day);
          const event = closingEvent(state, day);
          const guests = bookings.reduce((sum, booking) => sum + booking.adults + booking.kids, 0);
          const canBook = ctx.can('bookings.write') && !event;
          return html`
            <div class="month__cell ${day === state.meta.asOf ? 'is-today' : ''}" data-action="open-day" data-date="${day}">
              <div class="month__head">
                <button class="month__date" type="button" data-action="open-day" data-date="${day}" aria-label="Open ${formatDate(day, 'long')}">${parseDate(day).getDate()}</button>
                ${canBook ? html`<button class="month__add" type="button" data-action="new-booking" data-date="${day}" aria-label="New booking on ${formatDate(day, 'long')}">${icon('plus')}</button>` : ''}
              </div>
              ${event ? html`<span class="cal-chip cal-chip--event month__event" title="${event.title}">${event.title}</span>` : ''}
              ${bookings.length ? html`
                <button class="month__summary" type="button" data-action="open-day" data-date="${day}"
                  aria-label="${plural(bookings.length, 'booking')}, ${plural(guests, 'guest')} on ${formatDate(day, 'long')}">
                  <span class="month__count" aria-hidden="true">${bookings.length}</span>
                  <span class="month__summary-text">
                    <strong>${plural(bookings.length, 'booking')}</strong>
                    <span class="small muted">${plural(guests, 'guest')}</span>
                  </span>
                </button>` : ''}
            </div>`;
        })}
      </div>
    </div>`;
}

/**
 * The pop-up behind the month and year: a year, its twelve months, and the
 * picked month's days. A month moves the calendar behind it straight away; a
 * day opens that day and closes the pop-up.
 */
function pickerDialog(state: State): SafeHTML {
  const { year, month } = ui.picker;
  const shown = parseDate(anchorOf(state));
  const first = new Date(year, month, 1);
  const days = monthDays(toISODate(first));
  const leading = (first.getDay() + 6) % 7; // Monday first
  const selected = ui.openDay;
  const label = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return html`
    <dialog class="picker" data-modal data-cancel="close-picker" aria-labelledby="picker-title">
      <div class="picker__body">
        <header class="picker__head">
          <h2 class="picker__title" id="picker-title">Go to a date</h2>
          <button class="picker__icon" type="button" data-action="close-picker" data-focus-key="picker-close" aria-label="Close">${icon('x')}</button>
        </header>

        <div class="picker__year">
          <button class="picker__icon" type="button" data-action="picker-year" data-step="-1" data-focus-key="year-back" aria-label="Previous year">${icon('chevronLeft')}</button>
          <span class="picker__year-label" aria-live="polite">${year}</span>
          <button class="picker__icon" type="button" data-action="picker-year" data-step="1" data-focus-key="year-on" aria-label="Next year">${icon('chevronRight')}</button>
        </div>

        <div class="picker__months" role="group" aria-label="Months of ${year}">
          ${MONTHS.map((name, index) => {
            const isPicked = index === month;
            const isShown = year === shown.getFullYear() && index === shown.getMonth();
            return html`
              <button class="picker__month ${isPicked ? 'is-picked' : ''} ${isShown ? 'is-shown' : ''}" type="button"
                data-action="picker-month" data-month="${index}" data-focus-key="month-${index}"
                aria-pressed="${flag(isPicked)}" aria-label="${new Date(year, index, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}">${name}</button>`;
          })}
        </div>

        <div class="picker__days">
          <p class="picker__days-label">${label}</p>
          <div class="picker__grid">
            ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((letter) => html`<span class="picker__weekday" aria-hidden="true">${letter}</span>`)}
            ${Array.from({ length: leading }, () => html`<span></span>`)}
            ${days.map((day) => {
              const count = bookingsOn(state, day).length;
              return html`
                <button class="picker__day ${day === state.meta.asOf ? 'is-today' : ''} ${day === selected ? 'is-picked' : ''}" type="button"
                  data-action="picker-day" data-date="${day}" aria-label="${formatDate(day, 'long')}${count ? `, ${plural(count, 'booking')}` : ''}">
                  ${parseDate(day).getDate()}
                  ${count ? html`<span class="picker__dot" aria-hidden="true"></span>` : ''}
                </button>`;
            })}
          </div>
        </div>

        <div class="picker__shortcuts">
          <button class="btn btn--secondary btn--sm" type="button" data-action="picker-today">Today</button>
          <button class="btn btn--secondary btn--sm" type="button" data-action="picker-week">This week</button>
        </div>
      </div>
    </dialog>`;
}

/** The month or week: arrows either side of the month and year, which opens the picker. */
function periodBar(state: State, extra: TemplateValue = ''): SafeHTML {
  return html`
    <div class="calendar-bar">
      <div class="period">
        <button class="btn btn--secondary btn--icon" type="button" data-action="step" data-step="-1" aria-label="Previous ${ui.range}">${icon('chevronLeft')}</button>
        <button class="period__label" type="button" data-action="open-picker" aria-haspopup="dialog" aria-expanded="${flag(ui.picker.open)}"
          title="Go to a date">
          <span>${rangeLabel(state)}</span>
          ${icon('chevronDown')}
        </button>
        <button class="btn btn--secondary btn--icon" type="button" data-action="step" data-step="1" aria-label="Next ${ui.range}">${icon('chevronRight')}</button>
      </div>

      <div class="calendar-bar__end">
      ${extra}
      <div class="segmented" role="group" aria-label="Calendar view">
        ${RANGES.map((range) => html`
          <button class="segmented__option ${ui.range === range.id ? 'is-active' : ''}" type="button"
            data-action="set-range" data-range="${range.id}" aria-pressed="${flag(ui.range === range.id)}">${range.label}</button>`)}
      </div>
      </div>
    </div>`;
}

/** One day, opened from the month or week, with the way back to it. */
function dayBar(state: State, day: ISODate, extra: TemplateValue = ''): SafeHTML {
  return html`
    <div class="calendar-bar">
      <div class="period">
        <button class="btn btn--secondary btn--sm" type="button" data-action="close-day">
          ${icon('arrowLeft')} ${rangeLabel(state)}
        </button>
        <h2 class="period__day">${formatDate(day, 'short')}</h2>
      </div>
      <div class="calendar-bar__end">
        ${extra}
        <button class="btn btn--secondary btn--icon" type="button" data-action="step-day" data-step="-1" aria-label="Previous day">${icon('chevronLeft')}</button>
        <button class="btn btn--secondary btn--icon" type="button" data-action="step-day" data-step="1" aria-label="Next day">${icon('chevronRight')}</button>
      </div>
    </div>`;
}

const LEGEND = html`
  <ul class="legend" data-part="What the colours mean">
    <li><span class="legend__swatch legend__swatch--room"></span>Rooms</li>
    <li><span class="legend__swatch legend__swatch--cottage"></span>Cottages</li>
    <li><span class="legend__swatch legend__swatch--exclusive"></span>Exclusive rental</li>
    <li><span class="legend__swatch legend__swatch--event"></span>Events</li>
    <li><span class="legend__swatch legend__swatch--hold"></span>On hold, downpayment due</li>
    <li><span class="legend__swatch legend__swatch--done"></span>Checked out</li>
  </ul>`;

/**
 * The calendar side of the Bookings page. `switcher` is the page's Calendar /
 * List toggle, which sits with New booking in the heading.
 */
export function render(ctx: DeskContext, switcher: SafeHTML): SafeHTML {
  const { state } = ctx;
  const days = daysInView(state);
  const day = ui.openDay;
  // The day a new booking starts on: the open day, else the one tapped in the
  // strip, else today when it is on screen, else the first day shown.
  const anchor = anchorOf(state);
  const focused = day
    || (ui.pickedDay && days.includes(ui.pickedDay) && ui.pickedDay)
    || (days.includes(anchor) && anchor)
    || pickedDay(state, days);

  return html`
    ${pageHead({
      title: 'Bookings',
      actions: html`
        ${switcher}
        ${ctx.can('bookings.write') ? html`
          <button class="btn btn--primary" type="button" data-action="new-booking" data-date="${focused}"
            title="New booking on ${formatDate(focused, 'long')}">${icon('plus')} New booking</button>` : ''}`,
    })}

    <div class="cal-body" data-enter="bookings|cal:${enterKey(state)}" data-motion="${motion}">
      ${day ? html`
        ${dayBar(state, day)}
        ${dayView(ctx, day)}
        ${LEGEND}` : html`
        ${periodBar(state)}
        ${ui.range === 'month' ? monthView(ctx, days) : html`${weekView(ctx, days)}${LEGEND}`}`}
    </div>

    ${ui.picker.open ? pickerDialog(state) : ''}`;
}

/** The days on screen: the open day, else the month or week. The list shows the same ones. */
export const shownDays = (state: State): ISODate[] => (ui.openDay ? [ui.openDay] : daysInView(state));

/** "Sep 2026", "Sep 14 – Sep 20" or "Fri, Sep 18": what is on screen, in words. */
export const shownLabel = (state: State): string => (ui.openDay ? formatDate(ui.openDay, 'short') : rangeLabel(state));

/** The bar above the calendar or the list: the period and its selectors, or an open day and Back. */
export const navBar = (state: State, extra: TemplateValue = ''): SafeHTML =>
  (ui.openDay ? dayBar(state, ui.openDay, extra) : periodBar(state, extra));

export const pickerIfOpen = (state: State): SafeHTML | '' => (ui.picker.open ? pickerDialog(state) : '');

/** For components/motion.ts: what is on screen, and which way it arrived. */
export const enterKey = (state: State): string => `${ui.range}:${daysInView(state)[0] ?? ''}:${ui.openDay ?? ''}`;
export const enterMotion = (): string => motion;

/** Opens one day from elsewhere, such as the dashboard's Balances due card. */
export function showDay(day: ISODate): void {
  motion = 'in';
  openDay(day);
}

/** Shows a day in place of the month or week, and moves them along with it. */
function openDay(day: ISODate): void {
  ui.openDay = day;
  ui.anchor = day;
  ui.pickedDay = null;
}

const isRange = (value: string | undefined): value is RangeId => RANGES.some((range) => range.id === value);

export const actions: HandlerMap = {
  'open-picker': ({ ctx }) => {
    const shown = parseDate(ui.openDay ?? anchorOf(ctx.state));
    ui.picker = { open: true, year: shown.getFullYear(), month: shown.getMonth() };
    ctx.redraw();
  },

  'close-picker': ({ ctx }) => {
    ui.picker.open = false;
    ctx.redraw();
    $maybe<HTMLElement>('[data-action="open-picker"]')?.focus();
  },

  'picker-year': ({ el, ctx }) => {
    ui.picker.year += Number(el.dataset.step) || 0;
    ctx.redraw();
  },

  // A month moves the calendar behind the pop-up too, so it can be read through it.
  'picker-month': ({ el, ctx }) => {
    motion = 'swap';
    ui.picker.month = Number(el.dataset.month) || 0;
    ui.anchor = toISODate(new Date(ui.picker.year, ui.picker.month, 1));
    ui.openDay = null;
    ui.pickedDay = null;
    ctx.redraw();
  },

  'picker-day': ({ el, ctx }) => {
    if (!el.dataset.date) return;
    motion = 'in';
    openDay(el.dataset.date);
    ui.picker.open = false;
    ctx.redraw();
  },

  'picker-today': ({ ctx }) => {
    motion = 'in';
    openDay(ctx.state.meta.asOf);
    ui.picker.open = false;
    ctx.redraw();
  },

  'picker-week': ({ ctx }) => {
    motion = 'swap';
    ui.range = 'week';
    ui.anchor = null;
    ui.openDay = null;
    ui.pickedDay = null;
    ui.picker.open = false;
    ctx.redraw();
  },

  'pick-day': ({ el, ctx }) => {
    ui.pickedDay = el.dataset.date ?? null;
    ctx.redraw();
  },

  'set-range': ({ el, ctx }) => {
    motion = 'swap';
    if (isRange(el.dataset.range)) ui.range = el.dataset.range;
    ui.pickedDay = null;
    ctx.redraw();
  },

  step: ({ el, ctx }) => {
    const direction = Number(el.dataset.step);
    motion = direction < 0 ? 'back' : 'on';
    const anchor = anchorOf(ctx.state);
    ui.pickedDay = null;
    if (ui.range === 'week') ui.anchor = addDays(startOfWeek(anchor), direction * 7);
    else {
      const first = parseDate(startOfMonth(anchor));
      ui.anchor = toISODate(new Date(first.getFullYear(), first.getMonth() + direction, 1));
    }
    ctx.redraw();
  },

  'open-day': ({ el, ctx }) => {
    if (!el.dataset.date) return;
    motion = 'in';
    openDay(el.dataset.date);
    ctx.redraw();
    window.scrollTo({ top: 0 });
  },

  'step-day': ({ el, ctx }) => {
    if (!ui.openDay) return;
    motion = Number(el.dataset.step) < 0 ? 'back' : 'on';
    openDay(addDays(ui.openDay, Number(el.dataset.step) || 0));
    ctx.redraw();
  },

  'close-day': ({ ctx }) => {
    motion = 'out';
    ui.openDay = null;
    ctx.redraw();
  },
};
