import { html, render } from '../core/dom.js';

export function renderFaq(container, state) {
  const openItems = new Set([...container.querySelectorAll('details[open]')].map((item) => item.dataset.id));

  render(container, state.savedReplies.map((reply) => html`
    <details class="faq__item" data-id="${reply.id}" ${openItems.has(reply.id) ? 'open' : ''}>
      <summary>${reply.title}</summary>
      <p>${reply.body}</p>
    </details>`));
}
