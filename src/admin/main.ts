// V6M Desk entry point: sign-in, hash routing, and event dispatch to views.

import { isMock } from '../core/config.js';
import { $, html, on, render } from '../core/dom.js';
import { canReset, getState, loadStore, onSaveError, resetStore, subscribe } from '../core/store.js';
import type { Staff, State } from '../core/types.js';
import { can, canView, currentStaff, hasSession, homePage, restoreSession, signOut } from './auth.js';
import { createBookingDetail } from './components/booking-detail.js';
import { createBookingForm } from './components/booking-form.js';
import { createEventForm } from './components/event-form.js';
import { createExpenseForm } from './components/expense-form.js';
import { createGuestSummary } from './components/guest-summary.js';
import { markEntering } from './components/motion.js';
import { createBookingLinkPanel } from './components/booking-link.js';
import { closeDrawer, openDrawer, syncDrawer } from './components/drawer.js';
import { jumpBy, refreshJump } from './components/jump.js';
import { showToast } from './components/toast.js';
import { renderShell, toggleNav } from './layout.js';
import { findRoute } from './routes.js';
import type { DeskContext, HandlerMap, HandlerPayload, LoginContext, Route } from './types.js';
import { loginActions, loginInputs, renderLogin } from './views/login.js';

const app = $('#app');
let activeRoute: Route | null = null;
let context: DeskContext | null = null;

const currentPageId = (): string => location.hash.replace(/^#\/?/, '').split('/')[0] ?? '';

function goHome(staff: Staff): void {
  const requested = currentPageId();
  if (!requested || !canView(staff, requested)) location.hash = `#/${homePage(staff)}`;
  draw();
}

const loginContext: LoginContext = {
  get state() {
    return getState();
  },
  redraw: () => draw(),
  toast: showToast,
  signedIn: (staff) => goHome(staff),
};

function buildContext(state: State, staff: Staff): DeskContext {
  const ctx: DeskContext = {
    state,
    staff,
    can: (permission) => can(staff, permission),
    canView: (pageId) => canView(staff, pageId),
    toast: showToast,
    redraw: () => draw(),
    openBooking: (bookingId) => openDrawer(createBookingDetail(bookingId), ctx),
    newBooking: (prefill = {}) => openDrawer(createBookingForm(prefill), ctx),
    newBookingLink: (prefill = {}) => openDrawer(createBookingLinkPanel(prefill), ctx),
    editBooking: (bookingId) => openDrawer(createBookingForm({}, { editId: bookingId }), ctx),
    newEvent: () => openDrawer(createEventForm(), ctx),
    newExpense: (expense) => openDrawer(createExpenseForm(expense), ctx),
    openGuests: (group) => openDrawer(createGuestSummary(group), ctx),
    closeDrawer,
  };
  return ctx;
}

interface SavedFocus {
  input: string;
  name: string;
  start: number | null;
  end: number | null;
}

/** Re-rendering replaces the DOM, so put the caret back in the field being typed in. */
function rememberFocus(): SavedFocus | null {
  const active = document.activeElement as HTMLInputElement | null;
  if (!active?.dataset?.input || !app.contains(active)) return null;
  let start: number | null = null;
  let end: number | null = null;
  try {
    start = active.selectionStart;
    end = active.selectionEnd;
  } catch {
    // Some input types (date, checkbox) throw when asked for a selection.
  }
  return { input: active.dataset.input, name: active.name, start, end };
}

function restoreFocus(saved: SavedFocus | null): void {
  if (!saved) return;
  const selector = `[data-input="${saved.input}"]${saved.name ? `[name="${saved.name}"]` : ''}`;
  const field = app.querySelector<HTMLInputElement>(selector);
  if (!field) return;
  field.focus();
  if (saved.start != null && typeof field.setSelectionRange === 'function') {
    try {
      field.setSelectionRange(saved.start, saved.end);
    } catch {
      // Some input types (date, checkbox) do not support selection ranges.
    }
  }
}

/** What had focus inside a pop-up, so the redrawn one can give it back. */
const focusKey = (): string | null =>
  (document.activeElement as HTMLElement | null)?.closest('dialog[data-modal]')
    ? (document.activeElement as HTMLElement).dataset.focusKey ?? null
    : null;

/**
 * A view's pop-up is a <dialog data-modal>. Each render builds a fresh one, so
 * open it as a modal again (backdrop, focus kept inside, Esc) and put focus
 * back on the control that had it before the redraw.
 */
function showModals(key: string | null): void {
  app.querySelectorAll<HTMLDialogElement>('dialog[data-modal]').forEach((dialog) => {
    if (!dialog.open) dialog.showModal();
    if (key) dialog.querySelector<HTMLElement>(`[data-focus-key="${key}"]`)?.focus();
  });
}

function drawLogin(state: State | null): void {
  activeRoute = null;
  context = null;
  closeDrawer();
  document.title = 'Sign in · V6M Desk';
  const focus = rememberFocus();
  render(app, renderLogin(state));
  restoreFocus(focus);
}

function draw(): void {
  const state = getState();
  // Supabase builds load nothing until someone signs in.
  if (!state) {
    if (!hasSession()) drawLogin(null);
    return; // otherwise a hash change landed before the data finished loading
  }
  const staff = currentStaff(state);

  if (!staff) {
    drawLogin(state);
    return;
  }

  if (currentPageId() === 'calendar') {
    location.replace('#/bookings');
    return;
  }
  const route = findRoute(currentPageId());
  if (!route || !canView(staff, route.id)) {
    location.replace(`#/${homePage(staff)}`);
    return;
  }

  const focus = rememberFocus();
  const modalFocus = focusKey();
  const modalWasOpen = !!app.querySelector('dialog[data-modal][open]');
  context = buildContext(state, staff);
  activeRoute = route;
  document.title = `${route.label} · V6M Desk`;
  render(app, renderShell(context, route, route.view.render(context)));
  restoreFocus(focus);
  markEntering(app, route.id, modalWasOpen);
  showModals(modalFocus);
  syncDrawer(context);
  // A new page has its own parts, and may not be long enough to need the buttons.
  refreshJump();
}

const globalActions: HandlerMap = {
  'sign-out': async () => {
    closeDrawer();
    history.replaceState(null, '', location.pathname);
    await signOut(); // a Supabase build reloads the page from here
    draw();
  },

  'reset-data': async () => {
    if (!canReset()) return;
    const confirmed = window.confirm('Reset the demo? Bookings, payments, invites and booking links you added in this browser will be removed.');
    if (!confirmed) return;
    closeDrawer();
    await resetStore();
    showToast('Demo data reset');
  },

  'open-booking': ({ el, ctx }) => ctx.openBooking(el.dataset.id ?? ''),

  'new-booking': ({ el, ctx }) => ctx.newBooking({ product: el.dataset.product, date: el.dataset.date }),

  'new-booking-link': ({ el, ctx }) => ctx.newBookingLink({ product: el.dataset.product, date: el.dataset.date }),

  // Flipped in place rather than redrawn: a fresh shell would start at its new
  // width, and there would be nothing for the slide to animate from.
  'toggle-nav': ({ el }) => {
    const collapsed = toggleNav();
    app.querySelector('.desk')?.classList.toggle('desk--nav-collapsed', collapsed);
    const label = collapsed ? 'Expand the menu' : 'Collapse the menu';
    el.setAttribute('aria-expanded', String(!collapsed));
    el.setAttribute('aria-label', label);
    el.title = label;
    // The page is a different width once the slide ends.
    setTimeout(refreshJump, 320);
  },

  'jump-up': () => jumpBy(-1),

  'jump-down': () => jumpBy(1),
};

type Kind = 'action' | 'input' | 'hover';

function dispatch(kind: Kind, name: string | undefined, payload: Omit<HandlerPayload, 'ctx'>): void {
  if (!name) return;
  if (!context) {
    const handlers = kind === 'input' ? loginInputs : loginActions;
    void handlers[name]?.({ ...payload, ctx: loginContext });
    return;
  }
  const handler = kind === 'input'
    ? activeRoute?.view.inputs?.[name]
    : kind === 'hover'
      ? activeRoute?.view.hovers?.[name]
      : globalActions[name] ?? activeRoute?.view.actions?.[name];
  void handler?.({ ...payload, ctx: context });
}

on(app, 'click', '[data-action]', (event, el) => dispatch('action', el.dataset.action, { el, event }));

on<HTMLFormElement>(app, 'submit', 'form[data-submit]', (event, form) => {
  event.preventDefault();
  dispatch('action', form.dataset.submit, { el: form, event });
});

on(app, 'input', '[data-input]', (event, el) => dispatch('input', el.dataset.input, { el, event }));

// Pointer or keyboard moving across something that shows a read-out. The
// handler reads event.type to tell arriving from leaving.
(['mouseover', 'mouseout', 'focusin', 'focusout'] as const).forEach((type) => {
  on(app, type, '[data-hover]', (event, el) => dispatch('hover', el.dataset.hover, { el, event }));
});

// Esc on a pop-up, and a click on its backdrop (the dialog itself, outside its
// body), both run the action the dialog names in data-cancel.
app.addEventListener('cancel', (event) => {
  const dialog = event.target as HTMLElement;
  if (!dialog.matches('dialog[data-cancel]')) return;
  event.preventDefault();
  dispatch('action', dialog.dataset.cancel, { el: dialog, event });
}, true);

on(app, 'click', 'dialog[data-cancel]', (event, dialog) => {
  if (event.target === dialog) dispatch('action', dialog.dataset.cancel, { el: dialog, event });
});

window.addEventListener('hashchange', draw);

// Which part is on screen changes as the page moves under it, so the jump
// buttons are told after the browser has settled rather than on every pixel.
let jumpPending = 0;
const scheduleJumpRefresh = (): void => {
  cancelAnimationFrame(jumpPending);
  jumpPending = requestAnimationFrame(refreshJump);
};
window.addEventListener('scroll', scheduleJumpRefresh, { passive: true });
window.addEventListener('resize', scheduleJumpRefresh);

async function start(): Promise<void> {
  subscribe(draw);
  onSaveError((error) => showToast(`Not saved: ${error.message}. Reloaded the latest data.`));
  try {
    await restoreSession();
    if (hasSession()) await loadStore();
  } catch (error) {
    render(app, html`
      <div class="app-status">
        <p><strong>${(error as Error).message}.</strong></p>
        ${isMock
          ? html`<p>Start the local server with <code>npm start</code> and open http://localhost:4789/admin/.</p>`
          : html`<p>Check your connection and reload the page. If it keeps happening, the database may be unreachable.</p>`}
      </div>`);
    return;
  }
  draw();
}

void start();
