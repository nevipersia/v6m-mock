// Packages: everything that can be booked, as cards three to a row — entrance
// sessions, rooms and cottages, exclusive rentals, event packages — with their
// prices and the one promotion each is on, and below them the promotions
// themselves. Editing happens in the side panel (components/package-form.ts).

import type { PackageKind } from '../../core/actions.js';
import { flag, html, type SafeHTML } from '../../core/dom.js';
import { formatTime, peso, plural } from '../../core/format.js';
import { guestRange, live, promoFor, promoStatus } from '../../core/rules.js';
import type { State } from '../../core/types.js';
import type { DeskContext, HandlerMap } from '../types.js';
import { KIND_WORDS, STATUS_WORDS, promoWhen } from '../components/package-form.js';
import { icon } from '../components/icons.js';
import { emptyState, pageHead } from '../layout.js';

const TABS: { kind: PackageKind; label: string }[] = [
  { kind: 'entrance', label: 'Entrance' },
  { kind: 'unit', label: 'Rooms and cottages' },
  { kind: 'exclusive', label: 'Exclusive rentals' },
];

/** The tab on screen. Kept while the app is open. */
let tab: PackageKind = 'entrance';

interface Card {
  id: string;
  name: string;
  tag?: string;
  price: number;
  /** What the price is for: "adult", "+ entrance". */
  per?: string;
  facts: [string, string][];
}

const hours = (start: string, end: string): string => `${formatTime(start)} – ${formatTime(end)}`;

function cards(state: State, kind: PackageKind): Card[] {
  if (kind === 'entrance') {
    return live(state.poolSessions).map((item) => ({
      id: item.id, name: item.label, price: item.adult, per: 'adult',
      facts: [['Kid', peso(item.kid)], ['Hours', hours(item.start, item.end)], ['Pool takes', plural(item.capacity, 'guest')]],
    }));
  }
  if (kind === 'unit') {
    return live(state.units).map((item) => ({
      id: item.id, name: item.name, tag: item.kind === 'room' ? 'Room' : 'Cottage', price: item.price,
      per: item.addsEntrance ? '+ entrance' : '',
      facts: [
        ['Guests', guestRange(item)?.replace('–', ' – ') ?? 'No limit'],
        ['Check-in', `${formatTime(item.checkIn)} – ${formatTime(item.checkOut)}`],
      ],
    }));
  }
  if (kind === 'exclusive') {
    const uses = { full: 'Whole resort', partial: 'Some rooms', cottages: 'Cottages only' };
    return live(state.exclusivePackages).map((item) => ({
      id: item.id, name: item.name, tag: item.session === 'day' ? 'Day' : 'Overnight', price: item.price,
      facts: [['Use', uses[item.use]], ['Hours', hours(item.start, item.end)], ['Most guests', String(item.maxGuests)]],
    }));
  }
  return live(state.eventPackages).map((item) => {
    const [start = '', end = ''] = item.hours.split('-');
    return {
      id: item.id, name: item.name, tag: item.exclusive ? 'Exclusive' : 'Shared', price: item.price,
      facts: [['Hours', hours(start, end)], ['Most guests', String(item.maxGuests)]],
    };
  });
}

function card(state: State, kind: PackageKind, item: Card): SafeHTML {
  const promo = promoFor(state, item.id);
  const status = promo ? promoStatus(promo, state.meta.asOf) : null;
  return html`
    <article class="pkg-card">
      <header class="pkg-card__head">
        <h3 class="pkg-card__name">${item.name}</h3>
        ${item.tag ? html`<span class="pkg-card__tag">${item.tag}</span>` : ''}
      </header>
      <p class="pkg-card__price">${peso(item.price)}${item.per ? html` <small>${item.per}</small>` : ''}</p>
      <dl class="pkg-card__facts">
        ${item.facts.map(([label, value]) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`)}
      </dl>
      <p class="pkg-card__promo">
        ${promo ? html`
          <span class="pkg-promo ${status === 'running' ? '' : 'is-idle'}" title="${promoWhen(promo)}">
            ${icon('tag')} ${promo.name} · ${promo.percent}% off${status === 'running' ? '' : ` · ${STATUS_WORDS[status ?? 'paused'].toLowerCase()}`}
          </span>` : html`<span class="muted small">No promotion</span>`}
      </p>
      <footer class="pkg-card__foot">
        <button class="btn btn--secondary btn--sm pkg-card__edit" type="button" data-action="edit-package" data-kind="${kind}" data-id="${item.id}">
          ${icon('pencil')} Edit
        </button>
        <button class="btn btn--quiet btn--icon btn--sm pkg-card__delete" type="button" data-action="delete-package" data-kind="${kind}" data-id="${item.id}"
          aria-label="Delete ${item.name}" title="Delete">${icon('trash')}</button>
      </footer>
    </article>`;
}

function promotions(state: State): SafeHTML {
  const today = state.meta.asOf;
  return html`
    <section class="panel panel--flush fin-side" data-part="Promotions">
      <header class="fin-ledger__head">
        <h2 class="panel__title">Promotions <span class="panel__count">${state.promos.length}</span></h2>
        <button class="btn btn--secondary btn--sm" type="button" data-action="new-promo-alone">${icon('plus')} New promotion</button>
      </header>
      ${state.promos.length ? html`
        <div class="table-scroll">
        <table class="data-table fin-table">
          <thead>
            <tr>
              <th scope="col">Promotion</th>
              <th scope="col" class="num">Off</th>
              <th scope="col">When</th>
              <th scope="col">Status</th>
              <th scope="col" class="num">Packages</th>
              <th scope="col" class="data-table__go"><span class="sr-only">Edit</span></th>
            </tr>
          </thead>
          <tbody>
            ${state.promos.map((promo) => {
              const status = promoStatus(promo, today);
              return html`
                <tr class="data-table__row" data-action="edit-promo-alone" data-id="${promo.id}">
                  <td><button class="link-button" type="button" data-action="edit-promo-alone" data-id="${promo.id}">${promo.name}</button></td>
                  <td class="num">${promo.percent}%</td>
                  <td class="muted">${promoWhen(promo)}</td>
                  <td><span class="pill pill--${status === 'running' ? 'success' : status === 'scheduled' ? 'info' : 'neutral'}">${STATUS_WORDS[status]}</span></td>
                  <td class="num">${promo.appliesTo.filter((id) => live([...state.poolSessions, ...state.units, ...state.exclusivePackages, ...state.eventPackages]).some((item) => item.id === id)).length || '—'}</td>
                  <td class="data-table__go" aria-hidden="true">${icon('pencil')}</td>
                </tr>`;
            })}
          </tbody>
        </table>
        </div>` : html`<div class="fin-empty">${emptyState('No promotions yet', 'Add one, then put packages on it from their Edit.')}</div>`}
    </section>`;
}

export function render(ctx: DeskContext): SafeHTML {
  const { state } = ctx;
  const list = cards(state, tab);
  const word = KIND_WORDS[tab];

  return html`
    ${pageHead({
      title: 'Packages',
      subtitle: 'What can be booked, at what price, and the promotions running on it',
      actions: html`
        <button class="btn btn--primary" type="button" data-action="add-package" data-kind="${tab}">${icon('plus')} Add ${word.one}</button>`,
    })}

    <div class="calendar-bar">
      <div class="segmented" role="tablist" aria-label="Kind of package">
        ${TABS.map((item) => html`
          <button class="segmented__option ${tab === item.kind ? 'is-active' : ''}" type="button" role="tab"
            aria-selected="${flag(tab === item.kind)}" data-action="package-tab" data-kind="${item.kind}">
            ${item.label} <span class="pkg-tab-count">${cards(state, item.kind).length}</span>
          </button>`)}
      </div>
    </div>

    <div class="pkg-body" data-enter="packages|${tab}" data-motion="swap">
      ${list.length ? html`
        <div class="pkg-grid" data-part="${TABS.find((item) => item.kind === tab)?.label ?? 'Packages'}">
          ${list.map((item) => card(state, tab, item))}
        </div>` : html`
        <div class="panel">${emptyState(`No ${word.one} yet`, `Add one and it shows up in the booking forms straight away.`)}</div>`}
    </div>

    ${promotions(state)}`;
}

const isKind = (value: string | undefined): value is PackageKind =>
  value === 'entrance' || value === 'unit' || value === 'exclusive';

export const actions: HandlerMap = {
  'package-tab': ({ el, ctx }) => {
    if (isKind(el.dataset.kind)) tab = el.dataset.kind;
    ctx.redraw();
  },

  'add-package': ({ el, ctx }) => {
    if (isKind(el.dataset.kind)) ctx.editPackage(el.dataset.kind);
  },

  'edit-package': ({ el, ctx }) => {
    if (isKind(el.dataset.kind)) ctx.editPackage(el.dataset.kind, el.dataset.id);
  },

  'delete-package': ({ el, ctx }) => {
    if (isKind(el.dataset.kind)) ctx.editPackage(el.dataset.kind, el.dataset.id, true);
  },

  'new-promo-alone': ({ ctx }) => ctx.editPromo(),

  'edit-promo-alone': ({ el, ctx }) => ctx.editPromo(el.dataset.id),
};
