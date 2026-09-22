// Inbox: inquiries from Messenger, Instagram, phone and the website, with
// saved replies and a shortcut to turn an inquiry into a booking.

import { markInquiryReplied } from '../../core/actions.js';
import { html, type SafeHTML } from '../../core/dom.js';
import { formatDate, formatDateTime, plural } from '../../core/format.js';
import { SOURCE_LABELS, findBooking, findGuest, findStaff, productLabel } from '../../core/rules.js';
import type { Inquiry, InquiryStatus, State } from '../../core/types.js';
import type { Tone } from '../components/badges.js';
import type { DeskContext, HandlerMap } from '../types.js';
import { icon } from '../components/icons.js';
import { emptyState, pageHead } from '../layout.js';

const INQUIRY_STATUS: Record<InquiryStatus, { label: string; tone: Tone }> = {
  new: { label: 'New', tone: 'warning' },
  replied: { label: 'Replied', tone: 'info' },
  booked: { label: 'Booked', tone: 'success' },
  lost: { label: 'Lost', tone: 'neutral' },
};

const ui: { filter: 'new' | 'all'; selectedId: string | null; draft: string; error: string } = {
  filter: 'new', selectedId: null, draft: '', error: '',
};

const statusPill = (status: InquiryStatus): SafeHTML =>
  html`<span class="pill pill--${INQUIRY_STATUS[status].tone}">${INQUIRY_STATUS[status].label}</span>`;

function visibleInquiries(state: State): Inquiry[] {
  const list = ui.filter === 'new' ? state.inquiries.filter((inquiry) => inquiry.status === 'new') : state.inquiries;
  return [...list].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

function threadList(list: Inquiry[]): SafeHTML {
  if (!list.length) return emptyState('Inbox zero', 'No new inquiries. Switch to All to see past ones.');
  return html`
    <ul class="thread-list">
      ${list.map((inquiry) => html`
        <li>
          <button class="thread-item ${inquiry.id === ui.selectedId ? 'is-selected' : ''}" type="button" data-action="select-thread" data-id="${inquiry.id}">
            <span class="thread-item__top">
              <strong class="thread-item__from">${inquiry.status === 'new' ? html`<span class="unread-dot" aria-label="Unread"></span>` : ''}${inquiry.from}</strong>
              <span class="small muted">${formatDateTime(inquiry.receivedAt)}</span>
            </span>
            <span class="thread-item__preview">
              <span class="channel channel--${inquiry.channel}">${SOURCE_LABELS[inquiry.channel]}</span>
              ${inquiry.message}
            </span>
          </button>
        </li>`)}
    </ul>`;
}

function thread(ctx: DeskContext, inquiry: Inquiry): SafeHTML {
  const { state } = ctx;
  const guest = findGuest(state, inquiry.guestId);
  const booking = findBooking(state, inquiry.relatedBookingId);
  const assignee = findStaff(state, inquiry.assignedTo);
  const canReply = ctx.can('inbox.write');

  return html`
    <article class="thread">
      <header class="thread__head">
        <div>
          <h2 class="thread__from">${inquiry.from}</h2>
          <p class="small muted">
            <span class="channel channel--${inquiry.channel}">${SOURCE_LABELS[inquiry.channel]}</span>
            ${formatDateTime(inquiry.receivedAt)}${guest?.mobile ? ` · ${guest.mobile}` : ''}
          </p>
        </div>
        ${statusPill(inquiry.status)}
      </header>

      <p class="bubble">${inquiry.message}</p>

      ${inquiry.firstReplyMinutes != null ? html`
        <p class="small muted">${assignee ? `${assignee.name} replied` : 'Replied'} after ${plural(inquiry.firstReplyMinutes, 'minute')}.</p>` : ''}

      ${booking ? html`
        <button class="linked-booking" type="button" data-action="open-booking" data-id="${booking.id}">
          ${icon('calendar')}
          <span>Booked: ${productLabel(state, booking.product)} on ${formatDate(booking.date)} · ${booking.id}</span>
          ${icon('arrowRight')}
        </button>` : ''}

      ${canReply ? html`
        <div class="reply">
          <p class="field__label">Saved replies</p>
          <div class="chip-row">
            ${state.savedReplies.map((reply) => html`
              <button class="chip" type="button" data-action="use-reply" data-id="${reply.id}">${reply.title}</button>`)}
          </div>
          <label class="field">
            <span class="sr-only">Reply</span>
            <textarea class="input" data-input="draft" name="draft" rows="6" placeholder="Pick a saved reply or write your own">${ui.draft}</textarea>
          </label>
          <p class="form-error">${ui.error}</p>
          <div class="button-row button-row--end">
            ${ctx.can('bookings.write') && inquiry.status !== 'booked' ? html`
              <button class="btn btn--secondary" type="button" data-action="book-from-inquiry" data-id="${inquiry.id}">${icon('plus')} Create booking</button>` : ''}
            <button class="btn btn--primary" type="button" data-action="send-reply" data-id="${inquiry.id}">${icon('copy')} Copy reply</button>
          </div>
          <p class="small muted">Replies are copied so you can paste them into ${SOURCE_LABELS[inquiry.channel]}. Nothing is sent from here.</p>
        </div>` : ''}
    </article>`;
}

export function render(ctx: DeskContext): SafeHTML {
  const { state } = ctx;
  const list = visibleInquiries(state);
  if (!list.some((inquiry) => inquiry.id === ui.selectedId)) ui.selectedId = list[0]?.id ?? null;
  const selected = state.inquiries.find((inquiry) => inquiry.id === ui.selectedId);
  const newCount = state.inquiries.filter((inquiry) => inquiry.status === 'new').length;

  return html`
    ${pageHead({ title: 'Inbox', subtitle: `${plural(newCount, 'new inquiry', 'new inquiries')} · ${state.inquiries.length} total` })}

    <div class="segmented" role="group" aria-label="Filter inquiries">
      <button class="segmented__option ${ui.filter === 'new' ? 'is-active' : ''}" type="button" data-action="filter-inbox" data-filter="new" aria-pressed="${ui.filter === 'new'}">New (${newCount})</button>
      <button class="segmented__option ${ui.filter === 'all' ? 'is-active' : ''}" type="button" data-action="filter-inbox" data-filter="all" aria-pressed="${ui.filter === 'all'}">All (${state.inquiries.length})</button>
    </div>

    <div class="inbox">
      <section class="panel panel--flush inbox__list" aria-label="Inquiries">${threadList(list)}</section>
      <section class="panel inbox__thread" aria-label="Selected inquiry">
        ${selected ? thread(ctx, selected) : emptyState('Nothing selected', 'Pick an inquiry to read it.')}
      </section>
    </div>`;
}

export const inputs: HandlerMap = {
  draft: ({ el }) => {
    ui.draft = (el as HTMLTextAreaElement).value;
    ui.error = '';
  },
};

export const actions: HandlerMap = {
  'filter-inbox': ({ el, ctx }) => {
    ui.filter = el.dataset.filter === 'all' ? 'all' : 'new';
    ctx.redraw();
  },

  'select-thread': ({ el, ctx }) => {
    ui.selectedId = el.dataset.id ?? null;
    ui.draft = '';
    ui.error = '';
    ctx.redraw();
  },

  'use-reply': ({ el, ctx }) => {
    ui.draft = ctx.state.savedReplies.find((reply) => reply.id === el.dataset.id)?.body ?? '';
    ui.error = '';
    ctx.redraw();
  },

  'send-reply': async ({ el, ctx }) => {
    if (!ui.draft.trim()) {
      ui.error = 'Pick a saved reply or write one first.';
      ctx.redraw();
      return;
    }
    const inquiry = ctx.state.inquiries.find((item) => item.id === el.dataset.id);
    if (!inquiry) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(ui.draft);
      copied = true;
    } catch {
      // Clipboard can be blocked; the reply still counts as handled.
    }
    ui.draft = '';
    ui.error = '';
    markInquiryReplied(inquiry.id, ctx.staff.id);
    ctx.toast(copied ? `Reply copied. Paste it into ${SOURCE_LABELS[inquiry.channel]}.` : 'Marked as replied');
  },

  'book-from-inquiry': ({ el, ctx }) => {
    const inquiry = ctx.state.inquiries.find((item) => item.id === el.dataset.id);
    if (!inquiry) return;
    const guest = findGuest(ctx.state, inquiry.guestId);
    ctx.newBooking({
      guestName: guest?.name ?? inquiry.from,
      mobile: guest?.mobile ?? '',
      source: inquiry.channel,
      inquiryId: inquiry.id,
    });
  },
};
