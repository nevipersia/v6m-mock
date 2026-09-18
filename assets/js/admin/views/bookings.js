// Bookings: searchable, filterable list of every booking in the data period.

import { html } from '../../core/dom.js';
import { formatDate, peso, plural, timeOf } from '../../core/format.js';
import {
  STATUS_LABELS, isActive, periodDays, productLabel,
} from '../../core/rules.js';
import { kindDot, statusPill } from '../components/badges.js';
import { icon } from '../components/icons.js';
import { emptyState, pageHead } from '../layout.js';

const DEFAULT_FILTERS = { query: '', status: 'open', product: 'all', date: 'all' };
let filters = { ...DEFAULT_FILTERS };

const OPEN_STATUSES = ['hold', 'confirmed', 'checked_in'];

function matches(booking) {
  const query = filters.query.trim().toLowerCase();
  if (query && !`${booking.guestName} ${booking.id}`.toLowerCase().includes(query)) return false;
  if (filters.status === 'open' && !OPEN_STATUSES.includes(booking.status)) return false;
  if (!['open', 'all'].includes(filters.status) && booking.status !== filters.status) return false;
  if (filters.product !== 'all' && booking.product !== filters.product) return false;
  if (filters.date !== 'all' && booking.date !== filters.date) return false;
  return true;
}

const option = (key, value, text) =>
  html`<option value="${value}" ${filters[key] === value ? 'selected' : ''}>${text}</option>`;

function filterBar(state) {
  const products = [
    { value: 'all', text: 'All bookings' },
    ...state.poolSessions.map((s) => ({ value: s.id, text: s.label })),
    ...state.units.map((u) => ({ value: u.id, text: u.name })),
    { value: 'event', text: 'Events' },
  ];
  const statuses = [
    { value: 'open', text: 'Upcoming and in house' },
    { value: 'all', text: 'All statuses' },
    ...Object.entries(STATUS_LABELS).map(([value, text]) => ({ value, text })),
  ];
  const dates = [{ value: 'all', text: 'All dates' }, ...periodDays(state).map((day) => ({ value: day, text: formatDate(day) }))];

  const select = (key, label, items) => html`
    <label class="field">
      <span class="field__label">${label}</span>
      <select class="input" data-input="filter" name="${key}">
        ${items.map((item) => option(key, item.value, item.text))}
      </select>
    </label>`;

  return html`
    <div class="filters">
      <label class="field filters__search">
        <span class="field__label">Search</span>
        <input class="input" type="search" data-input="filter" name="query" value="${filters.query}" placeholder="Guest name or booking ID">
      </label>
      ${select('status', 'Status', statuses)}
      ${select('product', 'Type', products)}
      ${select('date', 'Date', dates)}
    </div>`;
}

export function render(ctx) {
  const { state } = ctx;
  const results = state.bookings.filter(matches);
  const total = results.filter(isActive).reduce((sum, b) => sum + b.total, 0);
  const due = results.filter((b) => isActive(b) && b.status !== 'checked_out').reduce((sum, b) => sum + b.balance, 0);
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return html`
    ${pageHead({
      title: 'Bookings',
      subtitle: `${plural(results.length, 'booking')} · ${peso(total)} total · ${peso(due)} still due`,
      actions: ctx.can('bookings.write') ? html`<button class="btn btn--primary" type="button" data-action="new-booking">${icon('plus')} New booking</button>` : '',
    })}

    ${filterBar(state)}
    ${isFiltered ? html`<button class="btn btn--quiet btn--sm filters__clear" type="button" data-action="clear-filters">Clear filters</button>` : ''}

    <div class="panel panel--flush">
      ${results.length ? html`
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">Guest</th>
                <th scope="col">Booking</th>
                <th scope="col">Date</th>
                <th scope="col" class="num">Guests</th>
                <th scope="col" class="num">Total</th>
                <th scope="col" class="num">Balance</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              ${results.map((b) => html`
                <tr>
                  <td>
                    <button class="link-button" type="button" data-action="open-booking" data-id="${b.id}">${b.guestName}</button>
                    <span class="data-table__sub mono">${b.id}</span>
                  </td>
                  <td><span class="inline-kind">${kindDot(state, b.product)} ${productLabel(state, b.product)}</span></td>
                  <td>${formatDate(b.date)}<span class="data-table__sub">${timeOf(b.startsAt)}</span></td>
                  <td class="num">${b.adults + b.kids}</td>
                  <td class="num">${peso(b.total)}</td>
                  <td class="num ${b.balance > 0 && isActive(b) ? 'is-due' : ''}">${peso(b.balance)}</td>
                  <td>${statusPill(b)}</td>
                </tr>`)}
            </tbody>
          </table>
        </div>` : emptyState('No bookings match', 'Try a different search or clear the filters.')}
    </div>`;
}

export const inputs = {
  filter: ({ el, ctx }) => {
    filters = { ...filters, [el.name]: el.value };
    ctx.redraw();
  },
};

export const actions = {
  'clear-filters': ({ ctx }) => {
    filters = { ...DEFAULT_FILTERS };
    ctx.redraw();
  },
};
