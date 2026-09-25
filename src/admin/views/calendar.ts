// Calendar with day, week and month views. Navigation is free: staff can step
// back through past dates or jump ahead, not just the sample data week.

import { flag, html, type SafeHTML, type TemplateValue } from '../../core/dom.js';
import { addDays, formatDate, parseDate, peso, plural, timeOf, toISODate } from '../../core/format.js';
import {
  bookingWindow, closingEvent, exclusiveOn, exclusiveOverlapping, findSession, isActive, poolGuests, productLabel, unitBookingOn,
} from '../../core/rules.js';
import type { ISODate, State, Unit } from '../../core/types.js';
import type { DeskContext, HandlerMap } from '../types.js';
import { paymentPill } from '../components/badges.js';
import { icon } from '../components/icons.js';
import { emptyState, pageHead } from '../layout.js';

type RangeId = 'day' | 'week' | 'month' | 'custom';

const RANGES: { id: RangeId; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'custom', label: 'Range' },
];

/** A hand-picked range is capped: a year of columns would be unreadable. */
const MAX_RANGE_DAYS = 31;

// Anchor is the date the view is centred on; null means "follow the demo date".
// pickedDay is the day the narrow-screen strip has open; null means "today, or
// the first day of the week on screen".
const ui: {
  range: RangeId;
  anchor: ISODate | null;
  pickedDay: ISODate | null;
  /** Ends of the hand-picked range, used when range is 'custom'. */
  from: ISODate | null;
  to: ISODate | null;
  /** The date picker under the heading is open. */
  datesOpen: boolean;
} = { range: 'week', anchor: null, pickedDay: null, from: null, to: null, datesOpen: false };

const anchorOf = (state: State): ISODate => ui.anchor ?? state.meta.asOf;

const startOfWeek = (date: ISODate): ISODate => addDays(date, -((parseDate(date).getDay() + 6) % 7)); // Monday
const startOfMonth = (date: ISODate): ISODate => `${date.slice(0, 8)}01`;

/** The hand-picked range, filled in from the demo date until the reader sets it. */
function customRange(state: State): { from: ISODate; to: ISODate } {
  const from = ui.from ?? anchorOf(state);
  const to = ui.to && ui.to >= from ? ui.to : addDays(from, 6);
  return { from, to };
}

function daysInView(state: State): ISODate[] {
  const anchor = anchorOf(state);
  if (ui.range === 'day') return [anchor];
  if (ui.range === 'custom') {
    const { from, to } = customRange(state);
    const days: ISODate[] = [];
    for (let day = from; day <= to && days.length < MAX_RANGE_DAYS; day = addDays(day, 1)) days.push(day);
    return days;
  }
  if (ui.range === 'week') return Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(anchor), index));
  const first = parseDate(startOfMonth(anchor));
  const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return Array.from({ length }, (_, index) => addDays(toISODate(first), index));
}

function rangeLabel(state: State): string {
  const days = daysInView(state);
  const first = days[0] ?? state.meta.asOf;
  const last = days[days.length - 1] ?? first;
  if (ui.range === 'day') return formatDate(first, 'long');
  if (ui.range === 'month') return parseDate(first).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const label = `${formatDate(first, 'monthDayLong')} – ${formatDate(last, 'monthDayLong')}`;
  return ui.range === 'custom' ? `${label} · ${plural(days.length, 'day')}` : label;
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
      <section class="panel">
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

      <section class="panel">
        <header class="panel__head"><h2 class="panel__title">Availability</h2></header>
        <ul class="rows">
          ${state.poolSessions.map((session) => {
            const guests = poolGuests(state, day, session.id);
            const percent = Math.min(100, Math.round((guests / session.capacity) * 100));
            const held = exclusiveOverlapping(state, bookingWindow(state, session.id, day));
            return html`
              <li class="row">
                <span class="row__main">
                  <span class="row__title">${session.label}</span>
                  <span class="meter"><span style="width:${percent}%"></span></span>
                </span>
                <span class="small muted">${held ? 'Exclusive' : `${guests}/${session.capacity}`}</span>
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
  const percent = Math.min(100, Math.round((guests / session.capacity) * 100));
  const content = html`
    <span class="cal-pool__text">${guests}/${session.capacity}</span>
    <span class="meter meter--thin"><span style="width:${percent}%"></span></span>`;

  if (!ctx.can('bookings.write')) return html`<div class="cal-pool">${content}</div>`;
  return html`
    <button class="cal-pool" type="button" data-action="new-booking" data-product="${sessionId}" data-date="${day}"
      aria-label="${session.label} on ${formatDate(day)}: ${guests} of ${session.capacity} guests. Add booking">${content}</button>`;
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
    <div class="week-narrow">
      ${weekStrip(ctx, days, picked)}
      ${dayView(ctx, picked)}
    </div>

    <div class="panel panel--flush week-wide">
      <div class="table-scroll">
        <table class="calendar">
          <caption class="sr-only">Bookings by unit and day</caption>
          <thead>
            <tr>
              <th scope="col" class="calendar__corner"></th>
              ${days.map((day) => html`
                <th scope="col" class="${day === state.meta.asOf ? 'is-today' : ''}">
                  <span class="calendar__weekday">${formatDate(day, 'weekday')}</span>
                  <span class="calendar__day">${parseDate(day).getDate()}</span>
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
    <div class="panel panel--flush">
      <div class="month">
        ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => html`<span class="month__weekday">${label}</span>`)}
        ${Array.from({ length: leading }, () => html`<span class="month__cell month__cell--blank"></span>`)}
        ${days.map((day) => {
          const bookings = bookingsOn(state, day);
          const event = closingEvent(state, day);
          const guests = bookings.reduce((sum, booking) => sum + booking.adults + booking.kids, 0);
          const canBook = ctx.can('bookings.write') && !event;
          return html`
            <div class="month__cell ${day === state.meta.asOf ? 'is-today' : ''}">
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
 * The dates under the heading: a button that says what is on screen, and the
 * panel behind it for picking one day or a stretch of them.
 */
function datePicker(state: State, first: ISODate, last: ISODate): SafeHTML {
  const picking = ui.range === 'custom';
  return html`
    <div class="date-picker">
      <button class="date-picker__toggle" type="button" data-action="toggle-dates"
        aria-expanded="${flag(ui.datesOpen)}" aria-haspopup="dialog">
        <span>${rangeLabel(state)}</span>
        ${icon('chevronDown')}
      </button>

      ${ui.datesOpen ? html`
        <button class="date-picker__backdrop" type="button" data-action="close-dates" aria-label="Close the date picker"></button>
        <div class="date-picker__panel" role="dialog" aria-label="Pick dates">
          <label class="field">
            <span class="field__label">A day</span>
            <input class="input" type="date" data-input="jump" value="${first}">
          </label>
          <p class="small muted">Shows that ${ui.range === 'month' ? 'month' : ui.range === 'week' ? 'week' : 'day'}.</p>

          <div class="date-picker__or"><span>or</span></div>

          <div class="field">
            <span class="field__label">A range of days</span>
            <div class="date-range">
              <input class="input" type="date" data-input="range-from" value="${first}" aria-label="Range from">
              <span class="date-range__to" aria-hidden="true">–</span>
              <input class="input" type="date" data-input="range-to" value="${last}" aria-label="Range until">
            </div>
          </div>
          <p class="small muted">${picking ? `${plural(daysInView(state).length, 'day')} on screen.` : 'Shows exactly those days.'}</p>

          <div class="button-row button-row--end">
            <button class="btn btn--quiet btn--sm" type="button" data-action="close-dates">Done</button>
          </div>
        </div>` : ''}
    </div>`;
}

export function render(ctx: DeskContext): SafeHTML {
  const { state } = ctx;
  const days = daysInView(state);
  const first = days[0] ?? state.meta.asOf;
  const last = days[days.length - 1] ?? first;
  const isFollowingToday = ui.range === 'custom'
    ? days.includes(state.meta.asOf)
    : !ui.anchor || (ui.range === 'day' ? ui.anchor === state.meta.asOf : days.includes(state.meta.asOf));

  return html`
    ${pageHead({
      title: 'Calendar',
      subtitle: datePicker(state, first, last),
      actions: ctx.can('bookings.write') ? html`<button class="btn btn--primary" type="button" data-action="new-booking">${icon('plus')} New booking</button>` : '',
    })}

    <div class="calendar-bar">
      <div class="button-row">
        <button class="btn btn--secondary btn--icon" type="button" data-action="step" data-step="-1" aria-label="Previous ${ui.range}">${icon('chevronLeft')}</button>
        <button class="btn btn--secondary btn--sm ${isFollowingToday ? '' : 'is-off-today'}" type="button" data-action="go-today">Today</button>
        <button class="btn btn--secondary btn--icon" type="button" data-action="step" data-step="1" aria-label="Next ${ui.range}">${icon('chevronRight')}</button>
      </div>

      <div class="segmented" role="group" aria-label="Date range">
        ${RANGES.map((range) => html`
          <button class="segmented__option ${ui.range === range.id ? 'is-active' : ''}" type="button"
            data-action="set-range" data-range="${range.id}" aria-pressed="${flag(ui.range === range.id)}">${range.label}</button>`)}
      </div>

    </div>

    ${ui.range === 'custom' && days.length === MAX_RANGE_DAYS && customRange(state).to > (days[days.length - 1] ?? '') ? html`
      <p class="notice">Showing the first ${MAX_RANGE_DAYS} days of that range.</p>` : ''}

    ${ui.range === 'day' ? dayView(ctx, first) : ui.range === 'month' ? monthView(ctx, days) : weekView(ctx, days)}

    ${ui.range === 'month' ? '' : html`
      <ul class="legend">
        <li><span class="legend__swatch legend__swatch--room"></span>Rooms</li>
        <li><span class="legend__swatch legend__swatch--cottage"></span>Cottages</li>
        <li><span class="legend__swatch legend__swatch--exclusive"></span>Exclusive rental</li>
        <li><span class="legend__swatch legend__swatch--event"></span>Events</li>
        <li><span class="legend__swatch legend__swatch--hold"></span>On hold, downpayment due</li>
        <li><span class="legend__swatch legend__swatch--done"></span>Checked out</li>
      </ul>`}`;
}

export const inputs: HandlerMap = {
  /** One day from the picker: go there, keeping the shape unless a range was on screen. */
  jump: ({ el, ctx }) => {
    const { value } = el as HTMLInputElement;
    if (!value) return;
    if (ui.range === 'custom') ui.range = 'day';
    ui.anchor = value;
    ui.pickedDay = value;
    // One day is a finished choice; a range needs its other end, so that stays open.
    ui.datesOpen = false;
    ctx.redraw();
  },

  // The two ends of a hand-picked range, shown only in that view.
  'range-from': ({ el, ctx }) => {
    const { value } = el as HTMLInputElement;
    if (!value) return;
    const shown = daysInView(ctx.state);
    const end = ui.range === 'custom' ? customRange(ctx.state).to : shown[shown.length - 1] ?? value;
    ui.range = 'custom';
    ui.from = value;
    ui.to = end < value ? value : end;
    ui.pickedDay = null;
    ctx.redraw();
  },

  'range-to': ({ el, ctx }) => {
    const { value } = el as HTMLInputElement;
    if (!value) return;
    const shown = daysInView(ctx.state);
    const start = ui.range === 'custom' ? customRange(ctx.state).from : shown[0] ?? value;
    ui.range = 'custom';
    ui.from = value < start ? value : start;
    ui.to = value;
    ui.pickedDay = null;
    ctx.redraw();
  },
};

const isRange = (value: string | undefined): value is RangeId => RANGES.some((range) => range.id === value);

export const actions: HandlerMap = {
  'toggle-dates': ({ ctx }) => {
    ui.datesOpen = !ui.datesOpen;
    ctx.redraw();
  },

  'close-dates': ({ ctx }) => {
    ui.datesOpen = false;
    ctx.redraw();
  },

  'pick-day': ({ el, ctx }) => {
    ui.pickedDay = el.dataset.date ?? null;
    ctx.redraw();
  },

  'set-range': ({ el, ctx }) => {
    ui.datesOpen = false;
    const shown = daysInView(ctx.state);
    if (isRange(el.dataset.range)) ui.range = el.dataset.range;
    ui.pickedDay = null;
    // Range keeps whatever was on screen, so the switch changes nothing but the shape.
    if (ui.range === 'custom') {
      ui.from = shown[0] ?? anchorOf(ctx.state);
      ui.to = shown[shown.length - 1] ?? ui.from;
    }
    ctx.redraw();
  },

  step: ({ el, ctx }) => {
    ui.datesOpen = false;
    const direction = Number(el.dataset.step);
    const anchor = anchorOf(ctx.state);
    ui.pickedDay = null;
    if (ui.range === 'custom') {
      const { from, to } = customRange(ctx.state);
      const span = daysInView(ctx.state).length;
      ui.from = addDays(from, direction * span);
      ui.to = addDays(to, direction * span);
    } else if (ui.range === 'day') ui.anchor = addDays(anchor, direction);
    else if (ui.range === 'week') ui.anchor = addDays(startOfWeek(anchor), direction * 7);
    else {
      const first = parseDate(startOfMonth(anchor));
      ui.anchor = toISODate(new Date(first.getFullYear(), first.getMonth() + direction, 1));
    }
    ctx.redraw();
  },

  'go-today': ({ ctx }) => {
    ui.datesOpen = false;
    ui.anchor = null;
    ui.pickedDay = null;
    if (ui.range === 'custom') {
      ui.from = ctx.state.meta.asOf;
      ui.to = addDays(ctx.state.meta.asOf, 6);
    }
    ctx.redraw();
  },

  'open-day': ({ el, ctx }) => {
    ui.range = 'day';
    ui.anchor = el.dataset.date ?? null;
    ctx.redraw();
  },
};
