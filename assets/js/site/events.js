import { html, render } from '../core/dom.js';
import { formatDate, formatTime, peso } from '../core/format.js';

const PACKAGE_TONES = ['event', 'warning', 'brand', 'success'];

export function renderEvents(datesLine, container, state) {
  const reserved = state.events
    .filter((event) => event.blocksCalendar && event.date >= state.meta.asOf)
    .sort((a, b) => a.date.localeCompare(b.date));

  datesLine.hidden = reserved.length === 0;
  render(datesLine, html`
    <span>Already reserved:</span>
    ${reserved.map((event) => html`<span class="pill pill--event">${formatDate(event.date)}</span>`)}`);

  render(container, state.eventPackages.map((pkg, index) => {
    const [start, end] = pkg.hours.split('-');
    return html`
      <article class="package-card">
        <span class="pill pill--${PACKAGE_TONES[index % PACKAGE_TONES.length]}">
          ${pkg.exclusive ? 'Exclusive' : 'Shared venue'} · up to ${pkg.maxGuests}
        </span>
        <h3 class="package-card__name">${pkg.name}</h3>
        <span class="price">${peso(pkg.price)}</span>
        <span class="small muted">${formatTime(start)} – ${formatTime(end)}</span>
        <ul class="package-card__list">
          ${pkg.inclusions.map((item) => html`<li>${item}</li>`)}
        </ul>
        <button class="btn btn--secondary btn--sm" type="button" data-inquire-package="${pkg.id}">Ask about this</button>
      </article>`;
  }));
}
