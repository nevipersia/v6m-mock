// Guest website entry point: loads the shared store and renders each section.

import { $, on } from '../core/dom.js';
import { formatDate, plural } from '../core/format.js';
import { findPackage } from '../core/rules.js';
import { getState, loadStore, subscribe } from '../core/store.js';
import { renderEvents } from './events.js';
import { renderFaq } from './faq.js';
import { renderHeroFacts } from './hero.js';
import { createInquiryDialog } from './inquiry-dialog.js';
import { renderPromos } from './promos.js';
import { createRateChecker } from './rate-checker.js';
import { renderRates } from './rates.js';
import { renderStays } from './stays.js';
import { renderWeekAvailability } from './week-availability.js';

function showLoadError(error) {
  const box = $('#load-error');
  box.hidden = false;
  box.textContent = `${error.message}. If you opened index.html directly, start the local server instead (npm start) and visit http://localhost:4789.`;
}

async function start() {
  let state;
  try {
    state = await loadStore();
  } catch (error) {
    showLoadError(error);
    return;
  }

  const inquiryDialog = createInquiryDialog($('#inquiry-dialog'));
  const rateChecker = createRateChecker($('#book'), {
    state,
    onInquire: (summary) => inquiryDialog.open(summary),
  });

  function renderPage(current) {
    renderHeroFacts($('#hero-facts'), current);
    renderPromos($('#promos'), current);
    renderWeekAvailability($('#week-availability'), $('#week-lead'), current);
    renderStays($('#stay-list'), current);
    renderRates($('#rate-list'), current);
    renderEvents($('#event-dates'), $('#package-list'), current);
    renderFaq($('#faq-list'), current);
    rateChecker.refresh(current);
    $('#data-note').textContent = `Mock prototype · sample data as of ${formatDate(current.meta.asOf, 'full')} · ${plural(current.bookings.length, 'sample booking')}`;
  }

  renderPage(state);
  subscribe(renderPage);

  // "Check rate" buttons anywhere on the page fill in the rate checker.
  on(document, 'click', '[data-check-rate]', (event, button) => {
    rateChecker.select({ product: button.dataset.product, date: button.dataset.date });
  });

  on(document, 'click', '[data-inquire-package]', (event, button) => {
    const pkg = findPackage(getState(), button.dataset.inquirePackage);
    inquiryDialog.open(`Event inquiry: ${pkg.name}, up to ${pkg.maxGuests} guests`);
  });
}

start();
