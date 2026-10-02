// Bookings: the calendar (the default) and the searchable, filterable list of
// every booking, one page with a switch between them.

import { flag, html, type SafeHTML } from '../../core/dom.js';
import { addDays, formatDate, peso, plural, timeOf } from '../../core/format.js';
import {
  STATUS_LABELS, findBooking, isActive, isEditable, productLabel,
} from '../../core/rules.js';
import type { Booking, BookingStatus, State } from '../../core/types.js';
import type { DeskContext, HandlerMap } from '../types.js';
import { kindDot, statusPill } from '../components/badges.js';
import { downloadBookingPdf } from '../components/booking-pdf.js';
import { icon } from '../components/icons.js';
import { emptyState, pageHead } from '../layout.js';
import * as calendar from './calendar.js';

interface Filters {
  query: string;
  /** 'open', 'all' or a booking status. */
  status: string;
  product: string;
  /** Stay dates to show, either end optional; '' means open-ended. */
  from: string;
  to: string;
}

const DEFAULT_FILTERS: Filters = { query: '', status: 'open', product: 'all', from: '', to: '' };
let filters = { ...DEFAULT_FILTERS };
/** Phones fold the pickers away behind a Filters button; desktop always shows them. */
let filtersOpen = false;

const OPEN_STATUSES: BookingStatus[] = ['hold', 'confirmed', 'checked_in'];

function matches(booking: Booking): boolean {
  const query = filters.query.trim().toLowerCase();
  if (query && !`${booking.guestName} ${booking.id}`.toLowerCase().includes(query)) return false;
  if (filters.status === 'open' && !OPEN_STATUSES.includes(booking.status)) return false;
  if (!['open', 'all'].includes(filters.status) && booking.status !== filters.status) return false;
  if (filters.product !== 'all' && booking.product !== filters.product) return false;
  if (filters.from && booking.date < filters.from) return false;
  if (filters.to && booking.date > filters.to) return false;
  return true;
}

type FilterKey = keyof Filters;

const option = (key: FilterKey, value: string, text: string): SafeHTML =>
  html`<option value="${value}" ${filters[key] === value ? 'selected' : ''}>${text}</option>`;

interface Choice {
  value: string;
  text: string;
}

/** How much of the guest list is filled in, for the Guests column. */
function namedSub(booking: Booking): string {
  const named = booking.guestList?.length ?? 0;
  const pax = booking.adults + booking.kids;
  if (!named) return 'no names yet';
  return named >= pax ? 'all named' : `${named} named`;
}

function filterBar(state: State): SafeHTML {
  const products: Choice[] = [
    { value: 'all', text: 'All bookings' },
    ...state.poolSessions.map((s) => ({ value: s.id, text: s.label })),
    ...state.units.map((u) => ({ value: u.id, text: u.name })),
    ...(state.exclusivePackages ?? []).map((p) => ({ value: p.id, text: `Exclusive ${p.session === 'day' ? 'day tour' : 'overnight'} · ${p.name}` })),
    { value: 'event', text: 'Events' },
  ];
  const statuses: Choice[] = [
    { value: 'open', text: 'Upcoming and in house' },
    { value: 'all', text: 'All statuses' },
    ...Object.entries(STATUS_LABELS).map(([value, text]) => ({ value, text })),
  ];
  const select = (key: FilterKey, label: string, items: Choice[]) => html`
    <label class="field">
      <span class="field__label">${label}</span>
      <select class="input" data-input="filter" name="${key}">
        ${items.map((item) => option(key, item.value, item.text))}
      </select>
    </label>`;

  const hidden = (['status', 'product', 'from', 'to'] as const).filter((key) => filters[key] !== DEFAULT_FILTERS[key]).length;

  return html`
    <div class="filters ${filtersOpen ? 'is-open' : ''}" data-part="Search and filters">
      <label class="field filters__search">
        <span class="field__label">Search</span>
        <input class="input" type="search" data-input="filter" name="query" value="${filters.query}" placeholder="Guest name or booking ID">
      </label>
      <button class="btn btn--secondary filters__toggle" type="button" data-action="toggle-filters" aria-expanded="${flag(filtersOpen)}">
        ${icon('filter')} Filters${hidden ? html` <span class="filters__count">${hidden}</span>` : ''}
      </button>
      ${select('status', 'Status', statuses)}
      ${select('product', 'Type', products)}
      <div class="field filters__range">
        <span class="field__label">Staying between</span>
        <div class="date-range">
          <input class="input" type="date" data-input="filter" name="from" value="${filters.from}" aria-label="Staying from" max="${filters.to || ''}">
          <span class="date-range__to" aria-hidden="true">–</span>
          <input class="input" type="date" data-input="filter" name="to" value="${filters.to}" aria-label="Staying until" min="${filters.from || ''}">
        </div>
      </div>
    </div>
    ${rangeShortcuts(state)}`;
}

/** " staying Sep 18 – Sep 24", for the page subtitle. */
function rangeSummary(): string {
  if (!filters.from && !filters.to) return '';
  if (filters.from && filters.to) {
    return filters.from === filters.to
      ? ` staying ${formatDate(filters.from)}`
      : ` staying ${formatDate(filters.from)} – ${formatDate(filters.to)}`;
  }
  return filters.from ? ` staying from ${formatDate(filters.from)}` : ` staying until ${formatDate(filters.to)}`;
}

/** One-tap windows, since typing two dates for "this week" is a chore. */
function rangeShortcuts(state: State): SafeHTML {
  const today = state.meta.asOf;
  const shortcuts: { label: string; from: string; to: string }[] = [
    { label: 'Today', from: today, to: today },
    { label: 'Next 7 days', from: today, to: addDays(today, 6) },
    { label: 'Next 30 days', from: today, to: addDays(today, 29) },
    { label: 'Past 30 days', from: addDays(today, -30), to: addDays(today, -1) },
  ];
  return html`
    <div class="chips">
      ${shortcuts.map((shortcut) => html`
        <button class="chip ${filters.from === shortcut.from && filters.to === shortcut.to ? 'is-active' : ''}" type="button"
          data-action="date-shortcut" data-from="${shortcut.from}" data-to="${shortcut.to}"
          aria-pressed="${flag(filters.from === shortcut.from && filters.to === shortcut.to)}">${shortcut.label}</button>`)}
    </div>`;
}

/** "Today", "Tomorrow", else "Sat, Sep 19", for the phone list's day headings. */
function dayHeading(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  if (date === addDays(today, -1)) return 'Yesterday';
  return formatDate(date);
}

/** What the right side of a phone row says about money. */
function moneyNote(booking: Booking): SafeHTML {
  if (isActive(booking) && booking.balance > 0) return html`<span class="booking-item__due">${peso(booking.balance)} due</span>`;
  if (isActive(booking)) return html`<span class="booking-item__paid">Paid</span>`;
  return html`<span class="booking-item__paid">${peso(booking.total)}</span>`;
}

/**
 * Phones: the same results as the table, grouped by day, one short tappable
 * row per booking. The booking panel it opens has Edit and the sheet download.
 */
function mobileList(state: State, results: Booking[]): SafeHTML {
  const sorted = [...results].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const days = new Map<string, Booking[]>();
  for (const booking of sorted) days.set(booking.date, [...(days.get(booking.date) ?? []), booking]);

  return html`
    <div class="booking-list">
      ${[...days].map(([date, bookings]) => html`
        <section class="booking-list__day" data-part="${dayHeading(date, state.meta.asOf)}">
          <h2 class="booking-list__heading">
            <span>${dayHeading(date, state.meta.asOf)}</span>
            <span class="booking-list__count">${plural(bookings.length, 'booking')}</span>
          </h2>
          <ul class="booking-list__items">
            ${bookings.map((b) => html`
              <li>
                <button class="booking-item" type="button" data-action="open-booking" data-id="${b.id}">
                  <span class="booking-item__main">
                    <strong class="booking-item__name">${b.guestName}</strong>
                    <span class="booking-item__meta">${kindDot(state, b.product)} ${timeOf(b.startsAt)} · ${b.adults + b.kids} pax · ${productLabel(state, b.product)}</span>
                  </span>
                  <span class="booking-item__side">
                    ${statusPill(b)}
                    ${moneyNote(b)}
                  </span>
                </button>
              </li>`)}
          </ul>
        </section>`)}
    </div>`;
}

type Mode = 'calendar' | 'list';
/** Which side of the page is showing. Kept while the app is open. */
let mode: Mode = 'calendar';

function modeSwitch(): SafeHTML {
  const options: { id: Mode; label: string }[] = [{ id: 'calendar', label: 'Calendar' }, { id: 'list', label: 'List' }];
  return html`
    <div class="segmented" role="group" aria-label="Show bookings as">
      ${options.map((option) => html`
        <button class="segmented__option ${mode === option.id ? 'is-active' : ''}" type="button"
          data-action="set-mode" data-mode="${option.id}" aria-pressed="${flag(mode === option.id)}">${option.label}</button>`)}
    </div>`;
}

/** Opens the list already narrowed, for links from elsewhere such as the dashboard's cards. */
export function showBookings(narrowed: Partial<Filters>): void {
  filters = { ...DEFAULT_FILTERS, ...narrowed };
  mode = 'list';
  location.hash = '#/bookings';
}

export function render(ctx: DeskContext): SafeHTML {
  if (mode === 'calendar') return calendar.render(ctx, modeSwitch());
  const { state } = ctx;
  const results = state.bookings.filter(matches);
  const total = results.filter(isActive).reduce((sum, b) => sum + b.total, 0);
  const due = results.filter((b) => isActive(b) && b.status !== 'checked_out').reduce((sum, b) => sum + b.balance, 0);
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return html`
    ${pageHead({
      title: 'Bookings',
      subtitle: `${plural(results.length, 'booking')}${rangeSummary()} · ${peso(total)} total · ${peso(due)} still due`,
      actions: html`
        ${modeSwitch()}
        ${ctx.can('bookings.write') ? html`
          <button class="btn btn--primary" type="button" data-action="new-booking">${icon('plus')} New booking</button>` : ''}`,
    })}

    ${filterBar(state)}
    ${isFiltered ? html`<button class="btn btn--quiet btn--sm filters__clear" type="button" data-action="clear-filters">Clear filters</button>` : ''}

    ${results.length ? mobileList(state, results) : ''}

    <div class="panel panel--flush bookings-table" data-part="The list">
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
                <th scope="col"><span class="sr-only">Actions</span></th>
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
                  <td class="num">${b.adults + b.kids}<span class="data-table__sub">${namedSub(b)}</span></td>
                  <td class="num">${peso(b.total)}</td>
                  <td class="num ${b.balance > 0 && isActive(b) ? 'is-due' : ''}">${peso(b.balance)}</td>
                  <td>${statusPill(b)}</td>
                  <td class="data-table__actions">
                    ${ctx.can('bookings.write') && isEditable(state, b) ? html`
                      <button class="btn btn--quiet btn--sm" type="button" data-action="edit-booking-row" data-id="${b.id}" title="Edit this booking">Edit</button>` : ''}
                    <button class="btn btn--quiet btn--sm" type="button" data-action="download-sheet" data-id="${b.id}" title="Download the registration sheet">${icon('download')} Sheet</button>
                  </td>
                </tr>`)}
            </tbody>
          </table>
        </div>` : emptyState('No bookings match', 'Try a different search or clear the filters.')}
    </div>`;
}

export const inputs: HandlerMap = {
  filter: ({ el, ctx }) => {
    const { name, value } = el as HTMLInputElement | HTMLSelectElement;
    if (!(name in filters)) return;
    filters = { ...filters, [name]: value };
    ctx.redraw();
  },
};

export const actions: HandlerMap = {
  ...calendar.actions,

  'set-mode': ({ el, ctx }) => {
    mode = el.dataset.mode === 'list' ? 'list' : 'calendar';
    ctx.redraw();
  },

  'toggle-filters': ({ ctx }) => {
    filtersOpen = !filtersOpen;
    ctx.redraw();
  },

  'date-shortcut': ({ el, ctx }) => {
    const { from = '', to = '' } = el.dataset;
    // Tapping the chip that is already on clears it again.
    const same = filters.from === from && filters.to === to;
    filters = { ...filters, from: same ? '' : from, to: same ? '' : to };
    ctx.redraw();
  },

  'edit-booking-row': ({ el, ctx }) => {
    if (el.dataset.id) ctx.editBooking(el.dataset.id);
  },

  'download-sheet': ({ el, ctx }) => {
    const booking = el.dataset.id ? findBooking(ctx.state, el.dataset.id) : null;
    if (!booking) return;
    downloadBookingPdf(ctx.state, booking);
    ctx.toast(`Registration sheet downloaded · ${booking.guestName}`);
  },

  'clear-filters': ({ ctx }) => {
    filters = { ...DEFAULT_FILTERS };
    ctx.redraw();
  },
};
