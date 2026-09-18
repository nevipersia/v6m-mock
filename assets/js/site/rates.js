import { html, render } from '../core/dom.js';
import { formatTime, peso } from '../core/format.js';

export function renderRates(container, state) {
  render(container, state.poolSessions.map((session) => html`
    <article class="rate-card rate-card--${session.id}">
      <h3 class="rate-card__name">${session.label}</h3>
      <p class="rate-card__hours">${formatTime(session.start)} – ${formatTime(session.end)} · up to ${session.capacity} guests</p>
      <dl class="rate-card__prices">
        <dt>Adults</dt><dd>${peso(session.adult)}</dd>
        <dt>Kids</dt><dd>${peso(session.kid)}</dd>
      </dl>
    </article>`));
}
