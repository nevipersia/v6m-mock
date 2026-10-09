// Users: who can sign in, their role, and pending invites.
// Only owners (users.manage) reach this page.

import { inviteUser, revokeInvite, setUserRole, setUserStatus } from '../../core/actions.js';
import { html, type SafeHTML } from '../../core/dom.js';
import { formatDateTime, plural } from '../../core/format.js';
import { findStaff } from '../../core/rules.js';
import type { Invite, Role, Staff, StaffStatus, State } from '../../core/types.js';
import type { Tone } from '../components/badges.js';
import type { DeskContext, HandlerMap } from '../types.js';
import { ROLES, ROLE_LABELS, ROLE_SUMMARIES } from '../auth.js';
import { avatar } from '../components/badges.js';
import { askConfirm } from '../components/confirm.js';
import { icon } from '../components/icons.js';
import { emptyState, pageHead } from '../layout.js';

interface UserDraft {
  name: string;
  email: string;
  role: Role;
}

const blankDraft = (): UserDraft => ({ name: '', email: '', role: 'manager' });

const ui: { adding: boolean; draft: UserDraft; editingId: string | null; error: string; lastInvite: Invite | null } = {
  adding: false, draft: blankDraft(), editingId: null, error: '', lastInvite: null,
};

const STATUS_TONES: Record<StaffStatus, Tone> = { active: 'success', invited: 'warning', suspended: 'neutral' };
const STATUS_LABELS: Record<StaffStatus, string> = { active: 'Active', invited: 'Invite sent', suspended: 'Suspended' };

const isRole = (value: string): value is Role => (ROLES as string[]).includes(value);
const roleOptions = (selected: Role): SafeHTML[] => ROLES.map((role) => html`
  <option value="${role}" ${role === selected ? 'selected' : ''}>${ROLE_LABELS[role]}</option>`);

function inviteForm(): SafeHTML {
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
      <p class="small muted">${ROLE_SUMMARIES[ui.draft.role]}.</p>
      <p class="form-error">${ui.error}</p>
      <div class="button-row button-row--end">
        <button class="btn btn--quiet" type="button" data-action="cancel-invite">Cancel</button>
        <button class="btn btn--primary" type="submit">Create invite</button>
      </div>
    </form>`;
}

function inviteBanner(state: State): SafeHTML | '' {
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

function userCard(ctx: DeskContext, staff: Staff): SafeHTML {
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
          <p class="small muted">${ROLE_SUMMARIES[staff.role]}.</p>
          <p class="form-error">${ui.error}</p>
          <div class="button-row button-row--end">
            <button class="btn btn--quiet" type="button" data-action="cancel-edit">Done editing</button>
          </div>
        </form>` : ''}

      ${invite ? html`
        <p class="small muted">Invite code <span class="mono">${invite.code}</span> · sent ${formatDateTime(invite.createdAt)}</p>` : ''}

      <footer class="user-card__foot">
        ${staff.demo ? html`<span class="small muted">Demo account, always available on the sign-in page</span>` : ''}
        <div class="button-row">
          ${editing || isSelf ? '' : html`<button class="btn btn--secondary btn--sm" type="button" data-action="edit-user" data-id="${staff.id}">Change role</button>`}
          ${invite ? html`<button class="btn btn--quiet btn--sm" type="button" data-action="revoke-invite" data-code="${invite.code}">Revoke invite</button>` : ''}
          ${!isSelf && !staff.demo && staff.status !== 'invited' ? html`
            <button class="btn btn--quiet btn--sm" type="button" data-action="toggle-status" data-id="${staff.id}">
              ${staff.status === 'active' ? 'Suspend' : 'Reactivate'}
            </button>` : ''}
        </div>
      </footer>
    </article>`;
}

export function render(ctx: DeskContext): SafeHTML {
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
        ${ROLES.map((role) => html`
          <div class="facts__row"><dt>${ROLE_LABELS[role]}</dt><dd>${ROLE_SUMMARIES[role]}</dd></div>`)}
      </dl>
    </section>`;
}

export const inputs: HandlerMap = {
  draft: ({ el, ctx }) => {
    const { name, value } = el as HTMLInputElement | HTMLSelectElement;
    ui.error = '';
    if (name === 'name' || name === 'email') ui.draft[name] = value;
    if (name === 'role' && isRole(value)) {
      ui.draft.role = value;
      ctx.redraw();
    }
  },

  'edit-role': ({ el, ctx }) => {
    const { value } = el as HTMLSelectElement;
    const staff = findStaff(ctx.state, el.dataset.id);
    if (!isRole(value) || !staff || staff.role === value) return;
    // Your own role stays put, so the desk always keeps an owner.
    if (staff.id === ctx.staff.id) return;
    setUserRole(staff.id, value, ctx.staff.id);
    ctx.toast(`${staff.name} is now ${value === 'owner' ? 'an owner' : 'a manager'}`);
  },
};

export const actions: HandlerMap = {
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
      await navigator.clipboard.writeText(el.dataset.code ?? '');
      ctx.toast('Invite code copied', 'info');
    } catch {
      ctx.toast('Copy blocked by the browser, write the code down instead', 'warning');
    }
  },

  'dismiss-invite': ({ ctx }) => {
    ui.lastInvite = null;
    ctx.redraw();
  },

  'edit-user': ({ el, ctx }) => {
    ui.editingId = el.dataset.id ?? null;
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

  'revoke-invite': async ({ el, ctx }) => {
    const invite = ctx.state.invites.find((item) => item.code === el.dataset.code);
    const person = invite ? findStaff(ctx.state, invite.staffId) : undefined;
    const answer = await askConfirm({
      title: 'Revoke this invite?',
      message: `${person ? `${person.name}'s` : 'The'} invite code stops working. You can send a new invite later.`,
      confirmLabel: 'Revoke invite',
      keepLabel: 'Keep invite',
    });
    if (!answer) return;
    revokeInvite(el.dataset.code ?? '', ctx.staff.id);
    if (ui.lastInvite?.code === el.dataset.code) ui.lastInvite = null;
    ctx.toast('Invite revoked', 'warning');
  },

  'toggle-status': async ({ el, ctx }) => {
    const staff = findStaff(ctx.state, el.dataset.id);
    if (!staff) return;
    const next: StaffStatus = staff.status === 'active' ? 'suspended' : 'active';
    if (next === 'suspended') {
      const answer = await askConfirm({
        title: `Suspend ${staff.name}?`,
        message: 'They are signed out and can no longer use the desk until you reactivate them. Their bookings and history stay.',
        confirmLabel: 'Suspend',
        keepLabel: 'Keep access',
      });
      if (!answer) return;
    }
    setUserStatus(staff.id, next, ctx.staff.id);
    ctx.toast(`${staff.name} ${next === 'active' ? 'reactivated' : 'suspended'}`, next === 'active' ? 'success' : 'warning');
  },
};
