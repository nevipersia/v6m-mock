// Inquiry form in a native <dialog>. Saves to the shared store so the inquiry
// shows up in the V6M Desk inbox; nothing is sent anywhere.

import { $, on } from '../core/dom.js';
import { addInquiry } from '../core/actions.js';
import { isPHMobile } from '../core/format.js';

export function createInquiryDialog(dialog) {
  const form = $('[data-slot="form"]', dialog);
  const done = $('[data-slot="done"]', dialog);
  const summary = $('[data-slot="summary"]', dialog);
  const error = $('[data-slot="error"]', dialog);

  const close = () => dialog.close();

  on(dialog, 'click', '[data-close]', close);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  form.addEventListener('input', () => {
    error.textContent = '';
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    const mobile = form.elements.mobile.value.trim();
    const note = form.elements.message.value.trim();

    if (!name) {
      error.textContent = 'Enter your name.';
      form.elements.name.focus();
      return;
    }
    if (!isPHMobile(mobile)) {
      error.textContent = 'Enter a PH mobile number, like 0917 123 4567.';
      form.elements.mobile.focus();
      return;
    }

    addInquiry({ name, mobile, message: note ? `${summary.textContent}\n\n${note}` : summary.textContent });
    form.hidden = true;
    done.hidden = false;
  });

  return {
    open(text) {
      summary.textContent = text;
      form.reset();
      error.textContent = '';
      form.hidden = false;
      done.hidden = true;
      dialog.showModal();
      form.elements.name.focus();
    },
  };
}
