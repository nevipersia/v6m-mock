// Side panel for booking details and forms. See DrawerContent in ../types.ts
// for the shape of what it shows.

import { $, on, render } from '../../core/dom.js';
import type { DeskContext, DrawerContent, DrawerPayload } from '../types.js';

const root = $('#drawer');
const panel = $('.drawer__panel', root);
const titleSlot = $('[data-slot="title"]', root);
const toolsSlot = $('[data-slot="tools"]', root);
const bodySlot = $('[data-slot="body"]', root);

let current: { content: DrawerContent; ctx: DeskContext } | null = null;
let returnFocusTo: HTMLElement | null = null;

function draw(): void {
  if (!current) return;
  const { content, ctx } = current;
  titleSlot.textContent = typeof content.title === 'function' ? content.title(ctx) : content.title;
  render(toolsSlot, content.tools ? content.tools(ctx) : '');
  render(bodySlot, content.render(ctx));
}

/** The close animation's length; matches drawer-out in admin.css. */
const LEAVE_MS = 180;
let leaving: ReturnType<typeof setTimeout> | undefined;

export function openDrawer(content: DrawerContent, ctx: DeskContext): void {
  // Reopened while still sliding away: stay open instead.
  clearTimeout(leaving);
  root.classList.remove('is-leaving');
  const swapping = !!current;
  if (!current) returnFocusTo = document.activeElement as HTMLElement | null;
  current = { content, ctx };
  draw();
  if (swapping) {
    bodySlot.classList.remove('is-swapping');
    void bodySlot.offsetWidth; // restart the animation
    bodySlot.classList.add('is-swapping');
  }
  root.hidden = false;
  document.body.classList.add('has-drawer');
  bodySlot.scrollTop = 0;
  panel.focus();
}

export function closeDrawer(): void {
  if (!current) return;
  current = null;
  document.body.classList.remove('has-drawer');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('is-leaving');
  leaving = setTimeout(() => {
    root.classList.remove('is-leaving');
    root.hidden = true;
    bodySlot.replaceChildren();
    toolsSlot.replaceChildren();
  }, still ? 0 : LEAVE_MS);
  if (returnFocusTo?.isConnected) returnFocusTo.focus();
  returnFocusTo = null;
}

/** Called after every app render so drawer actions use the latest context. */
export function syncDrawer(ctx: DeskContext): void {
  if (!current) return;
  current.ctx = ctx;
  if (!current.content.live) return;
  if (running) draw();
  else drawKeepingTyped();
}

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * A live panel redraws when the data changes underneath it (another desk, a
 * receipt arriving). Whatever staff were typing or picking in it is carried
 * over, with the cursor, so a half-filled payment or check-in isn't wiped.
 */
function drawKeepingTyped(): void {
  const fields = (): Field[] => [...bodySlot.querySelectorAll<Field>('input[name], select[name], textarea[name]')]
    .filter((field) => !(field instanceof HTMLInputElement && ['hidden', 'file', 'button', 'submit'].includes(field.type)));
  const keyOf = (field: Field, list: Field[]): string =>
    `${field.name}#${list.filter((other) => other.name === field.name).indexOf(field)}`;

  const before = fields();
  const typed = new Map(before.map((field) => [keyOf(field, before), {
    value: field.value,
    checked: field instanceof HTMLInputElement ? field.checked : false,
  }]));
  const active = document.activeElement as Field | null;
  const focusKey = active && before.includes(active) ? keyOf(active, before) : null;
  const selection = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
    ? { start: active.selectionStart, end: active.selectionEnd } : null;

  draw();

  const after = fields();
  after.forEach((field) => {
    const was = typed.get(keyOf(field, after));
    if (!was) return;
    if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) field.checked = was.checked;
    else if (field instanceof HTMLSelectElement) {
      if ([...field.options].some((option) => option.value === was.value)) field.value = was.value;
    } else field.value = was.value;
  });
  const again = focusKey ? after.find((field) => keyOf(field, after) === focusKey) : undefined;
  if (again) {
    again.focus();
    try {
      if (selection && !(again instanceof HTMLSelectElement)) again.setSelectionRange(selection.start, selection.end);
    } catch {
      // Not every input type has a selection.
    }
  }
}

/**
 * How many of the panel's own handlers are running. A change they make (record
 * a payment, check in) redraws the panel fresh; only changes from elsewhere
 * keep what was typed (drawKeepingTyped).
 */
let running = 0;

function run(kind: 'actions' | 'inputs', name: string | undefined, el: HTMLElement, event: Event): void {
  if (!current || !name) return;
  const payload: DrawerPayload = { el, event, ctx: current.ctx, root: bodySlot, redraw: draw };
  running += 1;
  let result: unknown;
  try {
    result = current.content[kind]?.[name]?.(payload);
  } finally {
    if (result instanceof Promise) void result.finally(() => { running -= 1; });
    else running -= 1;
  }
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
