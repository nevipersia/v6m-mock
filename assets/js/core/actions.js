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
    guest = {
      id: nextId(state.guests, 'GU'),
      name: cleanName,
      mobile: mobile || null,
      email: null,
      city: null,
      instagram: null,
      tags: [],
      firstVisit: null,
      visits: 0,
      marketingConsent: false,
      photoRepostConsent: false,
    };
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

function setUnitHousekeeping(state, unitId, status, note, staffId) {
  const entry = state.housekeeping.find((item) => item.unitId === unitId);
  if (!entry) return;
  Object.assign(entry, { status, note, updatedAt: demoNow(state), updatedBy: staffId });
}

// ---------- Website ----------

export function addInquiry({ name, mobile, message }) {
  return update((state) => {
    const guest = findOrCreateGuest(state, { name, mobile });
    const inquiry = {
      id: nextId(state.inquiries, 'IQ'),
      channel: 'website',
      guestId: guest.id,
      from: guest.name,
      receivedAt: demoNow(state),
      topic: 'availability',
      message,
      status: 'new',
      assignedTo: null,
      firstReplyMinutes: null,
      relatedBookingId: null,
    };
    state.inquiries.unshift(inquiry);
    return inquiry;
  });
}

// ---------- Bookings ----------

/**
 * @param {object} input guestName, mobile, source, product, date, adults, kids,
 *   deposit, method, reference, notes, inquiryId
 */
export function createBooking(input, staffId) {
  return update((state) => {
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
  });
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
    if (findUnit(state, booking.product)) setUnitHousekeeping(state, booking.product, 'occupied', null, staffId);
    return booking;
  });
}

export function checkOut(bookingId, staffId) {
  return update((state) => {
    const booking = findBooking(state, bookingId);
    Object.assign(booking, { status: 'checked_out', checkedOutAt: demoNow(state) });
    logActivity(state, staffId, 'booking.checked_out', booking.id);
    if (findUnit(state, booking.product)) {
      setUnitHousekeeping(state, booking.product, 'cleaning', `Turnover after ${booking.id}`, staffId);
    }
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

// ---------- Inbox and housekeeping ----------

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

export function updateHousekeeping(unitId, { status, note }, staffId) {
  return update((state) => {
    setUnitHousekeeping(state, unitId, status, note?.trim() || null, staffId);
    logActivity(state, staffId, 'housekeeping.updated', unitId, status);
  });
}
