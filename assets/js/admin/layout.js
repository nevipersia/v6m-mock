// App shell: sidebar, top bar, mobile tab bar, and the shared page header.

import { html } from '../core/dom.js';
import { formatDate } from '../core/format.js';
import { ROLE_LABELS, canView } from './auth.js';
import { avatar } from './components/badges.js';
import { icon } from './components/icons.js';
import { ROUTES } from './routes.js';

function navCount(state, routeId) {
  if (routeId === 'inbox') return state.inquiries.filter((inquiry) => inquiry.status === 'new').length;
  if (routeId === 'users') return state.staff.filter((person) => person.status === 'invited').length;
  return 0;
}

function navLinks(ctx, activeId, className) {
  return ROUTES.filter((route) => canView(ctx.staff, route.id)).map((route) => {
    const count = navCount(ctx.state, route.id);
    const active = route.id === activeId;
    return html`
      <a class="${className} ${active ? 'is-active' : ''}" href="#/${route.id}" ${active ? html`aria-current="page"` : ''}>
        ${icon(route.icon)}
        <span class="${className}__label">${route.label}</span>
        ${count ? html`<span class="${className}__count" aria-label="${count} need attention">${count}</span>` : ''}
      </a>`;
  });
}

export function renderShell(ctx, route, content) {
  const { staff, state } = ctx;
  return html`
    <div class="desk">
      <aside class="sidebar">
        <a class="sidebar__brand" href="#/">
          <img src="../assets/img/logo.svg" alt="" width="34" height="34">
          <span>V6M Desk</span>
        </a>
        <nav class="sidebar__nav" aria-label="Sections">${navLinks(ctx, route.id, 'nav-link')}</nav>
        <a class="nav-link sidebar__site" href="../">${icon('globe')}<span class="nav-link__label">Guest website</span></a>
      </aside>

      <div class="desk__main">
        <header class="topbar">
          <span class="pill pill--brand" title="The mock data is frozen on this date">Demo date · ${formatDate(state.meta.asOf, 'short')}</span>
          <div class="topbar__actions">
            <button class="btn btn--quiet btn--sm" type="button" data-action="reset-data">
              ${icon('refresh')}<span class="topbar__hide-sm">Reset data</span>
            </button>
            <div class="topbar__user">
              ${avatar(staff.name)}
              <span class="topbar__who">
                <strong>${staff.name}</strong>
                <small>${ROLE_LABELS[staff.role]}</small>
              </span>
            </div>
            <button class="btn btn--quiet btn--icon" type="button" data-action="sign-out" aria-label="Sign out" title="Sign out">
              ${icon('logout')}
            </button>
          </div>
        </header>

        <main class="page" id="main">${content}</main>
      </div>

      <nav class="tabbar" aria-label="Sections">${navLinks(ctx, route.id, 'tab')}</nav>
    </div>`;
}

/** Page title block used at the top of every view. */
export function pageHead({ eyebrow, title, subtitle, actions }) {
  return html`
    <header class="page-head">
      <div>
        ${eyebrow ? html`<p class="script page-head__eyebrow">${eyebrow}</p>` : ''}
        <h1 class="page-head__title">${title}</h1>
        ${subtitle ? html`<p class="page-head__subtitle">${subtitle}</p>` : ''}
      </div>
      ${actions ? html`<div class="page-head__actions">${actions}</div>` : ''}
    </header>`;
}

export function emptyState(title, text) {
  return html`
    <div class="empty">
      <p class="empty__title">${title}</p>
      ${text ? html`<p class="empty__text">${text}</p>` : ''}
    </div>`;
}
