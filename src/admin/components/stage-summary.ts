// Side panel behind each stage card on the Events page: how many events sit at
// that stage, for how many guests, what they are worth and what is still owed,
// then the events themselves. Each opens its booking, or can be booked.

import { bookEvent } from '../../core/actions.js';
import { html, type SafeHTML } from '../../core/dom.js';
import { formatDate, peso, plural } from '../../core/format.js';
import { STAGE_LABELS, findBooking, findPackage } from '../../core/rules.js';
import type { EventStage, ResortEvent, State } from '../../core/types.js';
import type { DeskContext, DrawerContent } from '../types.js';
import { paymentPill } from './badges.js';

export const eventsAt = (state: State, stage: EventStage): ResortEvent[] =>
  state.events.filter((event) => event.stage === stage).sort((a, b) => a.date.localeCompare(b.date));

/** The money side of a stage: worth, paid and owed across its bookings. */
export function stageMoney(state: State, events: ResortEvent[]): { worth: number; paid: number; owed: number } {
  return events.reduce((sum, event) => {
    const booking = findBooking(state, event.bookingId);
    return {
      worth: sum.worth + (booking?.total ?? event.total),
      paid: sum.paid + (booking?.paid ?? 0),
      owed: sum.owed + (booking ? booking.balance : event.total),
    };
  }, { worth: 0, paid: 0, owed: 0 });
}

const EMPTY: Record<EventStage, string> = {
  inquiry: 'No inquiries waiting.',
  reserved: 'Nothing reserved right now.',
  paid: 'No events paid in full yet.',
  done: 'No events done yet.',
};

function figure(label: string, value: string, detail = ''): SafeHTML {
  return html`
    <div class="guest-summary__figure">
      <span class="guest-summary__label">${label}</span>
      <span class="guest-summary__value">${value}</span>
      ${detail ? html`<span class="small muted">${detail}</span>` : ''}
    </div>`;
}

function summary(ctx: DeskContext, stage: EventStage): SafeHTML {
  const { state } = ctx;
  const events = eventsAt(state, stage);
  if (!events.length) return html`<p class="muted">${EMPTY[stage]}</p>`;
  const guests = events.reduce((sum, event) => sum + event.guests, 0);
  const money = stageMoney(state, events);

  return html`
    <div class="guest-summary">
      <div class="guest-summary__figures">
        ${figure('Events', String(events.length), plural(guests, 'guest'))}
        ${figure('Worth', peso(money.worth), `${peso(money.paid)} paid`)}
        ${figure('Still owed', peso(money.owed), money.owed ? 'Across these events' : 'All paid')}
      </div>

      <h3 class="guest-summary__heading">By date</h3>
      <ul class="rows">
        ${events.map((event) => {
          const booking = findBooking(state, event.bookingId);
          const pkg = findPackage(state, event.packageId);
          return html`
            <li class="row">
              <button class="row__main" type="button" data-action="${booking ? 'open-booking' : 'open-unbooked'}" data-id="${booking?.id ?? event.id}">
                <span class="row__title">${event.title}</span>
                <span class="row__meta">${formatDate(event.date)} · ${pkg?.name ?? 'Custom package'} · ${plural(event.guests, 'guest')}</span>
              </button>
              <span class="row__badges">
                ${booking ? paymentPill(booking) : ctx.can('events.manage')
                  ? html`<button class="btn btn--secondary btn--sm" type="button" data-action="book-event" data-id="${event.id}">Book</button>`
                  : html`<span class="pill pill--neutral">Not booked</span>`}
              </span>
            </li>`;
        })}
      </ul>
      <p class="small muted">Open an event to see its booking and payments.</p>
    </div>`;
}

/** Books an event from its card or this panel, then opens the booking it made. */
export function bookAndOpen(eventId: string, ctx: DeskContext): void {
  const result = bookEvent(eventId, ctx.staff.id);
  if (result.error !== undefined) {
    ctx.toast(result.error, 'error');
    return;
  }
  ctx.toast(`${result.event.title} booked · ${peso(result.booking?.total ?? 0)} · on hold until the downpayment`);
  if (result.booking) ctx.openBooking(result.booking.id);
}

export function createStageSummary(stage: EventStage): DrawerContent {
  return {
    live: true,
    title: STAGE_LABELS[stage],
    render: (ctx) => summary(ctx, stage),
    actions: {
      'open-booking': ({ el, ctx }) => ctx.openBooking(el.dataset.id ?? ''),
      // An inquiry has no booking to open; booking it is the next step.
      'open-unbooked': ({ ctx }) => ctx.toast('Not booked yet. Use Book to take the date.', 'info'),
      'book-event': ({ el, ctx }) => bookAndOpen(el.dataset.id ?? '', ctx),
    },
  };
}
