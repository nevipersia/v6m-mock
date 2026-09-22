// Small DOM helpers: safe HTML templating and event delegation.

const RAW = Symbol('raw-html');

/** Markup that html`` inserts as-is. Anything else is escaped. */
export interface SafeHTML {
  readonly [RAW]: string;
}

/** Anything a template can interpolate. Nullish and booleans render as nothing. */
export type TemplateValue = SafeHTML | string | number | boolean | null | undefined | TemplateValue[];

/** Marks a string as trusted HTML so html`` does not escape it. */
export function raw(value: unknown): SafeHTML {
  return { [RAW]: String(value ?? '') };
}

const ENTITIES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

export function escapeHTML(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ENTITIES[ch] ?? ch);
}

const isSafe = (value: unknown): value is SafeHTML => typeof value === 'object' && value !== null && RAW in value;

function toHTML(value: TemplateValue): string {
  if (value == null || value === false || value === true) return '';
  if (Array.isArray(value)) return value.map(toHTML).join('');
  if (isSafe(value)) return value[RAW];
  return escapeHTML(value);
}

/**
 * Tagged template for markup. Interpolated values are escaped unless they
 * came from another html`` call or raw(). Arrays are joined.
 */
export function html(strings: TemplateStringsArray, ...values: TemplateValue[]): SafeHTML {
  return raw(strings.reduce((out, str, i) => out + str + (i < values.length ? toHTML(values[i]) : ''), ''));
}

export function render<T extends Element>(element: T, template: TemplateValue): T {
  element.innerHTML = toHTML(template);
  return element;
}

/** querySelector that throws when the element is missing, so callers get a non-null type. */
export function $<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

export const $maybe = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(selector);

export const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] =>
  [...root.querySelectorAll<T>(selector)];

/** Delegated listener: handler(event, matchedElement). */
export function on<E extends HTMLElement = HTMLElement, K extends keyof HTMLElementEventMap = keyof HTMLElementEventMap>(
  root: HTMLElement,
  type: K,
  selector: string,
  handler: (event: HTMLElementEventMap[K], target: E) => void,
): void {
  root.addEventListener(type, (event) => {
    const target = (event.target as Element | null)?.closest<E>(selector);
    if (target && root.contains(target)) handler(event, target);
  });
}
