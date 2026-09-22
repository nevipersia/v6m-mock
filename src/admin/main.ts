// V6M Desk entry point: sign-in, hash routing, and event dispatch to views.

import { $, html, on, render } from '../core/dom.js';
import { getState, loadStore, requireState, resetStore, subscribe } from '../core/store.js';
import type { Staff, State } from '../core/types.js';
import { can, canView, currentStaff, homePage, signOut } from './auth.js';
import { createBookingDetail } from './components/booking-detail.js';
import { createBookingForm } from './components/booking-form.js';
import { createBookingLinkPanel } from './components/booking-link.js';
import { closeDrawer, openDrawer, syncDrawer } from './components/drawer.js';
import { showToast } from './components/toast.js';
import { renderShell } from './layout.js';
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
    return requireState();
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
    newBookingLink: () => openDrawer(createBookingLinkPanel(), ctx),
    editBooking: (bookingId) => openDrawer(createBookingForm({}, { editId: bookingId }), ctx),
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

function draw(): void {
  const state = getState();
  if (!state) return; // a hash change can land before the data finishes loading
  const staff = currentStaff(state);

  if (!staff) {
    activeRoute = null;
    context = null;
    closeDrawer();
    document.title = 'Sign in · V6M Desk';
    const focus = rememberFocus();
    render(app, renderLogin(state));
    restoreFocus(focus);
    return;
  }

  const route = findRoute(currentPageId());
  if (!route || !canView(staff, route.id)) {
    location.replace(`#/${homePage(staff)}`);
    return;
  }

  const focus = rememberFocus();
  context = buildContext(state, staff);
  activeRoute = route;
  document.title = `${route.label} · V6M Desk`;
  render(app, renderShell(context, route, route.view.render(context)));
  restoreFocus(focus);
  syncDrawer(context);
}

const globalActions: HandlerMap = {
  'sign-out': () => {
    signOut();
    closeDrawer();
    history.replaceState(null, '', location.pathname);
    draw();
  },

  'reset-data': async () => {
    const confirmed = window.confirm('Reset the demo? Bookings, payments, invites and booking links you added in this browser will be removed.');
    if (!confirmed) return;
    closeDrawer();
    await resetStore();
    showToast('Demo data reset');
  },

  'open-booking': ({ el, ctx }) => ctx.openBooking(el.dataset.id ?? ''),

  'new-booking': ({ el, ctx }) => ctx.newBooking({ product: el.dataset.product, date: el.dataset.date }),

  'new-booking-link': ({ ctx }) => ctx.newBookingLink(),
};

type Kind = 'action' | 'input';

function dispatch(kind: Kind, name: string | undefined, payload: Omit<HandlerPayload, 'ctx'>): void {
  if (!name) return;
  if (!context) {
    const handlers = kind === 'input' ? loginInputs : loginActions;
    void handlers[name]?.({ ...payload, ctx: loginContext });
    return;
  }
  const handler = kind === 'input'
    ? activeRoute?.view.inputs?.[name]
    : globalActions[name] ?? activeRoute?.view.actions?.[name];
  void handler?.({ ...payload, ctx: context });
}

on(app, 'click', '[data-action]', (event, el) => dispatch('action', el.dataset.action, { el, event }));

on<HTMLFormElement>(app, 'submit', 'form[data-submit]', (event, form) => {
  event.preventDefault();
  dispatch('action', form.dataset.submit, { el: form, event });
});

on(app, 'input', '[data-input]', (event, el) => dispatch('input', el.dataset.input, { el, event }));

window.addEventListener('hashchange', draw);

async function start(): Promise<void> {
  try {
    await loadStore();
  } catch (error) {
    render(app, html`
      <div class="app-status">
        <p><strong>${(error as Error).message}.</strong></p>
        <p>Start the local server with <code>npm start</code> and open http://localhost:4789/admin/.</p>
      </div>`);
    return;
  }
  subscribe(draw);
  draw();
}

void start();
