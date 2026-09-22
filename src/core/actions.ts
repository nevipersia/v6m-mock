// State changes shared by V6M Desk and the booking page. Every action goes
// through store.update(), which saves to localStorage and re-renders subscribers.

import { update } from './store.js';
import { addDays, peso } from './format.js';
import {
  METHOD_LABELS, depositRequired, downpaymentDue, findBooking, findUnit, quote, sessionFor,
} from './rules.js';
import { formatReference, referenceProblem } from './qr-payment.js';
import type {
  Booking, BookingLink, BookingSource, Guest, ISODate, Inquiry, Invite, Payment, PaymentMethod, Permission, Role,
  Staff, StaffStatus, State, Timestamp,
} from './types.js';

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** The mock data is frozen on meta.asOf, so "now" is that date at the real clock time. */
export function demoNow(state: State): Timestamp {
  const clock = new Date();
  return `${state.meta.asOf}T${pad(clock.getHours())}:${pad(clock.getMinutes())}:00+08:00`;
}

function nextSequence(items: { id: string }[]): number {
  return items.reduce((max, item) => Math.max(max, Number(item.id.split('-').pop()) || 0), 0) + 1;
}

const nextId = (items: { id: string }[], prefix: string, width = 4): string => `${prefix}-${pad(nextSequence(items), width)}`;

function logActivity(state: State, staffId: string | null, action: string, ref: string, detail: string | null = null): void {
  state.activityLog.unshift({ at: demoNow(state), staffId, action, ref, detail });
}

/** Fetches a record that must exist; a missing one is a programming error. */
function must<T>(value: T | undefined | null, what: string): T {
  if (value == null) throw new Error(`${what} not found`);
  return value;
}

function findOrCreateGuest(state: State, { name, mobile }: { name: string; mobile?: string | null }): Guest {
  const cleanName = name.trim();
  let guest = state.guests.find((g) => g.name.toLowerCase() === cleanName.toLowerCase());
  if (!guest) {
    guest = { id: nextId(state.guests, 'GU'), name: cleanName, mobile: mobile || null };
    state.guests.push(guest);
  } else if (mobile && !guest.mobile) {
    guest.mobile = mobile;
  }
  return guest;
}

interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  via?: 'desk' | 'qr';
}

/**
 * Records a payment. A booking on hold only becomes confirmed once the 50%
 * downpayment is met; anything less stays on hold as a partial payment.
 */
function applyPayment(state: State, booking: Booking, { amount, method, reference, via = 'desk' }: PaymentInput, staffId: string | null): Payment {
  const type = booking.paid === 0 && amount >= booking.total ? 'full' : booking.paid < booking.depositRequired ? 'deposit' : 'balance';
  const payment: Payment = {
    id: nextId(state.payments, 'PY'),
    bookingId: booking.id,
    amount,
    method,
    type,
    reference: reference || null,
    proofAttached: method === 'gcash' || method === 'bank_transfer',
    receivedAt: demoNow(state),
    receivedBy: staffId,
    via,
  };
  state.payments.push(payment);
  booking.paid += amount;
  booking.balance = booking.total - booking.paid;
  const confirmed = booking.status === 'hold' && downpaymentDue(booking) === 0;
  if (confirmed) booking.status = 'confirmed';
  const how = via === 'qr' ? 'GCash QR, verified' : METHOD_LABELS[method];
  logActivity(state, staffId, 'payment.recorded', booking.id, `${peso(amount)} ${how} (${type})`);
  if (confirmed) logActivity(state, staffId, 'booking.confirmed', booking.id, 'Downpayment met');
  return payment;
}

/** Short, readable, single-use code: V6M-4KQ7RX */
function randomCode(prefix: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  return `${prefix}-${[...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')}`;
}

// ---------- Bookings ----------

export interface NewBooking {
  guestName: string;
  mobile?: string;
  source: BookingSource;
  product: string;
  date: ISODate;
  adults: number;
  kids: number;
  deposit: number;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  inquiryId?: string | null;
}

export function createBooking(input: NewBooking, staffId: string): Booking {
  return update((state) => createBookingInState(state, input, staffId));
}

function createBookingInState(state: State, input: NewBooking, staffId: string): Booking {
  const unit = findUnit(state, input.product);
  const session = sessionFor(state, input.product);
  const { promo: _promo, warnings: _warnings, ...pricing } = quote(state, input);
  const guest = findOrCreateGuest(state, { name: input.guestName, mobile: input.mobile ?? null });
  const startTime = unit ? unit.checkIn : session.start;
  const endTime = unit ? unit.checkOut : session.end;
  const endsNextDay = Boolean(unit) || endTime < startTime;
  const endDate = endsNextDay ? addDays(input.date, 1) : input.date;

  const booking: Booking = {
    id: `BK-${input.date.slice(5, 7)}${input.date.slice(8, 10)}-${pad(nextSequence(state.bookings), 3)}`,
    guestId: guest.id,
    guestName: guest.name,
    product: input.product,
    productType: unit ? unit.kind : 'entrance',
    date: input.date,
    nights: 1,
    session: session.id,
    startsAt: `${input.date}T${startTime}:00+08:00`,
    endsAt: `${endDate}T${endTime}:00+08:00`,
    adults: input.adults,
    kids: input.kids,
    pets: null,
    source: input.source,
    status: 'hold',
    pricing,
    total: pricing.total,
    depositRequired: depositRequired(state, input.product, pricing.total),
    paid: 0,
    balance: pricing.total,
    idVerified: false,
    eventId: null,
    createdAt: demoNow(state),
    createdBy: staffId,
    checkedInAt: null,
    checkedOutAt: null,
    cancelledAt: null,
    cancelReason: null,
    notes: input.notes?.trim() || null,
  };

  state.bookings.push(booking);
  state.bookings.sort((a, b) => (a.date === b.date ? a.startsAt.localeCompare(b.startsAt) : a.date.localeCompare(b.date)));
  logActivity(state, staffId, 'booking.created', booking.id, `${booking.guestName} · ${booking.product} · ${booking.date}`);

  if (input.deposit > 0) {
    applyPayment(state, booking, { amount: input.deposit, method: input.method, reference: input.reference ?? null }, staffId);
  }

  const inquiry = input.inquiryId ? state.inquiries.find((item) => item.id === input.inquiryId) : undefined;
  if (inquiry) Object.assign(inquiry, { status: 'booked', relatedBookingId: booking.id, assignedTo: staffId } satisfies Partial<Inquiry>);

  return booking;
}

export function recordPayment(bookingId: string, payment: PaymentInput, staffId: string): Booking {
  return update((state) => {
    const booking = must(findBooking(state, bookingId), `Booking ${bookingId}`);
    applyPayment(state, booking, payment, staffId);
    return booking;
  });
}

export type QrPaymentResult = { error: string } | { error?: undefined; booking: Booking; payment: Payment };

/**
 * Mock GCash QR payment: the guest scans the booking's payment QR, pays the
 * downpayment still due, and types the reference number. Verification is
 * simulated (see referenceProblem); nothing is charged.
 * @param staffId the desk account that showed the QR, or null when the guest paid from a booking link
 */
export function payByQr(bookingId: string, reference: string, staffId: string | null): QrPaymentResult {
  return update((state): QrPaymentResult => {
    const booking = findBooking(state, bookingId);
    if (!booking) return { error: 'This booking no longer exists.' };
    const amount = downpaymentDue(booking);
    if (amount === 0) return { error: 'The downpayment for this booking is already paid.' };
    const problem = referenceProblem(state, reference);
    if (problem) return { error: problem };
    const payment = applyPayment(state, booking, { amount, method: 'gcash', reference: formatReference(reference), via: 'qr' }, staffId);
    return { booking, payment };
  });
}

/** Verifies ID, collects any balance and marks the guest as arrived. */
export function checkIn(bookingId: string, { method }: { method: PaymentMethod }, staffId: string): Booking {
  return update((state) => {
    const booking = must(findBooking(state, bookingId), `Booking ${bookingId}`);
    if (booking.balance > 0) applyPayment(state, booking, { amount: booking.balance, method }, staffId);
    Object.assign(booking, { status: 'checked_in', idVerified: true, checkedInAt: demoNow(state) } satisfies Partial<Booking>);
    logActivity(state, staffId, 'booking.checked_in', booking.id, 'Valid ID verified');
    return booking;
  });
}

export function checkOut(bookingId: string, staffId: string): Booking {
  return update((state) => {
    const booking = must(findBooking(state, bookingId), `Booking ${bookingId}`);
    Object.assign(booking, { status: 'checked_out', checkedOutAt: demoNow(state) } satisfies Partial<Booking>);
    logActivity(state, staffId, 'booking.checked_out', booking.id);
    return booking;
  });
}

export function cancelBooking(bookingId: string, reason: string, staffId: string): Booking {
  return update((state) => {
    const booking = must(findBooking(state, bookingId), `Booking ${bookingId}`);
    Object.assign(booking, { status: 'cancelled', cancelledAt: demoNow(state), cancelReason: reason } satisfies Partial<Booking>);
    logActivity(state, staffId, 'booking.cancelled', booking.id, reason);
    return booking;
  });
}

// ---------- Inbox ----------

export function markInquiryReplied(inquiryId: string, staffId: string): Inquiry {
  return update((state) => {
    const inquiry = must(state.inquiries.find((item) => item.id === inquiryId), `Inquiry ${inquiryId}`);
    if (inquiry.status === 'new') {
      const minutes = Math.round((Date.parse(demoNow(state)) - Date.parse(inquiry.receivedAt)) / 60000);
      Object.assign(inquiry, { status: 'replied', assignedTo: staffId, firstReplyMinutes: Math.max(1, minutes) } satisfies Partial<Inquiry>);
    }
    logActivity(state, staffId, 'inquiry.replied', inquiry.id);
    return inquiry;
  });
}

// ---------- User accounts and invites ----------

export interface NewUser {
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
}

/** Creates the account in an invited state plus the single-use code that unlocks it. */
export function inviteUser({ name, email, role, permissions }: NewUser, staffId: string): { staff: Staff; invite: Invite } {
  return update((state) => {
    const staff: Staff = {
      id: nextId(state.staff, 'ST', 2),
      name: name.trim(),
      email: email.trim(),
      role,
      permissions: [...permissions],
      password: null,
      status: 'invited',
      demo: false,
    };
    state.staff.push(staff);

    const invite: Invite = {
      code: randomCode('V6M'),
      staffId: staff.id,
      createdBy: staffId,
      createdAt: demoNow(state),
      usedAt: null,
    };
    state.invites.push(invite);
    logActivity(state, staffId, 'user.invited', staff.id, `${staff.name} · ${role}`);
    return { staff, invite };
  });
}

/** @returns the staff record the code unlocked, or null when it is unknown or spent. */
export function redeemInvite(code: string, password: string): Staff | null {
  return update((state) => {
    const invite = state.invites.find((item) => item.code.toUpperCase() === code.trim().toUpperCase() && !item.usedAt);
    if (!invite) return null;
    const staff = state.staff.find((person) => person.id === invite.staffId);
    if (!staff) return null;
    invite.usedAt = demoNow(state);
    staff.status = 'active';
    staff.password = password;
    logActivity(state, staff.id, 'user.joined', staff.id, `${staff.name} accepted the invite`);
    return staff;
  });
}

export function updateUser(targetId: string, changes: Partial<Pick<Staff, 'role' | 'permissions'>>, staffId: string): Staff {
  return update((state) => {
    const staff = must(state.staff.find((person) => person.id === targetId), `Staff ${targetId}`);
    Object.assign(staff, changes, changes.permissions ? { permissions: [...changes.permissions] } : {});
    logActivity(state, staffId, 'user.updated', staff.id, staff.name);
    return staff;
  });
}

export function setUserStatus(targetId: string, status: StaffStatus, staffId: string): Staff {
  return update((state) => {
    const staff = must(state.staff.find((person) => person.id === targetId), `Staff ${targetId}`);
    staff.status = status;
    logActivity(state, staffId, 'user.status', staff.id, `${staff.name} · ${status}`);
    return staff;
  });
}

export function revokeInvite(code: string, staffId: string): Invite | null {
  return update((state) => {
    const invite = state.invites.find((item) => item.code === code);
    if (!invite || invite.usedAt) return null;
    state.invites = state.invites.filter((item) => item !== invite);
    state.staff = state.staff.filter((person) => person.id !== invite.staffId || person.status !== 'invited');
    logActivity(state, staffId, 'user.invite_revoked', invite.staffId, code);
    return invite;
  });
}

// ---------- Single-use booking links ----------

export interface NewBookingLink {
  product?: string;
  date?: ISODate;
  note?: string;
  expiresInDays?: number;
}

export function createBookingLink({ product, date, note, expiresInDays = 7 }: NewBookingLink, staffId: string): BookingLink {
  return update((state) => {
    const link: BookingLink = {
      id: nextId(state.bookingLinks, 'BL'),
      code: randomCode('BK'),
      createdBy: staffId,
      createdAt: demoNow(state),
      expiresAt: addDays(state.meta.asOf, expiresInDays),
      product: product || null,
      date: date || null,
      note: note?.trim() || null,
      status: 'sent',
      bookingId: null,
    };
    state.bookingLinks.push(link);
    logActivity(state, staffId, 'link.created', link.id, link.code);
    return link;
  });
}

export function cancelBookingLink(code: string, staffId: string): BookingLink | null {
  return update((state) => {
    const link = state.bookingLinks.find((item) => item.code === code);
    if (!link || link.status !== 'sent') return null;
    link.status = 'cancelled';
    logActivity(state, staffId, 'link.cancelled', link.id, link.code);
    return link;
  });
}

export const findBookingLink = (state: State, code: string | null | undefined): BookingLink | null =>
  state.bookingLinks.find((link) => link.code.toUpperCase() === String(code ?? '').trim().toUpperCase()) ?? null;

/** Why a link cannot be used right now, or null when it is good to go. */
export function bookingLinkProblem(state: State, link: BookingLink | null): string | null {
  if (!link) return 'This booking link is not valid. Ask the resort for a new one.';
  if (link.status === 'used') return 'This booking link was already used.';
  if (link.status === 'cancelled') return 'This booking link was cancelled. Ask the resort for a new one.';
  if (link.expiresAt < state.meta.asOf) return 'This booking link has expired. Ask the resort for a new one.';
  return null;
}

export type BookingLinkStage =
  | { stage: 'form'; link: BookingLink }
  | { stage: 'pay'; link: BookingLink; booking: Booking }
  | { stage: 'problem'; message: string };

/**
 * Where a guest opening a link should land: the form, the downpayment step
 * (the link was used but the booking still owes its 50%), or a problem.
 */
export function bookingLinkStage(state: State, code: string | null | undefined): BookingLinkStage {
  const link = findBookingLink(state, code);
  if (link?.status === 'used') {
    const booking = findBooking(state, link.bookingId);
    if (booking && booking.status === 'hold' && downpaymentDue(booking) > 0) return { stage: 'pay', link, booking };
  }
  const problem = bookingLinkProblem(state, link);
  if (problem || !link) return { stage: 'problem', message: problem ?? 'This booking link is not valid.' };
  return { stage: 'form', link };
}

export type GuestBooking = Pick<NewBooking, 'guestName' | 'mobile' | 'product' | 'date' | 'adults' | 'kids' | 'notes'>;

export type BookingLinkResult = { error: string } | { error?: undefined; booking: Booking; link: BookingLink };

/** Guest-side submit: creates the booking for the staff member who sent the link. */
export function useBookingLink(code: string, input: GuestBooking): BookingLinkResult {
  return update((state): BookingLinkResult => {
    const link = findBookingLink(state, code);
    const problem = bookingLinkProblem(state, link);
    if (problem || !link) return { error: problem ?? 'This booking link is not valid.' };

    const booking = createBookingInState(state, { ...input, source: 'booking_link', deposit: 0, method: 'cash' }, link.createdBy);
    link.status = 'used';
    link.bookingId = booking.id;
    link.usedAt = demoNow(state);
    logActivity(state, link.createdBy, 'link.used', link.id, `${booking.guestName} · ${booking.id}`);
    return { booking, link };
  });
}
