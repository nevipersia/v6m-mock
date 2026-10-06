// Alerts: a short card in the corner after anything changes. Each one says
// what happened with an icon for its kind — saved, for your information,
// worth a second look, or went wrong — stays a few seconds (longer for a
// problem), pauses while pointed at, and can be closed. Several stack. One
// given an onClick is a link to whatever it is about: clicking the card goes there.

import { $, html, render, type SafeHTML } from '../../core/dom.js';
import { icon, type IconName } from './icons.js';

export type AlertTone = 'success' | 'info' | 'warning' | 'error';

const stack = $('#alerts');

const ICONS: Record<AlertTone, IconName> = {
  success: 'check',
  info: 'alert',
  warning: 'alert',
  error: 'alert',
};

/** How long each kind stays: a problem needs reading, a save does not. */
const STAY_MS: Record<AlertTone, number> = { success: 4000, info: 4000, warning: 5500, error: 8000 };

/** More than this and the oldest goes, so a burst of changes cannot fill the screen. */
const MAX_SHOWN = 4;

export interface ToastOptions {
  icon?: IconName;
  /** How long it stays, instead of the tone's usual time. */
  stayMs?: number;
  /** Clicking the card (not its close button) runs this and dismisses it. */
  onClick?: () => void;
}

function card(message: string, tone: AlertTone, options: ToastOptions): SafeHTML {
  const clickable = Boolean(options.onClick);
  return html`
    <div class="alert alert--${tone} ${clickable ? 'alert--link' : ''}" role="${tone === 'error' ? 'alert' : 'status'}"
      ${clickable ? html`tabindex="0" title="Open it"` : ''}>
      <span class="alert__icon" aria-hidden="true">${icon(options.icon ?? ICONS[tone])}</span>
      <p class="alert__text">${message}</p>
      <button class="alert__close" type="button" aria-label="Dismiss">${icon('x')}</button>
      <span class="alert__timer" aria-hidden="true"></span>
    </div>`;
}

function dismiss(el: HTMLElement): void {
  if (el.classList.contains('is-leaving')) return;
  el.classList.add('is-leaving');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => el.remove(), still ? 0 : 200);
}

export function showToast(message: string, tone: AlertTone = 'success', options: ToastOptions = {}): void {
  const holder = document.createElement('div');
  render(holder, card(message, tone, options));
  const el = holder.firstElementChild as HTMLElement;
  const stay = options.stayMs ?? STAY_MS[tone];
  el.style.setProperty('--stay', `${stay}ms`);
  stack.append(el);

  const shown = stack.querySelectorAll<HTMLElement>('.alert:not(.is-leaving)');
  if (shown.length > MAX_SHOWN && shown[0]) dismiss(shown[0]);

  // Counts down only while nobody is reading it.
  let left = stay;
  let started = Date.now();
  let timer = setTimeout(() => dismiss(el), left);
  el.addEventListener('mouseenter', () => {
    clearTimeout(timer);
    left -= Date.now() - started;
  });
  el.addEventListener('mouseleave', () => {
    started = Date.now();
    timer = setTimeout(() => dismiss(el), Math.max(800, left));
  });
  el.querySelector('.alert__close')?.addEventListener('click', (event) => {
    event.stopPropagation();
    clearTimeout(timer);
    dismiss(el);
  });
  const { onClick } = options;
  if (onClick) {
    const open = () => {
      clearTimeout(timer);
      dismiss(el);
      onClick();
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  }
}
