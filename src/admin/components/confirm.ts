// The "Are you sure?" pop-up in the middle of the screen, asked before anything
// is deleted or cancelled. It sits above a side panel, Esc or the backdrop keep
// things as they were, and focus starts on the safe button.
//
//   const answer = await askConfirm({ title: 'Delete Cottage A?', confirmLabel: 'Delete' });
//   if (!answer) return;

import { html, render, type SafeHTML } from '../../core/dom.js';
import { icon } from './icons.js';

export interface ConfirmOptions {
  title: string;
  /** What will happen, in a sentence or two. */
  message?: string | SafeHTML;
  /** The button that goes ahead: "Delete", "Cancel booking". */
  confirmLabel: string;
  /** The button that backs out. */
  keepLabel?: string;
  /** A short list to choose from first, such as the cancellation reason. */
  choice?: { label: string; options: string[] };
  /** Points to look at before going ahead, shown as a warning list. */
  warnings?: string[];
  /**
   * Something to type before going ahead, such as a reference number. `check`
   * returns why it won't do ('' when it will); the pop-up stays open until it does.
   */
  input?: { label: string; placeholder?: string; hint?: string; numeric?: boolean; check: (value: string) => string };
  /** Red for anything that removes or cancels; plain for the rest. */
  tone?: 'danger' | 'plain';
}

/**
 * Resolves with the chosen option and the typed value ('' when there is none),
 * or null when staff backed out.
 */
export function askConfirm(options: ConfirmOptions): Promise<{ choice: string; value: string } | null> {
  const { title, message, confirmLabel, keepLabel = 'Keep it', choice, warnings = [], input, tone = 'danger' } = options;
  // A double click asks once.
  if (document.querySelector('dialog.confirm-modal')) return Promise.resolve(null);
  const returnTo = document.activeElement as HTMLElement | null;

  const dialog = document.createElement('dialog');
  dialog.className = 'report-modal confirm-modal is-entering';
  dialog.setAttribute('aria-labelledby', 'confirm-title');
  dialog.setAttribute('role', 'alertdialog');
  render(dialog, html`
    <header class="report-modal__head">
      <h2 class="picker__title" id="confirm-title">${title}</h2>
      <button class="picker__icon" type="button" data-answer="keep" aria-label="Close">${icon('x')}</button>
    </header>
    <div class="report-modal__main">
      ${message ? html`<p class="confirm-modal__message">${message}</p>` : ''}
      ${warnings.length ? html`
        <div class="confirm-modal__warn" role="note">
          <p class="confirm-modal__warn-title">${icon('alert')} Check before you confirm</p>
          <ul>${warnings.map((warning) => html`<li>${warning}</li>`)}</ul>
        </div>` : ''}
      ${choice ? html`
        <label class="field">
          <span class="field__label">${choice.label}</span>
          <select class="input" name="confirmChoice">
            ${choice.options.map((option) => html`<option>${option}</option>`)}
          </select>
        </label>` : ''}
      ${input ? html`
        <label class="field">
          <span class="field__label">${input.label}</span>
          <input class="input ${input.numeric ? 'mono' : ''}" name="confirmInput" autocomplete="off"
            inputmode="${input.numeric ? 'numeric' : 'text'}" placeholder="${input.placeholder ?? ''}">
          ${input.hint ? html`<span class="small muted">${input.hint}</span>` : ''}
        </label>
        <p class="form-error" role="alert" data-confirm-error></p>` : ''}
    </div>
    <footer class="report-modal__foot">
      <span class="report-modal__spacer"></span>
      <button class="btn btn--quiet" type="button" data-answer="keep">${keepLabel}</button>
      <button class="btn ${tone === 'danger' ? 'btn--danger' : 'btn--primary'}" type="button" data-answer="go">${confirmLabel}</button>
    </footer>`);
  document.body.append(dialog);

  return new Promise((resolve) => {
    let done = false;
    const field = dialog.querySelector<HTMLInputElement>('[name="confirmInput"]');
    const finish = (go: boolean): void => {
      if (done) return;
      const value = field?.value.trim() ?? '';
      if (go && input) {
        const problem = input.check(value);
        if (problem) {
          const error = dialog.querySelector<HTMLElement>('[data-confirm-error]');
          if (error) error.textContent = problem;
          field?.focus();
          return;
        }
      }
      done = true;
      const picked = dialog.querySelector<HTMLSelectElement>('[name="confirmChoice"]')?.value ?? '';
      dialog.close();
      dialog.remove();
      if (returnTo?.isConnected) returnTo.focus();
      resolve(go ? { choice: picked, value } : null);
    };

    dialog.addEventListener('click', (event) => {
      // A click on the backdrop lands on the dialog itself.
      if (event.target === dialog) {
        finish(false);
        return;
      }
      const button = (event.target as Element).closest<HTMLElement>('[data-answer]');
      if (button) finish(button.dataset.answer === 'go');
    });
    // Esc answers this pop-up only; the side panel underneath stays open.
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') event.stopPropagation();
      // Enter in the typing box goes ahead (and is checked first).
      if (event.key === 'Enter' && event.target === field) {
        event.preventDefault();
        finish(true);
      }
    });
    field?.addEventListener('input', () => {
      const error = dialog.querySelector<HTMLElement>('[data-confirm-error]');
      if (error) error.textContent = '';
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    });
    dialog.addEventListener('animationend', () => dialog.classList.remove('is-entering'), { once: true });

    dialog.showModal();
    (field ?? dialog.querySelector<HTMLElement>('[name="confirmChoice"]') ?? dialog.querySelector<HTMLElement>('[data-answer="keep"]:not(.picker__icon)'))?.focus();
  });
}
