import { $, html, render } from '../core/dom.js';
import { formatDate, weekdayName } from '../core/format.js';
import { productLabel } from '../core/rules.js';

export function renderPromos(section, state) {
  const active = state.promos.filter((promo) => promo.active);
  section.hidden = active.length === 0;

  render($('[data-slot="promos"]', section), active.map((promo) => {
    const groupRule = promo.minPax ? ` for groups of ${promo.minPax} or more` : '';
    const days = promo.weekdays.map(weekdayName).join(', ');
    const products = promo.appliesTo.map((id) => productLabel(state, id)).join(', ');

    return html`
      <article class="promo">
        <div>
          <p class="script promo__eyebrow">Weekday treat</p>
          <h2 class="promo__title">${promo.name}</h2>
          <p class="promo__text">
            ${promo.percent}% off${groupRule}, ${formatDate(promo.validFrom, 'monthDayLong')} to
            ${formatDate(promo.validTo, 'monthDayLong')} on ${days}. Applies to ${products}.
            The discount shows automatically when you check your rate.
          </p>
        </div>
        <div class="promo__badge" aria-hidden="true">${promo.percent}%<small>OFF</small></div>
      </article>`;
  }));
}
