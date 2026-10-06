// Bookings: the calendar (the default) and a list of the same days, one page
// with a switch between them. Both share the calendar's month, week or day.

import { flag, html, type SafeHTML } from '../../core/dom.js';
import { addDays, formatDate, peso, plural, timeOf } from '../../core/format.js';
import { isActive, productLabel } from '../../core/rules.js';
import type { Booking, State } from '../../core/types.js';
import type { DeskContext, HandlerMap } from '../types.js';
import { kindDot, statusPill } from '../components/badges.js';
import { icon } from '../components/icons.js';
import { emptyState, pageHead } from '../layout.js';
import * as calendar from './calendar.js';

/** The search box: a guest's name or a booking ID, within the days on screen. */
let query = '';

/** Rows the table shows before Show all. */
const LIST_SHOWN = 15;
/** Opened out with Show all; folds again whenever the days on screen change. */
let listExpanded = false;
let listKey = '';
/** The desk's redraw, kept from the last render for the Esc key. */
let redrawList: (() => void) | null = null;

/** Folds the whole list back to its first rows and returns to the top of the page. */
function foldList(): void {
  listExpanded = false;
  redrawList?.();
  window.scrollTo({ top: 0 });
}

// Esc folds an opened list, unless Esc is busy closing something else first
// (a pop-up, the booking panel, the notifications) or someone is typing.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || mode !== 'list' || !listExpanded || !document.querySelector('.list-fold')) return;
  const { target } = event;
  if (target instanceof Element && target.closest('input, textarea, select, dialog')) return;
  if (document.querySelector('dialog[open], .notif__panel')) return;
  if (document.body.classList.contains('has-drawer')) return;
  foldList();
});

function matches(booking: Booking): boolean {
  const words = query.trim().toLowerCase();
  return !words || `${booking.guestName} ${booking.id}`.toLowerCase().includes(words);
}

/** How much of the guest list is filled in, for the Guests column. */
function namedSub(booking: Booking): string {
  const named = booking.guestList?.length ?? 0;
  const pax = booking.adults + booking.kids;
  if (!named) return 'no names yet';
  return named >= pax ? 'all named' : `${named} named`;
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
/** Which side of the page is showing. List lasts only while staff stay on Bookings. */
let mode: Mode = 'calendar';

// Coming to Bookings from another page always starts on the calendar.
window.addEventListener('hashchange', (event) => {
  const onBookings = (url: string) => new URL(url).hash.replace(/^#\/?/, '').split('/')[0] === 'bookings';
  if (onBookings(event.newURL) && !onBookings(event.oldURL)) mode = 'calendar';
});

function modeSwitch(): SafeHTML {
  const options: { id: Mode; label: string }[] = [{ id: 'calendar', label: 'Calendar' }, { id: 'list', label: 'List' }];
  return html`
    <div class="segmented" role="group" aria-label="Show bookings as">
      ${options.map((option) => html`
        <button class="segmented__option ${mode === option.id ? 'is-active' : ''}" type="button"
          data-action="set-mode" data-mode="${option.id}" aria-pressed="${flag(mode === option.id)}">${option.label}</button>`)}
    </div>`;
}

/** Opens the calendar on one day, for links from elsewhere such as the dashboard's cards. */
export function showBookingsOn(day: string): void {
  calendar.showDay(day);
  query = '';
  mode = 'calendar';
  location.hash = '#/bookings';
}

export function render(ctx: DeskContext): SafeHTML {
  if (mode === 'calendar') return calendar.render(ctx, modeSwitch());
  const { state } = ctx;
  const days = calendar.shownDays(state);
  const first = days[0] ?? state.meta.asOf;
  const last = days[days.length - 1] ?? first;
  const results = state.bookings
    .filter((b) => b.date >= first && b.date <= last && matches(b))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const key = calendar.enterKey(state);
  if (key !== listKey) {
    listKey = key;
    listExpanded = false;
  }
  const rows = listExpanded || query.trim() ? results : results.slice(0, LIST_SHOWN);
  const capped = results.length > LIST_SHOWN && !query.trim();
  redrawList = ctx.redraw;
  const search = html`
    <label class="list-search">
      ${icon('search')}
      <input class="input" type="search" data-input="search" name="query" value="${query}"
        placeholder="Guest or booking ID" aria-label="Search guest name or booking ID">
    </label>`;

  return html`
    ${pageHead({
      title: 'Bookings',
      actions: html`
        ${modeSwitch()}
        ${ctx.can('bookings.write') ? html`
          <button class="btn btn--primary" type="button" data-action="new-booking" data-date="${days.length === 1 ? first : ''}">${icon('plus')} New booking</button>` : ''}`,
    })}

    <div class="list-body" data-enter="bookings|list:${calendar.enterKey(state)}" data-motion="${calendar.enterMotion()}">
    ${calendar.navBar(state, search)}

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
                <th scope="col" class="data-table__go"><span class="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((b) => html`
                <tr class="data-table__row ${b.date === state.meta.asOf ? 'is-today' : ''}" data-action="open-booking" data-id="${b.id}">
                  <td>
                    <button class="link-button" type="button" data-action="open-booking" data-id="${b.id}">${b.guestName}</button>
                    <span class="data-table__sub mono">${b.id}</span>
                  </td>
                  <td><span class="inline-kind">${kindDot(state, b.product)} ${productLabel(state, b.product)}</span></td>
                  <td>${b.date === state.meta.asOf ? html`<span class="data-table__today">Today</span>` : formatDate(b.date)}<span class="data-table__sub">${timeOf(b.startsAt)}</span></td>
                  <td class="num">${b.adults + b.kids}<span class="data-table__sub">${namedSub(b)}</span></td>
                  <td class="num">${peso(b.total)}</td>
                  <td class="num ${b.balance > 0 && isActive(b) ? 'is-due' : ''}">${peso(b.balance)}</td>
                  <td>${statusPill(b)}</td>
                  <td class="data-table__go" aria-hidden="true">${icon('chevronRight')}</td>
                </tr>`)}
              ${capped && !listExpanded ? html`
                <tr class="fin-more">
                  <td colspan="8">
                    <button class="btn btn--quiet btn--sm" type="button" data-action="list-show-all" aria-expanded="false">
                      ${icon('chevronDown')} Show all ${results.length} · ${results.length - LIST_SHOWN} more
                    </button>
                  </td>
                </tr>` : ''}
            </tbody>
          </table>
        </div>` : query.trim()
          ? emptyState('No bookings match', `Nobody called "${query.trim()}" in ${calendar.shownLabel(state)}.`)
          : emptyState('Nothing booked', `${calendar.shownLabel(state)} has no bookings.`)}
    </div>
    ${capped && listExpanded ? html`
      <div class="list-fold">
        <button class="list-fold__button" type="button" data-action="list-show-all" aria-expanded="true"
          aria-label="Show fewer (Esc). All ${results.length} bookings are showing." title="Show fewer (Esc)">
          ${icon('chevronUp')}<span class="list-fold__label">Show fewer <kbd>Esc</kbd></span>
        </button>
      </div>` : ''}
    </div>

    ${calendar.pickerIfOpen(state)}`;
}

export const inputs: HandlerMap = {
  search: ({ el, ctx }) => {
    query = (el as HTMLInputElement).value;
    ctx.redraw();
  },
};

export const actions: HandlerMap = {
  ...calendar.actions,

  'list-show-all': ({ ctx }) => {
    if (listExpanded) {
      // Folding back: return to the top rather than leave the reader below the list.
      foldList();
      return;
    }
    listExpanded = true;
    ctx.redraw();
  },

  'set-mode': ({ el, ctx }) => {
    mode = el.dataset.mode === 'list' ? 'list' : 'calendar';
    ctx.redraw();
  },
};
