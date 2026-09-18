import { html, render } from '../core/dom.js';
import { peso } from '../core/format.js';

export function renderHeroFacts(list, state) {
  const cheapestEntrance = Math.min(...state.poolSessions.map((session) => session.kid));
  const stayCount = state.units.filter((unit) => unit.channel !== 'airbnb').length;

  const facts = [
    `Entrance from ${peso(cheapestEntrance)}`,
    `${stayCount} rooms and cottages`,
    `${state.eventPackages.length} event packages`,
  ];

  render(list, facts.map((fact) => html`<li class="pill pill--brand">${fact}</li>`));
}
