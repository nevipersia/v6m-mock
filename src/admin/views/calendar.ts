// Calendar with day, week and month views. Navigation is free: staff can step
// back through past dates or jump ahead, not just the sample data week.

import { html, type SafeHTML, type TemplateValue } from '../../core/dom.js';
import { addDays, formatDate, parseDate, peso, plural, timeOf, toISODate } from '../../core/format.js';
import {
  closingEvent, findSession, isActive, poolGuests, productLabel, unitBookingOn,
} from '../../core/rules.js';
import type { ISODate, State, Unit } from '../../core/types.js';
import type { DeskContext, HandlerMap } from '../types.js';
import { paymentPill } from '../components/badges.js';
import { icon } from '../components/icons.js';
import { emptyState, pageHead } from '../layout.js';

type RangeId = 'day' | 'week' | 'month';

const RANGES: { id: RangeId; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

// Anchor is the date the view is centred on; null means "follow the demo date".
const ui: { range: RangeId; anchor: ISODate | null } = { range: 'week', anchor: null };

const anchorOf = (state: State): ISODate => ui.anchor ?? state.meta.asOf;

const startOfWeek = (date: ISODate): ISODate => addDays(date, -((parseDate(date).getDay() + 6) % 7)); // Monday
const startOfMonth = (date: ISODate): ISODate => `${date.slice(0, 8)}01`;

function daysInView(state: State): ISODate[] {
  const anchor = anchorOf(state);
  if (ui.range === 'day') return [anchor];
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
  return `${formatDate(first, 'monthDayLong')} – ${formatDate(last, 'monthDayLong')}`;
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
            return html`
              <li class="row">
                <span class="row__main">
                  <span class="row__title">${session.label} pool</span>
                  <span class="meter"><span style="width:${percent}%"></span></span>
                </span>
                <span class="small muted">${guests}/${session.capacity}</span>
              </li>`;
          })}
          ${state.units.map((unit) => {
            const booking = unitBookingOn(state, unit.id, day);
            return html`
              <li class="row">
                <span class="row__main"><span class="row__title">${unit.name}</span></span>
                ${booking
                  ? html`<button class="btn btn--quiet btn--sm" type="button" data-action="open-booking" data-id="${booking.id}">${shortName(booking.guestName)}</button>`
                  : event || unit.channel === 'airbnb' || !ctx.can('bookings.write')
                    ? html`<span class="small muted">${event ? 'Closed' : unit.channel === 'airbnb' ? 'Airbnb' : 'Open'}</span>`
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
  if (unit.channel === 'airbnb') return html`<span class="cal-empty">Airbnb</span>`;
  if (!ctx.can('bookings.write')) return html`<span class="cal-empty"></span>`;
  return html`
    <button class="cal-add" type="button" data-action="new-booking" data-product="${unit.id}" data-date="${day}"
      aria-label="Book ${unit.name} on ${formatDate(day)}">${icon('plus')}</button>`;
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

function weekView(ctx: DeskContext, days: ISODate[]): SafeHTML {
  const { state } = ctx;
  const rows: GridRow[] = [
    { label: 'Events', cell: (day) => eventCell(ctx, day), alwaysShow: true },
    ...state.poolSessions.map((session): GridRow => ({ label: `${session.label} pool`, cell: (day) => poolCell(ctx, session.id, day) })),
    ...state.units.map((unit): GridRow => ({ label: unit.name, cell: (day) => unitCell(ctx, unit, day) })),
  ];

  return html`
    <div class="panel panel--flush">
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
                <button class="month__summary" type="button" data-action="open-day" data-date="${day}">
                  <strong>${plural(bookings.length, 'booking')}</strong>
                  <span class="small muted">${plural(guests, 'guest')}</span>
                </button>` : ''}
            </div>`;
        })}
      </div>
    </div>`;
}

export function render(ctx: DeskContext): SafeHTML {
  const { state } = ctx;
  const days = daysInView(state);
  const first = days[0] ?? state.meta.asOf;
  const isFollowingToday = !ui.anchor || (ui.range === 'day' ? ui.anchor === state.meta.asOf : days.includes(state.meta.asOf));

  return html`
    ${pageHead({
      title: 'Calendar',
      subtitle: rangeLabel(state),
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
            data-action="set-range" data-range="${range.id}" aria-pressed="${ui.range === range.id}">${range.label}</button>`)}
      </div>

      <label class="field calendar-bar__jump">
        <span class="sr-only">Jump to date</span>
        <input class="input" type="date" data-input="jump" value="${first}">
      </label>
    </div>

    ${ui.range === 'day' ? dayView(ctx, first) : ui.range === 'week' ? weekView(ctx, days) : monthView(ctx, days)}

    ${ui.range === 'month' ? '' : html`
      <ul class="legend">
        <li><span class="legend__swatch legend__swatch--room"></span>Rooms</li>
        <li><span class="legend__swatch legend__swatch--cottage"></span>Cottages</li>
        <li><span class="legend__swatch legend__swatch--villa"></span>Villa (Airbnb)</li>
        <li><span class="legend__swatch legend__swatch--event"></span>Events</li>
        <li><span class="legend__swatch legend__swatch--hold"></span>On hold, downpayment due</li>
        <li><span class="legend__swatch legend__swatch--done"></span>Checked out</li>
      </ul>`}`;
}

export const inputs: HandlerMap = {
  jump: ({ el, ctx }) => {
    const { value } = el as HTMLInputElement;
    if (!value) return;
    ui.anchor = value;
    ctx.redraw();
  },
};

const isRange = (value: string | undefined): value is RangeId => RANGES.some((range) => range.id === value);

export const actions: HandlerMap = {
  'set-range': ({ el, ctx }) => {
    if (isRange(el.dataset.range)) ui.range = el.dataset.range;
    ctx.redraw();
  },

  step: ({ el, ctx }) => {
    const direction = Number(el.dataset.step);
    const anchor = anchorOf(ctx.state);
    if (ui.range === 'day') ui.anchor = addDays(anchor, direction);
    else if (ui.range === 'week') ui.anchor = addDays(startOfWeek(anchor), direction * 7);
    else {
      const first = parseDate(startOfMonth(anchor));
      ui.anchor = toISODate(new Date(first.getFullYear(), first.getMonth() + direction, 1));
    }
    ctx.redraw();
  },

  'go-today': ({ ctx }) => {
    ui.anchor = null;
    ctx.redraw();
  },

  'open-day': ({ el, ctx }) => {
    ui.range = 'day';
    ui.anchor = el.dataset.date ?? null;
    ctx.redraw();
  },
};
