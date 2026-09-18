import { html, render } from '../core/dom.js';
import { formatTime, peso } from '../core/format.js';
import { checkAvailability, periodDays } from '../core/rules.js';

export function renderStays(container, state) {
  const days = periodDays(state);

  render(container, state.units.map((unit) => {
    const openDays = days.filter((day) => checkAvailability(state, { product: unit.id, date: day }).ok).length;
    const capacity = unit.capacityMin > 1 ? `${unit.capacityMin}–${unit.capacityMax} guests` : `Up to ${unit.capacityMax} guests`;
    const isAirbnb = unit.channel === 'airbnb';

    return html`
      <article class="stay-card">
        <div class="stay-card__top stay-card__top--${unit.kind}">
          <span class="pill ${openDays ? 'pill--success' : 'pill--danger'}">
            ${openDays ? `Open ${openDays} of ${days.length} days` : 'Fully booked this week'}
          </span>
        </div>
        <div class="stay-card__body">
          <p class="stay-card__meta">${capacity} · ${formatTime(unit.checkIn)} to ${formatTime(unit.checkOut)}</p>
          <h3 class="stay-card__name">${unit.name}</h3>
          <ul class="stay-card__list">
            ${unit.inclusions.map((item) => html`<li>${item}</li>`)}
          </ul>
          <div class="stay-card__foot">
            <span class="price">${peso(unit.price)} <small>${isAirbnb ? 'per night' : '+ entrance'}</small></span>
            <button class="btn btn--secondary btn--sm" type="button" data-check-rate data-product="${unit.id}">Check rate</button>
          </div>
        </div>
      </article>`;
  }));
}
