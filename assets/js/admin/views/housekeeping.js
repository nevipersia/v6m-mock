// Housekeeping: status of every room, cottage and shared area.

import { updateHousekeeping } from '../../core/actions.js';
import { html } from '../../core/dom.js';
import { formatDateTime, timeOf } from '../../core/format.js';
import { findBooking, findStaff, findUnit } from '../../core/rules.js';
import { HOUSEKEEPING_LABELS, housekeepingPill } from '../components/badges.js';
import { pageHead } from '../layout.js';

const AREA_NAMES = { pool: 'Pool', shower_rooms: 'Shower rooms' };

const areaName = (state, unitId) => findUnit(state, unitId)?.name ?? AREA_NAMES[unitId] ?? unitId;

function card(ctx, entry) {
  const { state } = ctx;
  const nextArrival = entry.nextArrivalBookingId && findBooking(state, entry.nextArrivalBookingId);
  const updatedBy = findStaff(state, entry.updatedBy);
  const canEdit = ctx.can('housekeeping.write');

  return html`
    <article class="hk-card hk-card--${entry.status}">
      <header class="hk-card__head">
        <h2 class="hk-card__name">${areaName(state, entry.unitId)}</h2>
        ${housekeepingPill(entry.status)}
      </header>

      ${entry.note ? html`<p class="hk-card__note">${entry.note}</p>` : ''}
      ${nextArrival ? html`<p class="small">Next arrival: <strong>${nextArrival.guestName}</strong> at ${timeOf(nextArrival.startsAt)}</p>` : ''}
      <p class="small muted">Updated ${formatDateTime(entry.updatedAt)}${updatedBy ? ` by ${updatedBy.name}` : ''}</p>

      ${canEdit ? html`
        <form class="hk-card__form" data-submit="save-housekeeping" data-unit="${entry.unitId}">
          <label class="field">
            <span class="field__label">Status</span>
            <select class="input" name="status">
              ${Object.entries(HOUSEKEEPING_LABELS).map(([value, label]) => html`
                <option value="${value}" ${value === entry.status ? 'selected' : ''}>${label}</option>`)}
            </select>
          </label>
          <label class="field">
            <span class="field__label">Note</span>
            <input class="input" name="note" value="${entry.note ?? ''}" placeholder="Water heater fixed">
          </label>
          <button class="btn btn--secondary btn--sm" type="submit">Save</button>
        </form>` : ''}
    </article>`;
}

export function render(ctx) {
  const { state } = ctx;
  const counts = Object.keys(HOUSEKEEPING_LABELS).map((status) => ({
    status,
    count: state.housekeeping.filter((entry) => entry.status === status).length,
  }));

  return html`
    ${pageHead({
      title: 'Housekeeping',
      subtitle: counts.filter((item) => item.count).map((item) => `${item.count} ${HOUSEKEEPING_LABELS[item.status].toLowerCase()}`).join(' · '),
    })}
    <div class="hk-grid">${state.housekeeping.map((entry) => card(ctx, entry))}</div>`;
}

export const actions = {
  'save-housekeeping': ({ el, ctx }) => {
    const unitId = el.dataset.unit;
    const status = el.elements.status.value;
    updateHousekeeping(unitId, { status, note: el.elements.note.value }, ctx.staff.id);
    ctx.toast(`${areaName(ctx.state, unitId)} marked ${HOUSEKEEPING_LABELS[status].toLowerCase()}`);
  },
};
