// Grid of pool slots and room/cottage availability for the data period.

import { html, render } from '../core/dom.js';
import { formatDate, parseDate } from '../core/format.js';
import { closingEvent, periodDays, poolSlotsLeft, unitBookingOn } from '../core/rules.js';

const FEW_SLOTS = 30;

function poolCell(state, session, day) {
  const left = poolSlotsLeft(state, day, session.id);
  if (left === 0) return html`<span class="slot slot--booked">Full</span>`;
  const tone = left < FEW_SLOTS ? 'few' : 'open';
  return html`
    <button class="slot slot--${tone}" type="button" data-check-rate data-product="${session.id}" data-date="${day}"
      aria-label="${session.label} on ${formatDate(day)}: ${left} slots left">${left} left</button>`;
}

function unitCell(state, unit, day) {
  if (unitBookingOn(state, unit.id, day)) return html`<span class="slot slot--booked">Booked</span>`;
  return html`
    <button class="slot slot--open" type="button" data-check-rate data-product="${unit.id}" data-date="${day}"
      aria-label="${unit.name} on ${formatDate(day)}: open">Open</button>`;
}

export function renderWeekAvailability(container, lead, state) {
  const days = periodDays(state);
  lead.textContent = `Open slots from ${formatDate(days[0], 'monthDayLong')} to ${formatDate(days[days.length - 1], 'monthDayLong')}. Tap one to see your rate.`;

  const rows = [
    ...state.poolSessions.map((session) => ({ label: session.label, cell: (day) => poolCell(state, session, day) })),
    ...state.units.map((unit) => ({ label: unit.name, cell: (day) => unitCell(state, unit, day) })),
  ];

  const header = days.map((day) => html`
    <th scope="col" class="${day === state.meta.asOf ? 'is-today' : ''}">
      ${formatDate(day, 'weekday')} ${parseDate(day).getDate()}${day === state.meta.asOf ? ' · today' : ''}
    </th>`);

  const body = rows.map((row) => html`
    <tr>
      <th scope="row">${row.label}</th>
      ${days.map((day) => html`<td>${closingEvent(state, day) ? html`<span class="slot slot--event">Event</span>` : row.cell(day)}</td>`)}
    </tr>`);

  render(container, html`
    <table class="week__table">
      <caption class="sr-only">Availability by day</caption>
      <thead><tr><td></td>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>`);
}
