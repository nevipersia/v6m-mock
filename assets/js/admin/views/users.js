// Users: who can sign in, what they can do, and pending invites.
// Only accounts with users.manage reach this page.

import { inviteUser, revokeInvite, setUserStatus, updateUser } from '../../core/actions.js';
import { html } from '../../core/dom.js';
import { formatDateTime, plural } from '../../core/format.js';
import { findStaff } from '../../core/rules.js';
import {
  PERMISSIONS, PERMISSION_IDS, ROLE_DEFAULTS, ROLE_LABELS, ROLE_SUMMARIES,
} from '../auth.js';
import { avatar } from '../components/badges.js';
import { icon } from '../components/icons.js';
import { emptyState, pageHead } from '../layout.js';

const blankDraft = () => ({ name: '', email: '', role: 'staff', permissions: [...ROLE_DEFAULTS.staff] });

const ui = { adding: false, draft: blankDraft(), editingId: null, error: '', lastInvite: null };

const STATUS_TONES = { active: 'success', invited: 'warning', suspended: 'neutral' };
const STATUS_LABELS = { active: 'Active', invited: 'Invite sent', suspended: 'Suspended' };

function permissionList(staff) {
  const granted = PERMISSIONS.filter((permission) => staff.permissions.includes(permission.id));
  if (!granted.length) return html`<span class="small muted">No permissions yet</span>`;
  return html`<span class="chip-row">${granted.map((permission) => html`<span class="pill pill--neutral">${permission.label}</span>`)}</span>`;
}

function permissionCheckboxes(selected, inputName) {
  return html`
    <fieldset class="form-section">
      <legend class="form-section__title">Can do</legend>
      <div class="permission-grid">
        ${PERMISSIONS.map((permission) => html`
          <label class="permission">
            <input type="checkbox" data-input="${inputName}" name="${permission.id}" ${selected.includes(permission.id) ? 'checked' : ''}>
            <span>
              <strong>${permission.label}</strong>
              <span class="small muted">${permission.detail}</span>
            </span>
          </label>`)}
      </div>
    </fieldset>`;
}

const roleOptions = (selected) => Object.keys(ROLE_LABELS).map((role) => html`
  <option value="${role}" ${role === selected ? 'selected' : ''}>${ROLE_LABELS[role]}</option>`);

function inviteForm() {
  return html`
    <form class="panel invite-form" data-submit="save-invite" novalidate>
      <h2 class="panel__title">Invite someone</h2>
      <p class="small muted">They get a single-use code. The account only works once the code is redeemed.</p>
      <div class="form-grid">
        <label class="field">
          <span class="field__label">Name</span>
          <input class="input" name="name" data-input="draft" value="${ui.draft.name}" placeholder="Ana Reyes" autocomplete="off">
        </label>
        <label class="field">
          <span class="field__label">Email</span>
          <input class="input" name="email" data-input="draft" value="${ui.draft.email}" placeholder="ana@v6mresort.example" autocomplete="off">
        </label>
        <label class="field">
          <span class="field__label">Role</span>
          <select class="input" name="role" data-input="draft">${roleOptions(ui.draft.role)}</select>
        </label>
      </div>
      ${permissionCheckboxes(ui.draft.permissions, 'draft-permission')}
      <p class="form-error">${ui.error}</p>
      <div class="button-row button-row--end">
        <button class="btn btn--quiet" type="button" data-action="cancel-invite">Cancel</button>
        <button class="btn btn--primary" type="submit">Create invite</button>
      </div>
    </form>`;
}

function inviteBanner(state) {
  if (!ui.lastInvite) return '';
  const staff = findStaff(state, ui.lastInvite.staffId);
  return html`
    <div class="invite-banner">
      <div>
        <p class="small muted">Invite code for ${staff?.name ?? 'the new account'}</p>
        <p class="invite-banner__code mono">${ui.lastInvite.code}</p>
      </div>
      <div class="button-row">
        <button class="btn btn--secondary btn--sm" type="button" data-action="copy-invite" data-code="${ui.lastInvite.code}">${icon('copy')} Copy code</button>
        <button class="btn btn--quiet btn--sm" type="button" data-action="dismiss-invite">Done</button>
      </div>
    </div>`;
}

function userCard(ctx, staff) {
  const editing = ui.editingId === staff.id;
  const isSelf = staff.id === ctx.staff.id;
  const invite = ctx.state.invites.find((item) => item.staffId === staff.id && !item.usedAt);

  return html`
    <article class="user-card">
      <header class="user-card__head">
        ${avatar(staff.name)}
        <div class="user-card__who">
          <strong>${staff.name}${isSelf ? html` <span class="small muted">(you)</span>` : ''}</strong>
          <span class="small muted">${staff.email} · ${ROLE_LABELS[staff.role]}</span>
        </div>
        <span class="pill pill--${STATUS_TONES[staff.status]}">${STATUS_LABELS[staff.status]}</span>
      </header>

      ${editing ? html`
        <form class="user-card__form" data-submit="save-user" data-id="${staff.id}" novalidate>
          <label class="field">
            <span class="field__label">Role</span>
            <select class="input" name="role" data-input="edit-role" data-id="${staff.id}">${roleOptions(staff.role)}</select>
          </label>
          ${permissionCheckboxes(staff.permissions, 'edit-permission')}
          <p class="form-error">${ui.error}</p>
          <div class="button-row button-row--end">
            <button class="btn btn--quiet" type="button" data-action="cancel-edit">Done editing</button>
          </div>
        </form>` : html`
        <div class="user-card__permissions">${permissionList(staff)}</div>`}

      ${invite ? html`
        <p class="small muted">Invite code <span class="mono">${invite.code}</span> · sent ${formatDateTime(invite.createdAt)}</p>` : ''}

      <footer class="user-card__foot">
        ${staff.demo ? html`<span class="small muted">Demo account, always available on the sign-in page</span>` : ''}
        <div class="button-row">
          ${editing ? '' : html`<button class="btn btn--secondary btn--sm" type="button" data-action="edit-user" data-id="${staff.id}">Edit access</button>`}
          ${invite ? html`<button class="btn btn--quiet btn--sm" type="button" data-action="revoke-invite" data-code="${invite.code}">Revoke invite</button>` : ''}
          ${!isSelf && !staff.demo && staff.status !== 'invited' ? html`
            <button class="btn btn--quiet btn--sm" type="button" data-action="toggle-status" data-id="${staff.id}">
              ${staff.status === 'active' ? 'Suspend' : 'Reactivate'}
            </button>` : ''}
        </div>
      </footer>
    </article>`;
}

export function render(ctx) {
  const { state } = ctx;
  const active = state.staff.filter((person) => person.status === 'active').length;
  const pending = state.staff.filter((person) => person.status === 'invited').length;

  return html`
    ${pageHead({
      title: 'Users',
      subtitle: `${plural(active, 'active account')}${pending ? ` · ${plural(pending, 'pending invite')}` : ''}`,
      actions: ui.adding ? '' : html`<button class="btn btn--primary" type="button" data-action="add-user">${icon('plus')} Invite someone</button>`,
    })}

    <p class="notice">
      V6M Desk is invite only. New accounts cannot sign themselves up: you create the account here and
      send the code, and the code stops working once it is used.
    </p>

    ${inviteBanner(state)}
    ${ui.adding ? inviteForm() : ''}

    ${state.staff.length ? html`<div class="user-grid">${state.staff.map((staff) => userCard(ctx, staff))}</div>`
      : emptyState('No accounts yet', 'Invite someone to get started.')}

    <section class="panel">
      <h2 class="panel__title">What the roles mean</h2>
      <dl class="facts">
        ${Object.keys(ROLE_LABELS).map((role) => html`
          <div class="facts__row"><dt>${ROLE_LABELS[role]}</dt><dd>${ROLE_SUMMARIES[role]}</dd></div>`)}
      </dl>
      <p class="small muted">Roles are a starting point. Tick or untick anything per account.</p>
    </section>`;
}

export const inputs = {
  draft: ({ el, ctx }) => {
    ui.draft[el.name] = el.value;
    ui.error = '';
    if (el.name === 'role') {
      ui.draft.permissions = [...ROLE_DEFAULTS[el.value]];
      ctx.redraw();
    }
  },

  'draft-permission': ({ el }) => {
    const set = new Set(ui.draft.permissions);
    if (el.checked) set.add(el.name);
    else set.delete(el.name);
    ui.draft.permissions = PERMISSION_IDS.filter((id) => set.has(id));
  },

  'edit-role': ({ el, ctx }) => {
    updateUser(el.dataset.id, { role: el.value, permissions: [...ROLE_DEFAULTS[el.value]] }, ctx.staff.id);
    ctx.toast('Role updated');
  },

  'edit-permission': ({ el, ctx }) => {
    const staff = findStaff(ctx.state, ui.editingId);
    const set = new Set(staff.permissions);
    if (el.checked) set.add(el.name);
    else set.delete(el.name);
    const permissions = PERMISSION_IDS.filter((id) => set.has(id));

    if (staff.id === ctx.staff.id && !permissions.includes('users.manage')) {
      ui.error = 'You cannot remove your own access to user management.';
      ctx.redraw();
      return;
    }
    ui.error = '';
    updateUser(staff.id, { permissions }, ctx.staff.id);
  },
};

export const actions = {
  'add-user': ({ ctx }) => {
    ui.adding = true;
    ui.draft = blankDraft();
    ui.error = '';
    ctx.redraw();
  },

  'cancel-invite': ({ ctx }) => {
    ui.adding = false;
    ui.error = '';
    ctx.redraw();
  },

  'save-invite': ({ ctx }) => {
    const { name, email } = ui.draft;
    if (!name.trim()) ui.error = 'Enter a name.';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) ui.error = 'Enter an email address.';
    else if (ctx.state.staff.some((person) => person.email?.toLowerCase() === email.trim().toLowerCase())) ui.error = 'That email already has an account.';
    else ui.error = '';

    if (ui.error) {
      ctx.redraw();
      return;
    }

    const { invite } = inviteUser(ui.draft, ctx.staff.id);
    ui.adding = false;
    ui.lastInvite = invite;
    ui.draft = blankDraft();
    ctx.redraw();
    ctx.toast('Invite created');
  },

  'copy-invite': async ({ el, ctx }) => {
    try {
      await navigator.clipboard.writeText(el.dataset.code);
      ctx.toast('Invite code copied');
    } catch {
      ctx.toast('Copy blocked by the browser, write the code down instead');
    }
  },

  'dismiss-invite': ({ ctx }) => {
    ui.lastInvite = null;
    ctx.redraw();
  },

  'edit-user': ({ el, ctx }) => {
    ui.editingId = el.dataset.id;
    ui.error = '';
    ctx.redraw();
  },

  'cancel-edit': ({ ctx }) => {
    ui.editingId = null;
    ui.error = '';
    ctx.redraw();
  },

  'save-user': ({ ctx }) => {
    ui.editingId = null;
    ctx.redraw();
  },

  'revoke-invite': ({ el, ctx }) => {
    revokeInvite(el.dataset.code, ctx.staff.id);
    if (ui.lastInvite?.code === el.dataset.code) ui.lastInvite = null;
    ctx.toast('Invite revoked');
  },

  'toggle-status': ({ el, ctx }) => {
    const staff = findStaff(ctx.state, el.dataset.id);
    const next = staff.status === 'active' ? 'suspended' : 'active';
    setUserStatus(staff.id, next, ctx.staff.id);
    ctx.toast(`${staff.name} ${next === 'active' ? 'reactivated' : 'suspended'}`);
  },
};
