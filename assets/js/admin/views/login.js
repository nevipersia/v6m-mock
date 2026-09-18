import { html } from '../../core/dom.js';
import { ROLE_LABELS, ROLE_SUMMARIES } from '../auth.js';
import { avatar } from '../components/badges.js';

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
        <p class="login__intro">This is a mock sign-in. Pick a sample staff account to see what that role can do. There are no passwords.</p>

        <ul class="staff-list">
          ${state.staff.map((person) => html`
            <li>
              <button class="staff-option" type="button" data-action="sign-in" data-staff="${person.id}">
                ${avatar(person.name)}
                <span class="staff-option__text">
                  <strong>${person.name}</strong>
                  <span class="staff-option__role">${ROLE_LABELS[person.role]} · ${ROLE_SUMMARIES[person.role]}</span>
                </span>
              </button>
            </li>`)}
        </ul>

        <a class="login__back" href="../">Back to the guest website</a>
      </div>
    </main>`;
}
