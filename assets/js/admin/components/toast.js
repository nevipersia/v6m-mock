import { $ } from '../../core/dom.js';

const toast = $('#toast');
let hideTimer = null;

export function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3500);
}
