// What the booking page asks of the resort's data.
//
// The demo runs the actions right here against the shared mock store. A
// Supabase build cannot: a guest has no login, so row-level security lets the
// browser read nothing. It calls the booking-link Edge Function instead, which
// runs the same actions with the service role and returns only what this page
// needs (the catalog, the link, and bookings stripped down to what availability
// checks read). See supabase/functions/booking-link.

import {
  bookingLinkStage, submitPaymentCheck, useBookingLink,
  type BookingLinkResult, type BookingLinkStage, type GuestBooking, type PaymentCheckResult, type ReceiptInput,
} from '../core/actions.js';
import { createStaticBackend } from '../core/backend.js';
import { isMock } from '../core/config.js';
import { loadStore, update, useBackend } from '../core/store.js';
import { supabaseClient } from '../core/supabase-client.js';
import type { Booking, PaymentCheck, State } from '../core/types.js';

export interface OpenResult {
  state: State;
  stage: BookingLinkStage;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const client = await supabaseClient();
  const { data, error } = await client.functions.invoke<T & { error?: string }>('booking-link', { body });
  if (data) return data;
  // An error status from the function still carries its JSON message; a
  // network failure carries the fetch error instead.
  const context = (error as { context?: unknown } | null)?.context;
  const payload = context instanceof Response ? await context.json().catch(() => null) as { error?: string } | null : null;
  throw new Error(payload?.error ?? 'Could not reach the resort. Check your connection.');
}

/** Keeps the page's copy of the data in step with what the server saved. */
function remember(booking: Booking, check?: PaymentCheck): void {
  update((state) => {
    state.bookings = [...state.bookings.filter((item) => item.id !== booking.id), booking];
    if (check) state.paymentChecks.push(check);
  });
}

export async function openLink(code: string): Promise<OpenResult> {
  if (isMock) {
    const state = await loadStore();
    return { state, stage: bookingLinkStage(state, code) };
  }
  const result = await call<OpenResult>({ action: 'open', code });
  useBackend(createStaticBackend(result.state));
  await loadStore();
  return result;
}

export async function submitBooking(code: string, input: GuestBooking): Promise<BookingLinkResult> {
  if (isMock) return useBookingLink(code, input);
  const result = await call<BookingLinkResult>({ action: 'submit', code, input });
  if (result.error === undefined) remember(result.booking);
  return result;
}

/** Sends the guest's GCash receipt for the front desk to check. */
export async function sendReceipt(code: string, bookingId: string, receipt: ReceiptInput): Promise<PaymentCheckResult> {
  if (isMock) return submitPaymentCheck(bookingId, receipt);
  const result = await call<PaymentCheckResult>({ action: 'pay', code, bookingId, ...receipt });
  if (result.error === undefined) remember(result.booking, result.check);
  return result;
}
