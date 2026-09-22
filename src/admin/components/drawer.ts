// Side panel for booking details and forms. See DrawerContent in ../types.ts
// for the shape of what it shows.

import { $, on, render } from '../../core/dom.js';
import type { DeskContext, DrawerContent, DrawerPayload } from '../types.js';

const root = $('#drawer');
const panel = $('.drawer__panel', root);
const titleSlot = $('[data-slot="title"]', root);
const bodySlot = $('[data-slot="body"]', root);

let current: { content: DrawerContent; ctx: DeskContext } | null = null;
let returnFocusTo: HTMLElement | null = null;

function draw(): void {
  if (!current) return;
  const { content, ctx } = current;
  titleSlot.textContent = typeof content.title === 'function' ? content.title(ctx) : content.title;
  render(bodySlot, content.render(ctx));
}

export function openDrawer(content: DrawerContent, ctx: DeskContext): void {
  if (!current) returnFocusTo = document.activeElement as HTMLElement | null;
  current = { content, ctx };
  draw();
  root.hidden = false;
  document.body.classList.add('has-drawer');
  bodySlot.scrollTop = 0;
  panel.focus();
}

export function closeDrawer(): void {
  if (!current) return;
  current = null;
  root.hidden = true;
  bodySlot.replaceChildren();
  document.body.classList.remove('has-drawer');
  if (returnFocusTo?.isConnected) returnFocusTo.focus();
  returnFocusTo = null;
}

/** Called after every app render so drawer actions use the latest context. */
export function syncDrawer(ctx: DeskContext): void {
  if (!current) return;
  current.ctx = ctx;
  if (current.content.live) draw();
}

function run(kind: 'actions' | 'inputs', name: string | undefined, el: HTMLElement, event: Event): void {
  if (!current || !name) return;
  const payload: DrawerPayload = { el, event, ctx: current.ctx, root: bodySlot, redraw: draw };
  void current.content[kind]?.[name]?.(payload);
}

on(root, 'click', '[data-action]', (event, el) => {
  if (el.dataset.action === 'close-drawer') {
    closeDrawer();
    return;
  }
  run('actions', el.dataset.action, el, event);
});

on<HTMLFormElement>(root, 'submit', 'form[data-submit]', (event, form) => {
  event.preventDefault();
  run('actions', form.dataset.submit, form, event);
});

on(root, 'input', '[data-input]', (event, el) => run('inputs', el.dataset.input, el, event));

root.addEventListener('click', (event) => {
  if ((event.target as Element).matches('[data-slot="backdrop"]')) closeDrawer();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && current) closeDrawer();
});
