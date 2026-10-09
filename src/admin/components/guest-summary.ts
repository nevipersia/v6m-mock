// Side panel behind the dashboard's Arriving today and In house cards: who is
// coming or here, how many people that is, what they booked and what is still
// to collect. Each guest opens their booking, where check-in and check-out are.

import { html, type SafeHTML } from '../../core/dom.js';
import { peso, plural, timeOf } from '../../core/format.js';
import { isActive, productLabel } from '../../core/rules.js';
import type { Booking, State } from '../../core/types.js';
import type { DeskContext, DrawerContent } from '../types.js';
import { kindDot, paymentPill } from './badges.js';

export type GuestGroup = 'arriving' | 'inhouse';

/** Today's bookings that have not checked in yet (not private-event bookings). */
export const arrivingToday = (state: State): Booking[] =>
  state.bookings
    .filter((b) => b.date === state.meta.asOf && isActive(b) && b.product !== 'event' && ['hold', 'confirmed'].includes(b.status))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

export const inHouseNow = (state: State): Booking[] =>
  state.bookings
    .filter((b) => b.status === 'checked_in')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

export const headcount = (bookings: Booking[]): number => bookings.reduce((sum, b) => sum + b.adults + b.kids, 0);

const COPY: Record<GuestGroup, { title: string; empty: string; owed: string }> = {
  arriving: { title: 'Arriving today', empty: 'No more arrivals today.', owed: 'To collect on arrival' },
  inhouse: { title: 'In house', empty: 'Nobody is checked in right now.', owed: 'Still owed by guests here' },
};

interface ProductLine {
  product: string;
  bookings: number;
  guests: number;
  /** Earliest start, so the desk knows when the first of them turns up. */
  first: string;
}

function byProduct(bookings: Booking[]): ProductLine[] {
  const lines = new Map<string, ProductLine>();
  bookings.forEach((b) => {
    const line = lines.get(b.product) ?? { product: b.product, bookings: 0, guests: 0, first: b.startsAt };
    line.bookings += 1;
    line.guests += b.adults + b.kids;
    if (b.startsAt < line.first) line.first = b.startsAt;
    lines.set(b.product, line);
  });
  return [...lines.values()].sort((a, b) => a.first.localeCompare(b.first));
}

function figure(label: string, value: string, detail = ''): SafeHTML {
  return html`
    <div class="guest-summary__figure">
      <span class="guest-summary__label">${label}</span>
      <span class="guest-summary__value">${value}</span>
      ${detail ? html`<span class="small muted">${detail}</span>` : ''}
    </div>`;
}

function summary(ctx: DeskContext, group: GuestGroup): SafeHTML {
  const { state } = ctx;
  const bookings = group === 'arriving' ? arrivingToday(state) : inHouseNow(state);
  const copy = COPY[group];
  if (!bookings.length) return html`<p class="muted">${copy.empty}</p>`;

  const adults = bookings.reduce((sum, b) => sum + b.adults, 0);
  const kids = bookings.reduce((sum, b) => sum + b.kids, 0);
  const owing = bookings.filter((b) => b.balance > 0);
  const owed = owing.reduce((sum, b) => sum + b.balance, 0);

  return html`
    <div class="guest-summary">
      <div class="guest-summary__figures">
        ${figure('Bookings', String(bookings.length))}
        ${figure('Guests', String(adults + kids), `${plural(adults, 'adult')} · ${plural(kids, 'kid')}`)}
        ${figure(copy.owed, peso(owed), owed ? `On ${plural(owing.length, 'booking')}` : 'All paid')}
      </div>

      <h3 class="guest-summary__heading">By booking type</h3>
      <ul class="guest-summary__lines">
        ${byProduct(bookings).map((line) => html`
          <li class="guest-summary__line">
            ${kindDot(state, line.product)}
            <span class="guest-summary__line-name">${productLabel(state, line.product)}</span>
            <span class="small muted">${plural(line.bookings, 'booking')} · ${plural(line.guests, 'guest')}${group === 'arriving' ? ` · from ${timeOf(line.first)}` : ''}</span>
          </li>`)}
      </ul>

      <h3 class="guest-summary__heading">${group === 'arriving' ? 'Guests, in arrival order' : 'Guests'}</h3>
      <ul class="rows">
        ${bookings.map((b) => html`
          <li class="row">
            ${kindDot(state, b.product)}
            <button class="row__main" type="button" data-action="open-booking" data-id="${b.id}">
              <span class="row__title">${b.guestName}</span>
              <span class="row__meta">${productLabel(state, b.product)} · ${timeOf(b.startsAt)} · ${plural(b.adults + b.kids, 'guest')}</span>
            </button>
            <span class="row__badges">${paymentPill(b)}</span>
          </li>`)}
      </ul>
      <p class="small muted">Open a guest to ${group === 'arriving' ? 'check them in' : 'check them out'}.</p>
    </div>`;
}

export function createGuestSummary(group: GuestGroup): DrawerContent {
  return {
    live: true,
    title: COPY[group].title,
    render: (ctx) => summary(ctx, group),
    actions: {
      'open-booking': ({ el, ctx }) => ctx.openBooking(el.dataset.id ?? ''),
    },
  };
}
