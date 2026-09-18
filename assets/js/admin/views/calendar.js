// Calendar: one row per pool session and unit, one column per day.

import { html } from '../../core/dom.js';
import { formatDate, parseDate } from '../../core/format.js';
import {
  closingEvent, findSession, periodDays, poolGuests, unitBookingOn,
} from '../../core/rules.js';
import { icon } from '../components/icons.js';
import { pageHead } from '../layout.js';

const shortName = (name) => {
  const [first, ...rest] = name.split(' ');
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
};

function poolCell(ctx, sessionId, day) {
  const session = findSession(ctx.state, sessionId);
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

function unitCell(ctx, unit, day) {
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

function eventCell(ctx, day) {
  const event = ctx.state.events.find((item) => item.date === day);
  if (!event) return html`<span class="cal-empty"></span>`;
  const label = event.title;
  if (event.bookingId) {
    return html`<button class="cal-chip cal-chip--event" type="button" data-action="open-booking" data-id="${event.bookingId}" title="${label}">${label}</button>`;
  }
  return html`<span class="cal-chip cal-chip--event ${event.blocksCalendar ? '' : 'cal-chip--hold'}" title="${label}">${label}</span>`;
}

export function render(ctx) {
  const { state } = ctx;
  const days = periodDays(state);

  const rows = [
    { label: 'Events', cell: (day) => eventCell(ctx, day), alwaysShow: true },
    ...state.poolSessions.map((session) => ({ label: `${session.label} pool`, cell: (day) => poolCell(ctx, session.id, day) })),
    ...state.units.map((unit) => ({ label: unit.name, cell: (day) => unitCell(ctx, unit, day) })),
  ];

  return html`
    ${pageHead({
      title: 'Calendar',
      subtitle: `${formatDate(days[0], 'monthDayLong')} – ${formatDate(days[days.length - 1], 'monthDayLong')}`,
      actions: ctx.can('bookings.write') ? html`<button class="btn btn--primary" type="button" data-action="new-booking">${icon('plus')} New booking</button>` : '',
    })}

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
    </div>

    <ul class="legend">
      <li><span class="legend__swatch legend__swatch--room"></span>Rooms</li>
      <li><span class="legend__swatch legend__swatch--cottage"></span>Cottages</li>
      <li><span class="legend__swatch legend__swatch--villa"></span>Villa (Airbnb)</li>
      <li><span class="legend__swatch legend__swatch--event"></span>Events</li>
      <li><span class="legend__swatch legend__swatch--hold"></span>On hold, no deposit</li>
      <li><span class="legend__swatch legend__swatch--done"></span>Checked out</li>
    </ul>`;
}
