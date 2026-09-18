// Side panel for booking details and forms.
//
// Content objects look like:
//   { title: string | (ctx) => string,
//     render: (ctx) => template,
//     live: boolean,                 re-render when the store changes
//     actions: { name: ({ el, event, ctx, root, redraw }) => void },
//     inputs:  { name: ({ el, event, ctx, root, redraw }) => void } }

import { $, on, render } from '../../core/dom.js';

const root = $('#drawer');
const panel = $('.drawer__panel', root);
const titleSlot = $('[data-slot="title"]', root);
const bodySlot = $('[data-slot="body"]', root);

let current = null;
let returnFocusTo = null;

function draw() {
  if (!current) return;
  const { content, ctx } = current;
  titleSlot.textContent = typeof content.title === 'function' ? content.title(ctx) : content.title;
  render(bodySlot, content.render(ctx));
}

export function openDrawer(content, ctx) {
  if (!current) returnFocusTo = document.activeElement;
  current = { content, ctx };
  draw();
  root.hidden = false;
  document.body.classList.add('has-drawer');
  bodySlot.scrollTop = 0;
  panel.focus();
}

export function closeDrawer() {
  if (!current) return;
  current = null;
  root.hidden = true;
  bodySlot.replaceChildren();
  document.body.classList.remove('has-drawer');
  if (returnFocusTo?.isConnected) returnFocusTo.focus();
  returnFocusTo = null;
}

/** Called after every app render so drawer actions use the latest context. */
export function syncDrawer(ctx) {
  if (!current) return;
  current.ctx = ctx;
  if (current.content.live) draw();
}

function payload(el, event) {
  return { el, event, ctx: current.ctx, root: bodySlot, redraw: draw };
}

on(root, 'click', '[data-action]', (event, el) => {
  if (el.dataset.action === 'close-drawer') {
    closeDrawer();
    return;
  }
  current?.content.actions?.[el.dataset.action]?.(payload(el, event));
});

on(root, 'submit', 'form[data-submit]', (event, form) => {
  event.preventDefault();
  current?.content.actions?.[form.dataset.submit]?.(payload(form, event));
});

on(root, 'input', '[data-input]', (event, el) => {
  current?.content.inputs?.[el.dataset.input]?.(payload(el, event));
});

root.addEventListener('click', (event) => {
  if (event.target.matches('[data-slot="backdrop"]')) closeDrawer();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && current) closeDrawer();
});
