// Events: private events by stage. Each stage is a card, like the dashboard's,
// that opens a summary of its events; each event card opens its booking. Staff
// add events here; one takes the date once it is reserved. Prices live on the
// Packages page.

import { html, type SafeHTML } from '../../core/dom.js';
import { formatDate, peso, plural } from '../../core/format.js';
import { STAGE_LABELS, findBooking, findGuest, findPackage, findStaff } from '../../core/rules.js';
import type { EventStage, ResortEvent } from '../../core/types.js';
import type { DeskContext, HandlerMap } from '../types.js';
import { icon } from '../components/icons.js';
import { emptyState, pageHead } from '../layout.js';
import { bookAndOpen, stageMoney } from '../components/stage-summary.js';

const STAGES: EventStage[] = ['inquiry', 'reserved', 'paid', 'done'];

function eventCard(ctx: DeskContext, event: ResortEvent): SafeHTML {
  const { state } = ctx;
  const pkg = findPackage(state, event.packageId);
  const booking = findBooking(state, event.bookingId);
  const contact = findGuest(state, event.contactGuestId);
  const coordinator = findStaff(state, event.coordinatorId);
  const paidPercent = booking ? Math.min(100, Math.round((booking.paid / booking.total) * 100)) : 0;

  return html`
    <article class="event-card ${booking ? 'event-card--opens' : ''}" ${booking ? html`data-action="open-booking" data-id="${booking.id}" title="Open the booking"` : ''}>
      <p class="event-card__date">${formatDate(event.date, 'long')}</p>
      <h3 class="event-card__title">${event.title}</h3>
      <p class="small muted">${pkg?.name ?? 'Custom package'} · ${event.guests ? plural(event.guests, 'guest') : 'guests not set'}${event.exclusive ? ' · closes resort' : ''}</p>
      ${event.addOns.length ? html`<p class="small">Add-ons: ${event.addOns.map((addOn) => `${addOn.item} (${peso(addOn.amount)})`).join(', ')}</p>` : ''}

      ${booking ? html`
        <div class="event-card__money">
          <span class="small"><strong>${peso(booking.paid)}</strong> of ${peso(booking.total)} paid</span>
          <span class="meter" role="img" aria-label="${paidPercent}% paid"><span style="width:${paidPercent}%"></span></span>
        </div>` : html`
        <p class="small muted">No booking yet.</p>`}

      ${event.notes ? html`<p class="event-card__note">${event.notes}</p>` : ''}

      <footer class="event-card__foot">
        <span class="small muted">${contact?.name ?? 'Unknown contact'}${coordinator ? ` · ${coordinator.name}` : ''}</span>
        ${booking
          ? html`<button class="btn btn--secondary btn--sm" type="button" data-action="open-booking" data-id="${booking.id}">Open booking</button>`
          : ctx.can('events.manage')
            ? html`<button class="btn btn--secondary btn--sm" type="button" data-action="book-event" data-id="${event.id}">Book this event</button>`
            : ''}
      </footer>
    </article>`;
}

export function render(ctx: DeskContext): SafeHTML {
  const { state } = ctx;
  const events = [...state.events].sort((a, b) => a.date.localeCompare(b.date));
  const usedStages = STAGES.filter((stage) => stage !== 'inquiry' || events.some((event) => event.stage === 'inquiry'));

  return html`
    ${pageHead({
      title: 'Events',
      subtitle: `${plural(events.length, 'event')} in this period`,
      actions: html`
        ${ctx.canView('packages') ? html`<a class="btn btn--secondary" href="#/packages">${icon('tag')} Packages and prices</a>` : ''}
        ${ctx.can('events.manage') ? html`
          <button class="btn btn--primary" type="button" data-action="new-event">${icon('plus')} New event</button>` : ''}`,
    })}

    ${events.length ? html`
      <div class="pipeline">
        ${usedStages.map((stage) => {
          const inStage = events.filter((event) => event.stage === stage);
          return html`
            <section class="pipeline__column" aria-label="${STAGE_LABELS[stage]}" data-action="open-stage" data-stage="${stage}">
              <button class="pipeline__head" type="button" data-action="open-stage" data-stage="${stage}" title="See every ${STAGE_LABELS[stage].toLowerCase()} event">
                <span class="pipeline__title-row">
                  <span class="pipeline__title">${STAGE_LABELS[stage]}</span>
                  <span class="panel__count">${inStage.length}</span>
                </span>
                <span class="pipeline__sum">
                  ${inStage.length ? `${peso(stageMoney(state, inStage).worth)} · ${plural(inStage.reduce((sum, event) => sum + event.guests, 0), 'guest')}` : 'Nothing here yet'}
                  ${icon('arrowRight')}
                </span>
              </button>
              ${inStage.map((event) => eventCard(ctx, event))}
            </section>`;
        })}
      </div>` : html`<div class="panel">${emptyState('No events in this period', 'Event bookings will show up here by stage.')}</div>`}`;
}

export const actions: HandlerMap = {
  'new-event': ({ ctx }) => ctx.newEvent(),

  'book-event': ({ el, ctx }) => bookAndOpen(el.dataset.id ?? '', ctx),

  'open-stage': ({ el, ctx }) => {
    const stage = el.dataset.stage as EventStage | undefined;
    if (stage && STAGES.includes(stage)) ctx.openStage(stage);
  },
};
