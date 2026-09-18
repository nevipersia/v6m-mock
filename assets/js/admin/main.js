// V6M Desk entry point: sign-in, hash routing, and event dispatch to views.

import { $, html, on, render } from '../core/dom.js';
import { getState, loadStore, resetStore, subscribe } from '../core/store.js';
import { can, canView, currentStaff, homePage, signOut } from './auth.js';
import { createBookingDetail } from './components/booking-detail.js';
import { createBookingForm } from './components/booking-form.js';
import { createBookingLinkPanel } from './components/booking-link.js';
import { closeDrawer, openDrawer, syncDrawer } from './components/drawer.js';
import { showToast } from './components/toast.js';
import { renderShell } from './layout.js';
import { findRoute } from './routes.js';
import { loginActions, loginInputs, renderLogin } from './views/login.js';

const app = $('#app');
let activeRoute = null;
let context = null;

const currentPageId = () => location.hash.replace(/^#\/?/, '').split('/')[0];

function goHome(staff) {
  const requested = currentPageId();
  if (!requested || !canView(staff, requested)) location.hash = `#/${homePage(staff)}`;
  draw();
}

/** Context for the signed-out screen: it only needs to redraw and hand over. */
const loginContext = {
  redraw: () => draw(),
  toast: showToast,
  signedIn: () => goHome(currentStaff(getState())),
};

function buildContext(state, staff) {
  const ctx = {
    state,
    staff,
    can: (permission) => can(staff, permission),
    canView: (pageId) => canView(staff, pageId),
    toast: showToast,
    redraw: () => draw(),
  };
  ctx.openBooking = (bookingId) => openDrawer(createBookingDetail(bookingId), ctx);
  ctx.newBooking = (prefill = {}) => openDrawer(createBookingForm(prefill), ctx);
  ctx.newBookingLink = () => openDrawer(createBookingLinkPanel(), ctx);
  return ctx;
}

/** Re-rendering replaces the DOM, so put the caret back in the field being typed in. */
function rememberFocus() {
  const active = document.activeElement;
  if (!active?.dataset?.input || !app.contains(active)) return null;
  return { input: active.dataset.input, name: active.name, start: active.selectionStart, end: active.selectionEnd };
}

function restoreFocus(saved) {
  if (!saved) return;
  const selector = `[data-input="${saved.input}"]${saved.name ? `[name="${saved.name}"]` : ''}`;
  const field = app.querySelector(selector);
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

function draw() {
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

const globalActions = {
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

  'open-booking': ({ el, ctx }) => ctx.openBooking(el.dataset.id),

  'new-booking': ({ el, ctx }) => ctx.newBooking({ product: el.dataset.product, date: el.dataset.date }),

  'new-booking-link': ({ ctx }) => ctx.newBookingLink(),
};

function dispatch(kind, name, payload) {
  if (!context) {
    const handlers = kind === 'input' ? loginInputs : loginActions;
    handlers[name]?.({ ...payload, ctx: loginContext });
    return;
  }
  if (kind === 'input') {
    activeRoute?.view.inputs?.[name]?.({ ...payload, ctx: context });
    return;
  }
  const handler = globalActions[name] ?? activeRoute?.view.actions?.[name];
  handler?.({ ...payload, ctx: context });
}

on(app, 'click', '[data-action]', (event, el) => dispatch('action', el.dataset.action, { el, event }));

on(app, 'submit', 'form[data-submit]', (event, form) => {
  event.preventDefault();
  dispatch('action', form.dataset.submit, { el: form, event });
});

on(app, 'input', '[data-input]', (event, el) => dispatch('input', el.dataset.input, { el, event }));

window.addEventListener('hashchange', draw);

async function start() {
  try {
    await loadStore();
  } catch (error) {
    render(app, html`
      <div class="app-status">
        <p><strong>${error.message}.</strong></p>
        <p>Start the local server with <code>npm start</code> and open http://localhost:4789/admin/.</p>
      </div>`);
    return;
  }
  subscribe(draw);
  draw();
}

start();
