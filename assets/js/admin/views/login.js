// Sign-in: email and password. V6M Desk is invite only, so new accounts come
// from an invite code, which is also where the person sets their password.

import { redeemInvite } from '../../core/actions.js';
import { html } from '../../core/dom.js';
import { ROLE_LABELS, signIn, signInWithPassword } from '../auth.js';
import { icon } from '../components/icons.js';

const ui = {
  mode: 'password', // or 'invite'
  email: '',
  password: '',
  code: '',
  newPassword: '',
  error: '',
};

function demoHints(state) {
  const demoAccounts = state.staff.filter((person) => person.demo && person.password);
  if (!demoAccounts.length) return '';

  return html`
    <div class="login__demos">
      <p class="field__label">Demo accounts</p>
      ${demoAccounts.map((person) => html`
        <button class="demo-account" type="button" data-action="use-demo" data-staff="${person.id}">
          <span class="demo-account__text">
            <strong>${ROLE_LABELS[person.role]}</strong>
            <span class="small muted">${person.email} · ${person.password}</span>
          </span>
          <span class="pill pill--neutral">Fill in</span>
        </button>`)}
      <p class="small muted">Mock passwords, kept in plain text in the sample data.</p>
    </div>`;
}

export function renderLogin(state) {
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

        ${ui.mode === 'password' ? html`
          <p class="login__intro">Sign in with your work email. Accounts are created by the owner.</p>

          <form class="login__form" data-submit="sign-in" novalidate>
            <label class="field">
              <span class="field__label">Email</span>
              <input class="input" name="email" data-input="email" type="email" value="${ui.email}"
                placeholder="joy@v6mresort.example" autocomplete="username" spellcheck="false">
            </label>
            <label class="field">
              <span class="field__label">Password</span>
              <input class="input" name="password" data-input="password" type="password" value="${ui.password}"
                placeholder="Your password" autocomplete="current-password">
            </label>
            <p class="form-error">${ui.error}</p>
            <button class="btn btn--primary btn--block" type="submit">Sign in</button>
          </form>

          ${demoHints(state)}

          <button class="btn btn--secondary btn--block login__invite-toggle" type="button" data-action="show-invite">
            ${icon('key')} I have an invite code
          </button>` : html`
          <p class="login__intro">Enter the code the owner sent you and pick a password for your account.</p>

          <form class="login__form" data-submit="redeem-invite" novalidate>
            <label class="field">
              <span class="field__label">Invite code</span>
              <input class="input" name="code" data-input="code" value="${ui.code}" placeholder="V6M-4KQ7RX"
                autocomplete="off" spellcheck="false">
            </label>
            <label class="field">
              <span class="field__label">Choose a password</span>
              <input class="input" name="newPassword" data-input="newPassword" type="password" value="${ui.newPassword}"
                placeholder="At least 8 characters" autocomplete="new-password">
            </label>
            <p class="form-error">${ui.error}</p>
            <div class="button-row button-row--end">
              <button class="btn btn--quiet" type="button" data-action="hide-invite">Back</button>
              <button class="btn btn--primary" type="submit">Join the desk</button>
            </div>
          </form>`}
      </div>
    </main>`;
}

export const loginActions = {
  'use-demo': ({ el, ctx }) => {
    const person = ctx.state.staff.find((staff) => staff.id === el.dataset.staff);
    ui.email = person.email;
    ui.password = person.password;
    ui.error = '';
    ctx.redraw();
  },

  'sign-in': ({ ctx }) => {
    if (!ui.email.trim() || !ui.password) {
      ui.error = 'Enter your email and password.';
      ctx.redraw();
      return;
    }
    const { staff, error } = signInWithPassword(ctx.state, ui.email, ui.password);
    if (error) {
      ui.error = error;
      ctx.redraw();
      return;
    }
    ui.password = '';
    ui.error = '';
    ctx.signedIn(staff);
  },

  'show-invite': ({ ctx }) => {
    ui.mode = 'invite';
    ui.code = '';
    ui.newPassword = '';
    ui.error = '';
    ctx.redraw();
  },

  'hide-invite': ({ ctx }) => {
    ui.mode = 'password';
    ui.code = '';
    ui.newPassword = '';
    ui.error = '';
    ctx.redraw();
  },

  'redeem-invite': ({ ctx }) => {
    if (!ui.code.trim()) ui.error = 'Enter the code from your invite.';
    else if (ui.newPassword.length < 8) ui.error = 'Pick a password of at least 8 characters.';
    else ui.error = '';

    if (ui.error) {
      ctx.redraw();
      return;
    }

    const staff = redeemInvite(ui.code, ui.newPassword);
    if (!staff) {
      ui.error = 'That code is not valid, or it has already been used.';
      ctx.redraw();
      return;
    }

    ui.mode = 'password';
    ui.code = '';
    ui.newPassword = '';
    ui.password = '';
    signIn(staff.id);
    ctx.signedIn(staff);
  },
};

export const loginInputs = {
  email: ({ el }) => { ui.email = el.value; ui.error = ''; },
  password: ({ el }) => { ui.password = el.value; ui.error = ''; },
  code: ({ el }) => { ui.code = el.value; ui.error = ''; },
  newPassword: ({ el }) => { ui.newPassword = el.value; ui.error = ''; },
};
