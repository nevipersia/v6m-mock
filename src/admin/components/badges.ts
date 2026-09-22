// Status pills, category dots and avatars used across V6M Desk.

import { html, type SafeHTML } from '../../core/dom.js';
import { initials, peso } from '../../core/format.js';
import { STAGE_LABELS, STATUS_LABELS, isActive, productKind } from '../../core/rules.js';
import type { Booking, BookingStatus, EventStage, State } from '../../core/types.js';

export type Tone = 'warning' | 'info' | 'success' | 'neutral' | 'danger';

const STATUS_TONES: Record<BookingStatus, Tone> = {
  hold: 'warning',
  confirmed: 'info',
  checked_in: 'success',
  checked_out: 'neutral',
  cancelled: 'neutral',
  no_show: 'danger',
};

const STAGE_TONES: Record<EventStage, Tone> = {
  inquiry: 'neutral',
  ocular: 'warning',
  reserved: 'info',
  paid: 'success',
  done: 'neutral',
};

export const statusPill = (booking: Booking): SafeHTML =>
  html`<span class="pill pill--${STATUS_TONES[booking.status]}">${STATUS_LABELS[booking.status]}</span>`;

export function paymentPill(booking: Booking): SafeHTML | '' {
  if (!isActive(booking)) return '';
  if (booking.balance <= 0) return html`<span class="pill pill--success">Paid</span>`;
  if (booking.paid === 0) return html`<span class="pill pill--danger">Unpaid</span>`;
  return html`<span class="pill pill--warning">${peso(booking.balance)} due</span>`;
}

export const stagePill = (stage: EventStage): SafeHTML =>
  html`<span class="pill pill--${STAGE_TONES[stage]}">${STAGE_LABELS[stage]}</span>`;

export const kindDot = (state: State, product: string): SafeHTML =>
  html`<span class="dot dot--${productKind(state, product)}" aria-hidden="true"></span>`;

export const avatar = (name: string): SafeHTML =>
  html`<span class="avatar" aria-hidden="true">${initials(name)}</span>`;
