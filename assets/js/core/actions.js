// State changes shared by both apps. Every action goes through store.update(),
// which saves to localStorage and re-renders subscribers.

import { update } from './store.js';
import { addDays, peso } from './format.js';
import {
  METHOD_LABELS, depositRequired, findBooking, findSession, findUnit, quote,
} from './rules.js';

const pad = (n, width = 2) => String(n).padStart(width, '0');

/** The mock data is frozen on meta.asOf, so "now" is that date at the real clock time. */
export function demoNow(state) {
  const clock = new Date();
  return `${state.meta.asOf}T${pad(clock.getHours())}:${pad(clock.getMinutes())}:00+08:00`;
}

function nextSequence(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id.split('-').pop()) || 0), 0) + 1;
}

const nextId = (items, prefix, width = 4) => `${prefix}-${pad(nextSequence(items), width)}`;

function logActivity(state, staffId, action, ref, detail = null) {
  state.activityLog.unshift({ at: demoNow(state), staffId, action, ref, detail });
}

function findOrCreateGuest(state, { name, mobile }) {
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

function applyPayment(state, booking, { amount, method, reference, staffId }) {
  const type = booking.paid === 0 ? (amount >= booking.total ? 'full' : 'deposit') : 'balance';
  state.payments.push({
    id: nextId(state.payments, 'PY'),
    bookingId: booking.id,
    amount,
    method,
    type,
    reference: reference || null,
    proofAttached: method === 'gcash' || method === 'bank_transfer',
    receivedAt: demoNow(state),
    receivedBy: staffId,
  });
  booking.paid += amount;
  booking.balance = booking.total - booking.paid;
  if (booking.status === 'hold') booking.status = 'confirmed';
  logActivity(state, staffId, 'payment.recorded', booking.id, `${peso(amount)} ${METHOD_LABELS[method]} (${type})`);
}

/** Short, readable, single-use code: V6M-4KQ7RX */
function randomCode(prefix) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  return `${prefix}-${[...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')}`;
}

// ---------- Bookings ----------

/**
 * @param {object} input guestName, mobile, source, product, date, adults, kids,
 *   deposit, method, reference, notes, inquiryId
 */
export function createBooking(input, staffId) {
  return update((state) => createBookingInState(state, input, staffId));
}

function createBookingInState(state, input, staffId) {
  const unit = findUnit(state, input.product);
  const session = findSession(state, unit ? unit.session : input.product);
  const { promo, warnings, ...pricing } = quote(state, input);
  const guest = findOrCreateGuest(state, { name: input.guestName, mobile: input.mobile });
  const startTime = unit ? unit.checkIn : session.start;
  const endTime = unit ? unit.checkOut : session.end;
  const endsNextDay = Boolean(unit) || endTime < startTime;
  const endDate = endsNextDay ? addDays(input.date, 1) : input.date;

  const booking = {
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
    applyPayment(state, booking, { amount: input.deposit, method: input.method, reference: input.reference, staffId });
  }

  const inquiry = input.inquiryId && state.inquiries.find((item) => item.id === input.inquiryId);
  if (inquiry) Object.assign(inquiry, { status: 'booked', relatedBookingId: booking.id, assignedTo: staffId });

  return booking;
}

export function recordPayment(bookingId, { amount, method, reference }, staffId) {
  return update((state) => {
    const booking = findBooking(state, bookingId);
    applyPayment(state, booking, { amount, method, reference, staffId });
    return booking;
  });
}

/** Verifies ID, collects any balance and marks the guest as arrived. */
export function checkIn(bookingId, { method }, staffId) {
  return update((state) => {
    const booking = findBooking(state, bookingId);
    if (booking.balance > 0) applyPayment(state, booking, { amount: booking.balance, method, staffId });
    Object.assign(booking, { status: 'checked_in', idVerified: true, checkedInAt: demoNow(state) });
    logActivity(state, staffId, 'booking.checked_in', booking.id, 'Valid ID verified');
    return booking;
  });
}

export function checkOut(bookingId, staffId) {
  return update((state) => {
    const booking = findBooking(state, bookingId);
    Object.assign(booking, { status: 'checked_out', checkedOutAt: demoNow(state) });
    logActivity(state, staffId, 'booking.checked_out', booking.id);
    return booking;
  });
}

export function cancelBooking(bookingId, reason, staffId) {
  return update((state) => {
    const booking = findBooking(state, bookingId);
    Object.assign(booking, { status: 'cancelled', cancelledAt: demoNow(state), cancelReason: reason });
    logActivity(state, staffId, 'booking.cancelled', booking.id, reason);
    return booking;
  });
}

// ---------- Inbox ----------

export function markInquiryReplied(inquiryId, staffId) {
  return update((state) => {
    const inquiry = state.inquiries.find((item) => item.id === inquiryId);
    if (inquiry.status === 'new') {
      const minutes = Math.round((Date.parse(demoNow(state)) - Date.parse(inquiry.receivedAt)) / 60000);
      Object.assign(inquiry, { status: 'replied', assignedTo: staffId, firstReplyMinutes: Math.max(1, minutes) });
    }
    logActivity(state, staffId, 'inquiry.replied', inquiry.id);
    return inquiry;
  });
}

// ---------- User accounts and invites ----------

/** Creates the account in an invited state plus the single-use code that unlocks it. */
export function inviteUser({ name, email, role, permissions }, staffId) {
  return update((state) => {
    const staff = {
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

    const invite = {
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
export function redeemInvite(code, password) {
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

export function updateUser(targetId, changes, staffId) {
  return update((state) => {
    const staff = state.staff.find((person) => person.id === targetId);
    Object.assign(staff, changes, changes.permissions ? { permissions: [...changes.permissions] } : {});
    logActivity(state, staffId, 'user.updated', staff.id, staff.name);
    return staff;
  });
}

export function setUserStatus(targetId, status, staffId) {
  return update((state) => {
    const staff = state.staff.find((person) => person.id === targetId);
    staff.status = status;
    logActivity(state, staffId, 'user.status', staff.id, `${staff.name} · ${status}`);
    return staff;
  });
}

export function revokeInvite(code, staffId) {
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

export function createBookingLink({ product, date, note, expiresInDays = 7 }, staffId) {
  return update((state) => {
    const link = {
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

export function cancelBookingLink(code, staffId) {
  return update((state) => {
    const link = state.bookingLinks.find((item) => item.code === code);
    if (!link || link.status !== 'sent') return null;
    link.status = 'cancelled';
    logActivity(state, staffId, 'link.cancelled', link.id, link.code);
    return link;
  });
}

export const findBookingLink = (state, code) =>
  state.bookingLinks.find((link) => link.code.toUpperCase() === String(code ?? '').trim().toUpperCase()) ?? null;

/** Why a link cannot be used right now, or null when it is good to go. */
export function bookingLinkProblem(state, link) {
  if (!link) return 'This booking link is not valid. Ask the resort for a new one.';
  if (link.status === 'used') return 'This booking link was already used.';
  if (link.status === 'cancelled') return 'This booking link was cancelled. Ask the resort for a new one.';
  if (link.expiresAt < state.meta.asOf) return 'This booking link has expired. Ask the resort for a new one.';
  return null;
}

/** Guest-side submit: creates the booking for the staff member who sent the link. */
export function useBookingLink(code, input) {
  return update((state) => {
    const link = findBookingLink(state, code);
    const problem = bookingLinkProblem(state, link);
    if (problem) return { error: problem };

    const booking = createBookingInState(state, { ...input, source: 'booking_link', deposit: 0 }, link.createdBy);
    link.status = 'used';
    link.bookingId = booking.id;
    link.usedAt = demoNow(state);
    logActivity(state, link.createdBy, 'link.used', link.id, `${booking.guestName} · ${booking.id}`);
    return { booking, link };
  });
}
