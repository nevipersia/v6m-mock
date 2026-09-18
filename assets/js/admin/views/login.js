// Sign-in: two demo accounts, or an invite code for everyone else.
// V6M Desk is invite only, so there is no self sign-up.

import { redeemInvite } from '../../core/actions.js';
import { html } from '../../core/dom.js';
import { ROLE_LABELS, ROLE_SUMMARIES, signIn } from '../auth.js';
import { avatar } from '../components/badges.js';
import { icon } from '../components/icons.js';

const ui = { showInvite: false, code: '', error: '' };

export function renderLogin(state) {
  const demoAccounts = state.staff.filter((person) => person.demo && person.status === 'active');

  return html`
    <main class="login">
      <div class="login__card">
        <div class="login__brand">
          <img src="../assets/img/logo.svg" alt="" width="52" height="52">
          <div>
            <p class="script login__eyebrow">Welcome back</p>
            <h1 class="login__title">V6M Desk</h1>
          </div>
        </div>

        <p class="login__intro">
          This desk is invite only. Sign in with a demo account to look around, or redeem the invite
          code the owner sent you.
        </p>

        <ul class="staff-list">
          ${demoAccounts.map((person) => html`
            <li>
              <button class="staff-option" type="button" data-action="sign-in" data-staff="${person.id}">
                ${avatar(person.name)}
                <span class="staff-option__text">
                  <strong>${person.name}</strong>
                  <span class="staff-option__role">${ROLE_LABELS[person.role]} · ${ROLE_SUMMARIES[person.role]}</span>
                </span>
                <span class="pill pill--neutral">Demo</span>
              </button>
            </li>`)}
        </ul>

        ${ui.showInvite ? html`
          <form class="login__invite" data-submit="redeem-invite" novalidate>
            <label class="field">
              <span class="field__label">Invite code</span>
              <input class="input" name="code" value="${ui.code}" data-input="code" placeholder="V6M-4KQ7RX" autocomplete="off" spellcheck="false">
            </label>
            <p class="form-error">${ui.error}</p>
            <div class="button-row button-row--end">
              <button class="btn btn--quiet" type="button" data-action="hide-invite">Cancel</button>
              <button class="btn btn--primary" type="submit">Join the desk</button>
            </div>
          </form>` : html`
          <button class="btn btn--secondary btn--block login__invite-toggle" type="button" data-action="show-invite">
            ${icon('key')} I have an invite code
          </button>`}

        <a class="login__back" href="../">Back to the guest website</a>
      </div>
    </main>`;
}

export const loginActions = {
  'sign-in': ({ el, ctx }) => {
    signIn(el.dataset.staff);
    ctx.signedIn();
  },

  'show-invite': ({ ctx }) => {
    ui.showInvite = true;
    ui.code = '';
    ui.error = '';
    ctx.redraw();
  },

  'hide-invite': ({ ctx }) => {
    ui.showInvite = false;
    ui.code = '';
    ui.error = '';
    ctx.redraw();
  },

  'redeem-invite': ({ ctx }) => {
    if (!ui.code.trim()) {
      ui.error = 'Enter the code from your invite.';
      ctx.redraw();
      return;
    }
    const staff = redeemInvite(ui.code);
    if (!staff) {
      ui.error = 'That code is not valid, or it has already been used.';
      ctx.redraw();
      return;
    }
    ui.code = '';
    ui.showInvite = false;
    signIn(staff.id);
    ctx.signedIn();
  },
};

export const loginInputs = {
  code: ({ el }) => {
    ui.code = el.value;
    ui.error = '';
  },
};
