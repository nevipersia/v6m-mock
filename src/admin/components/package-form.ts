// The side panel for one package: add it, change it, put it on a promotion,
// or delete it. Also the panel for a promotion on its own.
//
// A package is on at most one promotion, so the promotions show as a list to
// tick: ticking one unticks whichever was ticked before, and ticking the ticked
// one again takes the package off promotion. The tick is part of the package's
// form and saves with it. Editing a promotion (the pencil) is different: it
// changes the promotion for every package on it, so it saves on its own.

import {
  deletePackage, packageDraft, packageInUse, promoDraft, savePackage, savePromo,
  type PackageDraft, type PackageKind, type PromoDraft,
} from '../../core/actions.js';
import { html, type SafeHTML } from '../../core/dom.js';
import { formatDate, peso } from '../../core/format.js';
import { findExclusive, findPackage, findUnit, live, promoStatus, type PromoStatus } from '../../core/rules.js';
import type { Promo, State } from '../../core/types.js';
import { asField, type DeskContext, type DrawerContent } from '../types.js';
import { icon } from './icons.js';

export const KIND_WORDS: Record<PackageKind, { one: string; title: string }> = {
  entrance: { one: 'entrance', title: 'Entrance' },
  unit: { one: 'room or cottage', title: 'Room or cottage' },
  exclusive: { one: 'exclusive rental', title: 'Exclusive rental' },
  event: { one: 'event package', title: 'Event package' },
};

export const STATUS_WORDS: Record<PromoStatus, string> = {
  running: 'Running', scheduled: 'Starts later', ended: 'Ended', paused: 'Paused',
};

/** Monday first, the way the resort's week reads. */
const WEEKDAYS: { day: number; label: string }[] = [
  { day: 1, label: 'Mon' }, { day: 2, label: 'Tue' }, { day: 3, label: 'Wed' }, { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' }, { day: 6, label: 'Sat' }, { day: 0, label: 'Sun' },
];

/** "Mon–Thu", "Every day", "Fri, Sat, Sun". */
export function weekdayWords(days: number[]): string {
  if (days.length === 7) return 'Every day';
  const order = WEEKDAYS.filter((item) => days.includes(item.day));
  const positions = order.map((item) => WEEKDAYS.indexOf(item));
  const unbroken = positions.every((at, index) => index === 0 || at === (positions[index - 1] ?? 0) + 1);
  if (unbroken && order.length > 2) return `${order[0]?.label}–${order[order.length - 1]?.label}`;
  return order.map((item) => item.label).join(', ');
}

/** "Sep 1 – Sep 30 · Mon–Thu · 10+ guests". */
export const promoWhen = (promo: Pick<Promo, 'validFrom' | 'validTo' | 'weekdays' | 'minPax'>): string =>
  [
    `${formatDate(promo.validFrom, 'monthDay')} – ${formatDate(promo.validTo, 'monthDay')}`,
    weekdayWords(promo.weekdays),
    promo.minPax ? `${promo.minPax}+ guests` : '',
  ].filter(Boolean).join(' · ');

// ---------- The promotion editor, in a package's panel or on its own ----------

function promoEditor(draft: PromoDraft, error: string, saveAction: string, cancelAction: string): SafeHTML {
  return html`
    <div class="promo-editor" data-slot="promo-editor">
      <label class="field">
        <span class="field__label">Name</span>
        <input class="input" name="name" data-input="promo" value="${draft.name}" placeholder="Weekday barkada" autocomplete="off">
      </label>
      <div class="form-grid">
        <label class="field">
          <span class="field__label">Percent off</span>
          <input class="input" name="percent" data-input="promo" type="number" min="1" max="100" step="1" value="${draft.percent}">
        </label>
        <label class="field">
          <span class="field__label">Fewest guests</span>
          <input class="input" name="minPax" data-input="promo" type="number" min="0" step="1" value="${draft.minPax}">
        </label>
        <label class="field">
          <span class="field__label">First day</span>
          <input class="input" name="validFrom" data-input="promo" type="date" value="${draft.validFrom}">
        </label>
        <label class="field">
          <span class="field__label">Last day</span>
          <input class="input" name="validTo" data-input="promo" type="date" value="${draft.validTo}">
        </label>
      </div>
      <fieldset class="weekday-picks">
        <legend class="field__label">On these days</legend>
        ${WEEKDAYS.map((item) => html`
          <label class="weekday-pick">
            <input type="checkbox" name="weekday" value="${item.day}" data-input="promo" ${draft.weekdays.includes(item.day) ? 'checked' : ''}>
            <span>${item.label}</span>
          </label>`)}
      </fieldset>
      <label class="checkbox">
        <input type="checkbox" name="active" data-input="promo" ${draft.active ? 'checked' : ''}>
        Running — untick to pause it without losing it
      </label>
      <p class="form-error" data-slot="promo-error" role="alert">${error}</p>
      <div class="button-row button-row--end">
        <button class="btn btn--quiet btn--sm" type="button" data-action="${cancelAction}">Cancel</button>
        <button class="btn btn--secondary btn--sm" type="button" data-action="${saveAction}">${draft.id ? 'Save promotion' : 'Add promotion'}</button>
      </div>
    </div>`;
}

/** Copies a promotion field into its draft. */
function readPromoField(draft: PromoDraft, el: HTMLElement): void {
  const field = asField(el);
  if (field.name === 'weekday') {
    const day = Number(field.value);
    const checked = (field as HTMLInputElement).checked;
    draft.weekdays = checked ? [...new Set([...draft.weekdays, day])] : draft.weekdays.filter((item) => item !== day);
  } else if (field.name === 'active') draft.active = (field as HTMLInputElement).checked;
  else if (field.name === 'percent' || field.name === 'minPax') draft[field.name] = Number(field.value) || 0;
  else if (field.name === 'name' || field.name === 'validFrom' || field.name === 'validTo') draft[field.name] = field.value;
}

const showText = (root: HTMLElement, slot: string, text: string): void => {
  const el = root.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
  if (el) el.textContent = text;
};

// ---------- A package ----------

function packageName(state: State, kind: PackageKind, id: string): string {
  if (kind === 'entrance') return state.poolSessions.find((item) => item.id === id)?.label ?? '';
  if (kind === 'unit') return findUnit(state, id)?.name ?? '';
  if (kind === 'exclusive') return findExclusive(state, id)?.name ?? '';
  return findPackage(state, id)?.name ?? '';
}

function kindFields(state: State, draft: PackageDraft): SafeHTML {
  const number = (name: keyof PackageDraft, label: string, value: number, min = 0) => html`
    <label class="field">
      <span class="field__label">${label}</span>
      <input class="input" name="${name}" data-input="pkg" type="number" min="${min}" step="1" value="${value || ''}" inputmode="numeric">
    </label>`;
  const time = (name: keyof PackageDraft, label: string, value: string) => html`
    <label class="field">
      <span class="field__label">${label}</span>
      <input class="input" name="${name}" data-input="pkg" type="time" value="${value}">
    </label>`;
  const select = (name: keyof PackageDraft, label: string, value: string, options: [string, string][]) => html`
    <label class="field">
      <span class="field__label">${label}</span>
      <select class="input" name="${name}" data-input="pkg">
        ${options.map(([key, text]) => html`<option value="${key}" ${key === value ? 'selected' : ''}>${text}</option>`)}
      </select>
    </label>`;
  const inclusions = (label: string) => html`
    <label class="field">
      <span class="field__label">${label}</span>
      <textarea class="input" name="inclusions" data-input="pkg" rows="3" placeholder="One per line">${draft.inclusions}</textarea>
    </label>`;

  if (draft.kind === 'entrance') {
    return html`
      <div class="form-grid">
        ${number('price', 'Adult rate (₱)', draft.price, 1)}
        ${number('kid', 'Kid rate (₱)', draft.kid)}
        ${time('start', 'Opens', draft.start)}
        ${time('end', 'Closes', draft.end)}
        ${number('maxGuests', 'Pool takes (guests)', draft.maxGuests, 1)}
      </div>`;
  }
  if (draft.kind === 'unit') {
    return html`
      <div class="form-grid">
        ${select('unitKind', 'Type', draft.unitKind, [['room', 'Room'], ['cottage', 'Cottage']])}
        ${number('price', 'Price (₱)', draft.price, 1)}
        ${number('minGuests', 'Fewest guests', draft.minGuests, 1)}
        ${number('maxGuests', 'Most guests', draft.maxGuests, 1)}
        ${time('checkIn', 'Check-in', draft.checkIn)}
        ${time('checkOut', 'Check-out', draft.checkOut)}
      </div>
      ${select('session', 'Comes with entrance', draft.session, live(state.poolSessions).map((session) => [session.id, session.label]))}
      <label class="checkbox">
        <input type="checkbox" name="addsEntrance" data-input="pkg" ${draft.addsEntrance ? 'checked' : ''}>
        Guests pay entrance on top of the price
      </label>
      ${inclusions('Inclusions')}
      <label class="field">
        <span class="field__label">Price note (optional)</span>
        <input class="input" name="priceNote" data-input="pkg" value="${draft.priceNote}" placeholder="Weekend rate applies on holidays">
      </label>`;
  }
  if (draft.kind === 'exclusive') {
    return html`
      <div class="form-grid">
        ${select('exclusiveSession', 'Session', draft.exclusiveSession, [['day', 'Day'], ['overnight', 'Overnight']])}
        ${select('use', 'Use', draft.use, [['full', 'Whole resort'], ['partial', 'Some rooms'], ['cottages', 'Cottages only']])}
        ${number('price', 'Price (₱)', draft.price, 1)}
        ${number('maxGuests', 'Most guests', draft.maxGuests, 1)}
        ${time('start', 'Starts', draft.start)}
        ${time('end', 'Ends', draft.end)}
      </div>
      <label class="field">
        <span class="field__label">Includes</span>
        <input class="input" name="includes" data-input="pkg" value="${draft.includes}" placeholder="All rooms + all amenities">
      </label>`;
  }
  return html`
    <div class="form-grid">
      ${number('price', 'Price (₱)', draft.price, 1)}
      ${number('maxGuests', 'Most guests', draft.maxGuests, 1)}
      ${time('start', 'Starts', draft.start)}
      ${time('end', 'Ends', draft.end)}
    </div>
    <label class="checkbox">
      <input type="checkbox" name="exclusive" data-input="pkg" ${draft.exclusive ? 'checked' : ''}>
      The whole resort is theirs (no other guests)
    </label>
    ${inclusions('Inclusions')}`;
}

function promoOption(promo: Promo, ticked: boolean, today: string): SafeHTML {
  const status = promoStatus(promo, today);
  return html`
    <div class="promo-option ${ticked ? 'is-ticked' : ''}">
      <button class="promo-option__tick" type="button" role="radio" aria-checked="${ticked ? 'true' : 'false'}"
        data-action="tick-promo" data-id="${promo.id}">
        ${icon(ticked ? 'check' : 'plus')}
        <span class="promo-option__text">
          <strong>${promo.name} · ${promo.percent}% off</strong>
          <span class="small">${promoWhen(promo)}${status === 'running' ? '' : ` · ${STATUS_WORDS[status]}`}</span>
        </span>
      </button>
      <button class="promo-option__edit" type="button" data-action="edit-promo" data-id="${promo.id}" aria-label="Edit ${promo.name}" title="Edit this promotion">
        ${icon('pencil')}
      </button>
    </div>`;
}

export interface PackageFormOptions {
  /** Open straight on the delete question. */
  confirmDelete?: boolean;
}

export function createPackageForm(kind: PackageKind, id = '', options: PackageFormOptions = {}): DrawerContent {
  let draft: PackageDraft | null = null;
  let error = '';
  /** The promotion open in the editor: its id, 'new', or null for none. */
  let editing: string | null = null;
  let promo: PromoDraft | null = null;
  let promoError = '';
  /** What the last tick did, said under the list. */
  let note = '';
  let confirmDelete = options.confirmDelete ?? false;

  return {
    live: false,
    title: (ctx) => (id ? packageName(ctx.state, kind, id) || KIND_WORDS[kind].title : `Add ${KIND_WORDS[kind].one}`),

    render(ctx) {
      const { state } = ctx;
      if (!draft) draft = packageDraft(state, kind, id);
      const form = draft;
      const busy = id && confirmDelete ? packageInUse(state, kind, id) : '';

      return html`
        <form class="booking-form" data-submit="save-package" novalidate>
          <fieldset class="form-section">
            <legend class="form-section__title">${KIND_WORDS[kind].title}</legend>
            <label class="field">
              <span class="field__label">Name</span>
              <input class="input" name="name" data-input="pkg" value="${form.name}" autocomplete="off"
                placeholder="${kind === 'entrance' ? 'Day tour' : kind === 'unit' ? 'Cottage D' : kind === 'exclusive' ? 'Full resort use' : 'Debut package'}">
            </label>
            ${kindFields(state, form)}
          </fieldset>

          <fieldset class="form-section">
            <legend class="form-section__title">Promotion <span class="form-section__hint">· one at a time</span></legend>
            <div class="promo-options" role="radiogroup" aria-label="Promotion">
              ${state.promos.map((item) => (editing === item.id && promo
                ? promoEditor(promo, promoError, 'save-promo', 'cancel-promo')
                : promoOption(item, form.promoId === item.id, state.meta.asOf)))}
              ${editing === 'new' && promo
                ? promoEditor(promo, promoError, 'save-promo', 'cancel-promo')
                : html`
                  <button class="promo-option promo-option--new" type="button" data-action="new-promo">
                    ${icon('plus')} New promotion
                  </button>`}
            </div>
            <p class="small muted" data-slot="promo-note" aria-live="polite">${note}</p>
          </fieldset>

          <p class="form-error" data-slot="error" role="alert">${error}</p>

          <div class="button-row button-row--end">
            <button class="btn btn--quiet" type="button" data-action="close-drawer">Cancel</button>
            <button class="btn btn--primary" type="submit">${id ? 'Save package' : `Add ${KIND_WORDS[kind].one}`}</button>
          </div>
        </form>

        ${id ? html`
          <div class="detail-section">
            ${confirmDelete ? html`
              <div class="action-card action-card--danger">
                <h4 class="action-card__title">Delete ${form.name || 'this package'}?</h4>
                ${busy ? html`
                  <p class="small">Not yet: ${busy} Move or cancel those first.</p>
                  <div class="button-row">
                    <button class="btn btn--quiet" type="button" data-action="keep-package">OK</button>
                  </div>` : html`
                  <p class="small muted">It disappears from the booking forms, the guest booking page and the calendar. Past bookings keep their price and still show its name.</p>
                  <div class="button-row">
                    <button class="btn btn--quiet" type="button" data-action="keep-package">Keep it</button>
                    <button class="btn btn--danger" type="button" data-action="confirm-delete-package">Delete</button>
                  </div>`}
              </div>` : html`
              <button class="btn btn--quiet btn--danger-text" type="button" data-action="ask-delete-package">${icon('trash')} Delete ${KIND_WORDS[kind].one}</button>`}
          </div>` : ''}`;
    },

    inputs: {
      pkg: ({ el, root }) => {
        if (!draft) return;
        const field = asField(el);
        const name = field.name as keyof PackageDraft;
        const value: unknown = field instanceof HTMLInputElement && field.type === 'checkbox'
          ? field.checked
          : field instanceof HTMLInputElement && field.type === 'number' ? Number(field.value) || 0 : field.value;
        (draft as unknown as Record<string, unknown>)[name] = value;
        error = '';
        showText(root, 'error', '');
      },

      promo: ({ el, root }) => {
        if (!promo) return;
        readPromoField(promo, el);
        promoError = '';
        showText(root, 'promo-error', '');
      },
    },

    actions: {
      // One promotion at a time: a tick replaces the last one, a second tick clears it.
      'tick-promo': ({ el, ctx, redraw }) => {
        if (!draft) return;
        const picked = el.dataset.id ?? '';
        const before = ctx.state.promos.find((item) => item.id === draft?.promoId);
        const after = ctx.state.promos.find((item) => item.id === picked);
        if (draft.promoId === picked) {
          draft.promoId = '';
          note = `Taken off ${after?.name ?? 'the promotion'}. Save the package to keep it.`;
        } else {
          draft.promoId = picked;
          note = before
            ? `${before.name} unticked — a package runs one promotion at a time. Save the package to keep it.`
            : `${after?.name ?? 'Promotion'} ticked. Save the package to keep it.`;
        }
        redraw();
      },

      'edit-promo': ({ el, ctx, redraw }) => {
        editing = el.dataset.id ?? null;
        promo = promoDraft(ctx.state, editing ?? '');
        promoError = '';
        redraw();
        (document.querySelector<HTMLInputElement>('[data-slot="promo-editor"] input[name="name"]'))?.focus();
      },

      'new-promo': ({ ctx, redraw }) => {
        editing = 'new';
        promo = promoDraft(ctx.state);
        promoError = '';
        redraw();
        (document.querySelector<HTMLInputElement>('[data-slot="promo-editor"] input[name="name"]'))?.focus();
      },

      'cancel-promo': ({ redraw }) => {
        editing = null;
        promo = null;
        redraw();
      },

      // Saving a promotion changes it for every package on it, so it saves now,
      // not with the package. A new one is ticked for this package.
      'save-promo': ({ ctx, root, redraw }) => {
        if (!promo || !draft) return;
        const result = savePromo(promo, ctx.staff.id);
        if ('error' in result) {
          promoError = result.error;
          showText(root, 'promo-error', promoError);
          return;
        }
        if (editing === 'new') {
          draft.promoId = result.promo.id;
          note = `${result.promo.name} added and ticked. Save the package to keep it on.`;
        } else {
          note = `${result.promo.name} saved for every package on it.`;
        }
        ctx.toast(`${result.promo.name} · ${result.promo.percent}% off saved`);
        editing = null;
        promo = null;
        redraw();
      },

      'save-package': ({ ctx, root }) => {
        if (!draft) return;
        const result = savePackage(draft, ctx.staff.id);
        if ('error' in result) {
          error = result.error;
          showText(root, 'error', error);
          return;
        }
        ctx.toast(`${draft.name.trim()} ${id ? 'saved' : 'added'} · ${peso(draft.price)}`);
        ctx.closeDrawer();
      },

      'ask-delete-package': ({ redraw }) => {
        confirmDelete = true;
        redraw();
      },

      'keep-package': ({ redraw }) => {
        confirmDelete = false;
        redraw();
      },

      'confirm-delete-package': ({ ctx, root }) => {
        const result = deletePackage(kind, id, ctx.staff.id);
        if ('error' in result) {
          error = result.error;
          confirmDelete = false;
          showText(root, 'error', error);
          return;
        }
        ctx.toast(`${draft?.name ?? 'Package'} deleted`, 'warning');
        ctx.closeDrawer();
      },
    },
  };
}

// ---------- A promotion on its own ----------

/** Edit or add a promotion from the Promotions table, without a package. */
export function createPromoForm(id = ''): DrawerContent {
  let promo: PromoDraft | null = null;
  let promoError = '';

  return {
    live: false,
    title: (ctx: DeskContext) => (id ? ctx.state.promos.find((item) => item.id === id)?.name ?? 'Promotion' : 'New promotion'),

    render(ctx) {
      if (!promo) promo = promoDraft(ctx.state, id);
      const used = id ? ctx.state.promos.find((item) => item.id === id)?.appliesTo.length ?? 0 : 0;
      return html`
        <div class="booking-form">
          <p class="small muted">${id
            ? `On ${used} package${used === 1 ? '' : 's'}. Changes apply to all of them. Put a package on it from that package's Edit.`
            : 'Once it is added, put packages on it from each package’s Edit.'}</p>
          ${promoEditor(promo, promoError, 'save-promo-alone', 'close-drawer')}
        </div>`;
    },

    inputs: {
      promo: ({ el, root }) => {
        if (!promo) return;
        readPromoField(promo, el);
        promoError = '';
        showText(root, 'promo-error', '');
      },
    },

    actions: {
      'save-promo-alone': ({ ctx, root }) => {
        if (!promo) return;
        const result = savePromo(promo, ctx.staff.id);
        if ('error' in result) {
          promoError = result.error;
          showText(root, 'promo-error', promoError);
          return;
        }
        ctx.toast(`${result.promo.name} · ${result.promo.percent}% off saved`);
        ctx.closeDrawer();
      },
    },
  };
}
