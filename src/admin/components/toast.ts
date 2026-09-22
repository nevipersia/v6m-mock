import { $ } from '../../core/dom.js';

const toast = $('#toast');
let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string): void {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3500);
}
