// Booking type, date and guest count → availability and a price estimate.

import { $, html, on, render } from '../core/dom.js';
import { formatDate, formatTime, peso, plural } from '../core/format.js';
import {
  checkAvailability, closingEvent, findSession, findUnit, periodDays, productLabel, quote,
} from '../core/rules.js';

function productOptions(state) {
  const pool = state.poolSessions.map((session) => ({
    value: session.id,
    label: `${session.label} · ${formatTime(session.start)} – ${formatTime(session.end)}`,
  }));
  const stays = state.units.filter((unit) => unit.channel !== 'airbnb').map((unit) => ({
    value: unit.id,
    label: `${unit.name} · ${unit.capacityMin > 1 ? `${unit.capacityMin}–${unit.capacityMax}` : `up to ${unit.capacityMax}`} guests`,
  }));
  const villas = state.units.filter((unit) => unit.channel === 'airbnb').map((unit) => ({
    value: unit.id,
    label: `${unit.name} · via Airbnb`,
  }));

  const group = (label, options) => html`
    <optgroup label="${label}">
      ${options.map((option) => html`<option value="${option.value}">${option.label}</option>`)}
    </optgroup>`;

  return [group('Pool entrance', pool), group('Rooms and cottages', stays), group('Private villa', villas)];
}

function dateOptions(state) {
  return periodDays(state).map((day) => {
    const note = closingEvent(state, day) ? ' · private event' : day === state.meta.asOf ? ' · today' : '';
    return html`<option value="${day}">${formatDate(day, 'long')}${note}</option>`;
  });
}

function resultTemplate(state, { product, date, adults, kids }) {
  if (adults + kids === 0) {
    return html`<p class="quote__empty">Add at least one guest to see your rate.</p>`;
  }

  const availability = checkAvailability(state, { product, date, adults, kids });
  const estimate = quote(state, { product, date, adults, kids });
  const unit = findUnit(state, product);

  let status;
  if (!availability.ok) status = html`<span class="pill pill--danger">Not available</span>`;
  else if (availability.viaAirbnb) status = html`<span class="pill pill--info">Open on Airbnb</span>`;
  else status = html`<span class="pill pill--success">Available</span>`;

  const slots = availability.ok && availability.slotsLeft != null
    ? html`<span class="small muted">${plural(availability.slotsLeft, 'pool slot')} left</span>`
    : '';

  const buttonLabel = !availability.ok ? 'Ask about other dates' : availability.viaAirbnb ? 'Ask for the Airbnb link' : 'Send inquiry';

  return html`
    <div class="quote">
      <div>
        <div class="quote__status">${status} <span class="small">${formatDate(date, 'long')}</span> ${slots}</div>
        <dl class="quote__lines">
          ${estimate.lines.map((line) => html`
            <div class="quote__line">
              <dt>${line.label}<small>${line.qty} × ${peso(line.unitPrice)}</small></dt>
              <dd>${peso(line.amount)}</dd>
            </div>`)}
          ${estimate.promo ? html`
            <div class="quote__line quote__line--discount">
              <dt>${estimate.promo.name} (${estimate.promo.percent}% off)</dt>
              <dd>−${peso(estimate.discount)}</dd>
            </div>` : ''}
        </dl>
        <div class="quote__notes">
          ${!availability.ok ? html`<p class="form-error">${availability.reason}</p>` : ''}
          ${estimate.warnings.map((warning) => html`<p class="form-error">${warning}</p>`)}
          ${unit?.channel === 'airbnb' ? html`<p class="small muted">Villa rates are set on Airbnb. The price shown is a sample nightly rate.</p>` : ''}
        </div>
      </div>
      <div class="quote__side">
        <span class="small muted">${estimate.promo ? 'Promo applied' : 'Estimated total'}</span>
        <strong class="quote__total">${peso(estimate.total)}</strong>
        <button class="btn btn--primary" type="button" data-action="inquire">${buttonLabel}</button>
      </div>
    </div>`;
}

export function createRateChecker(form, { state: initialState, onInquire }) {
  let state = initialState;
  const fields = {
    product: $('[name="product"]', form),
    date: $('[name="date"]', form),
    adults: $('[name="adults"]', form),
    kids: $('[name="kids"]', form),
  };
  const result = $('[data-slot="result"]', form);

  const count = (input) => Math.max(0, Math.min(200, Number.parseInt(input.value, 10) || 0));

  function values() {
    return {
      product: fields.product.value,
      date: fields.date.value,
      adults: count(fields.adults),
      kids: count(fields.kids),
    };
  }

  function fillOptions() {
    const selectedProduct = fields.product.value;
    const selectedDate = fields.date.value || state.meta.asOf;
    render(fields.product, productOptions(state));
    render(fields.date, dateOptions(state));
    if (selectedProduct) fields.product.value = selectedProduct;
    fields.date.value = periodDays(state).includes(selectedDate) ? selectedDate : state.meta.period.from;
  }

  function update() {
    render(result, resultTemplate(state, values()));
  }

  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('input', update);

  on(form, 'click', '[data-action="inquire"]', () => {
    const { product, date, adults, kids } = values();
    const estimate = quote(state, { product, date, adults, kids });
    onInquire(`${productLabel(state, product)} on ${formatDate(date, 'long')} · ${plural(adults + kids, 'guest')} · estimated ${peso(estimate.total)}`);
  });

  fillOptions();
  update();

  return {
    refresh(nextState) {
      state = nextState;
      fillOptions();
      update();
    },

    /** Pre-fills the form (from the week grid or a stay card) and scrolls to it. */
    select({ product, date }) {
      if (product) fields.product.value = product;
      if (date) fields.date.value = date;

      const unit = findUnit(state, product);
      const session = findSession(state, product);
      const guests = count(fields.adults) + count(fields.kids);
      if (unit && unit.capacityMin > 1 && guests < unit.capacityMin) fields.adults.value = unit.capacityMin;
      if (unit && guests > unit.capacityMax) {
        fields.adults.value = unit.capacityMax;
        fields.kids.value = 0;
      }
      if ((unit || session) && guests === 0) fields.adults.value = 2;

      update();
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  };
}
