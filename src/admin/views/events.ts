// Events: private events by stage, plus the package price list.

import { html, type SafeHTML } from '../../core/dom.js';
import { formatDate, formatTime, peso, plural } from '../../core/format.js';
import { STAGE_LABELS, findBooking, findGuest, findPackage, findStaff } from '../../core/rules.js';
import type { EventStage, ResortEvent } from '../../core/types.js';
import type { DeskContext } from '../types.js';
import { emptyState, pageHead } from '../layout.js';

const STAGES: EventStage[] = ['inquiry', 'ocular', 'reserved', 'paid', 'done'];

function eventCard(ctx: DeskContext, event: ResortEvent): SafeHTML {
  const { state } = ctx;
  const pkg = findPackage(state, event.packageId);
  const booking = findBooking(state, event.bookingId);
  const contact = findGuest(state, event.contactGuestId);
  const coordinator = findStaff(state, event.coordinatorId);
  const paidPercent = booking ? Math.min(100, Math.round((booking.paid / booking.total) * 100)) : 0;

  return html`
    <article class="event-card">
      <p class="event-card__date">${formatDate(event.date, 'long')}</p>
      <h3 class="event-card__title">${event.title}</h3>
      <p class="small muted">${pkg?.name ?? 'Custom package'} · ${plural(event.guests, 'guest')}${event.exclusive ? ' · closes resort' : ''}</p>
      ${event.addOns.length ? html`<p class="small">Add-ons: ${event.addOns.map((addOn) => `${addOn.item} (${peso(addOn.amount)})`).join(', ')}</p>` : ''}

      ${booking ? html`
        <div class="event-card__money">
          <span class="small"><strong>${peso(booking.paid)}</strong> of ${peso(booking.total)} paid</span>
          <span class="meter" role="img" aria-label="${paidPercent}% paid"><span style="width:${paidPercent}%"></span></span>
        </div>` : html`
        <p class="small muted">No booking yet. Ocular visit ${event.ocularDate > state.meta.asOf ? 'on' : 'was'} ${formatDate(event.ocularDate)}.</p>`}

      ${event.notes ? html`<p class="event-card__note">${event.notes}</p>` : ''}

      <footer class="event-card__foot">
        <span class="small muted">${contact?.name ?? 'Unknown contact'}${coordinator ? ` · ${coordinator.name}` : ''}</span>
        ${booking ? html`<button class="btn btn--secondary btn--sm" type="button" data-action="open-booking" data-id="${booking.id}">Open booking</button>` : ''}
      </footer>
    </article>`;
}

export function render(ctx: DeskContext): SafeHTML {
  const { state } = ctx;
  const events = [...state.events].sort((a, b) => a.date.localeCompare(b.date));
  const usedStages = STAGES.filter((stage) => stage !== 'inquiry' || events.some((event) => event.stage === 'inquiry'));

  return html`
    ${pageHead({ title: 'Events', subtitle: `${plural(events.length, 'event')} in this period` })}

    ${events.length ? html`
      <div class="pipeline">
        ${usedStages.map((stage) => {
          const inStage = events.filter((event) => event.stage === stage);
          return html`
            <section class="pipeline__column" aria-label="${STAGE_LABELS[stage]}">
              <header class="pipeline__head">
                <h2 class="pipeline__title">${STAGE_LABELS[stage]}</h2>
                <span class="panel__count">${inStage.length}</span>
              </header>
              ${inStage.length ? inStage.map((event) => eventCard(ctx, event)) : html`<p class="pipeline__empty">None</p>`}
            </section>`;
        })}
      </div>` : html`<div class="panel">${emptyState('No events in this period', 'Event bookings will show up here by stage.')}</div>`}

    <section class="panel panel--flush packages">
      <header class="panel__head panel__head--padded">
        <h2 class="panel__title">Packages</h2>
      </header>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">Package</th>
              <th scope="col">Hours</th>
              <th scope="col" class="num">Max guests</th>
              <th scope="col">Venue</th>
              <th scope="col" class="num">Price</th>
            </tr>
          </thead>
          <tbody>
            ${state.eventPackages.map((pkg) => {
              const [start = '', end = ''] = pkg.hours.split('-');
              return html`
                <tr>
                  <td><strong>${pkg.name}</strong><span class="data-table__sub">${pkg.inclusions.join(' · ')}</span></td>
                  <td>${formatTime(start)} – ${formatTime(end)}</td>
                  <td class="num">${pkg.maxGuests}</td>
                  <td>${pkg.exclusive ? 'Exclusive' : 'Shared'}</td>
                  <td class="num">${peso(pkg.price)}</td>
                </tr>`;
            })}
          </tbody>
        </table>
      </div>
    </section>`;
}
