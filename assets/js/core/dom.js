// Small DOM helpers: safe HTML templating and event delegation.

const RAW = Symbol('raw-html');

/** Marks a string as trusted HTML so html`` does not escape it. */
export function raw(value) {
  return { [RAW]: String(value ?? '') };
}

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

function toHTML(value) {
  if (value == null || value === false || value === true) return '';
  if (Array.isArray(value)) return value.map(toHTML).join('');
  if (typeof value === 'object' && RAW in value) return value[RAW];
  return escapeHTML(value);
}

/**
 * Tagged template for markup. Interpolated values are escaped unless they
 * came from another html`` call or raw(). Arrays are joined.
 */
export function html(strings, ...values) {
  return raw(strings.reduce((out, str, i) => out + str + (i < values.length ? toHTML(values[i]) : ''), ''));
}

export function render(element, template) {
  element.innerHTML = toHTML(template);
  return element;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Delegated listener: handler(event, matchedElement). */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(event, target);
  });
}
