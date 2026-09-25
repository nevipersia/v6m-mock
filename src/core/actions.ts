// State changes shared by V6M Desk and the booking page. Every action goes
// through store.update(), which saves to localStorage and re-renders subscribers.

import { update } from './store.js';
import { addDays, formatDate, peso, plural } from './format.js';
import {
  DOWNPAYMENT_RATE, METHOD_LABELS, STAGE_LABELS, bookingWindow, checkAvailability, depositRequired, discountAmount,
  discountProblem, downpaymentDue, findBooking, findExclusive, findGuest, findPackage, findStaff, findUnit, isActive,
  isEditable, productLabel, quote, sessionFor, type DiscountInput,
} from './rules.js';
import { formatReference, referenceProblem } from './qr-payment.js';
import type {
  Booking, BookingLink, BookingSource, Companion, EventPackage, EventStage, ExtraCharge, Guest, ISODate, Inquiry, Invite,
  Payment, PaymentMethod, Permission, PriceLine, ResortEvent, Role, Staff, StaffStatus, State, Timestamp,
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

interface GuestDetails {
  name: string;
  mobile?: string | null;
  address?: string | null;
  email?: string | null;
}

/** Finds the guest by name or adds them; any details given fill in or update the record. */
function findOrCreateGuest(state: State, { name, mobile, address, email }: GuestDetails): Guest {
  const cleanName = name.trim();
  let guest = state.guests.find((g) => g.name.toLowerCase() === cleanName.toLowerCase());
  if (!guest) {
    guest = { id: nextId(state.guests, 'GU'), name: cleanName, mobile: mobile || null, address: null, email: null };
    state.guests.push(guest);
  }
  if (mobile?.trim()) guest.mobile = mobile.trim();
  if (address?.trim()) guest.address = address.trim();
  if (email?.trim()) guest.email = email.trim();
  return guest;
}

/** Keeps rows that have a name; trims text and clamps ages. */
export const cleanGuestList = (list: Companion[] = []): Companion[] => list
  .filter((row) => row.name.trim())
  .map((row) => ({
    name: row.name.trim(),
    gender: row.gender === 'Female' || row.gender === 'Male' ? row.gender : '',
    age: row.age == null || Number.isNaN(row.age) ? null : Math.max(0, Math.min(120, Math.round(row.age))),
    remarks: row.remarks.trim(),
  }));

const cleanExtras = (extras: ExtraCharge[] = []): ExtraCharge[] =>
  extras.filter((extra) => extra.label.trim() && extra.amount > 0).map((extra) => ({ label: extra.label.trim(), amount: Math.round(extra.amount) }));

interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  via?: 'desk' | 'qr';
  /** "Time sent" on the guest's receipt, as HH:MM on the demo date. */
  sentTime?: string | null;
  senderName?: string | null;
}

/**
 * Records a payment. A booking on hold only becomes confirmed once the 50%
 * downpayment is met; anything less stays on hold as a partial payment.
 */
function applyPayment(state: State, booking: Booking, { amount, method, reference, via = 'desk', sentTime, senderName }: PaymentInput, staffId: string | null): Payment {
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
    sentAt: sentTime && /^\d\d:\d\d$/.test(sentTime) ? `${state.meta.asOf}T${sentTime}:00+08:00` : via === 'qr' ? demoNow(state) : null,
    senderName: senderName?.trim() || null,
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
  /** Optional manual discount; checked against the staff member's role. */
  discount?: DiscountInput | null;
  address?: string;
  email?: string;
  scPwd?: number;
  extras?: ExtraCharge[];
  guestList?: Companion[];
  /** Payment details for the downpayment, from the guest's receipt. */
  sentTime?: string;
  senderName?: string;
}

export function createBooking(input: NewBooking, staffId: string): Booking {
  return update((state) => createBookingInState(state, input, staffId));
}

/** Sets total, downpayment and balance from the pricing and any manual discount. */
function reprice(state: State, booking: Booking, staffId: string): void {
  booking.total = booking.pricing.total - (booking.discount?.amount ?? 0);
  booking.depositRequired = depositRequired(state, booking.product, booking.total);
  booking.balance = booking.total - booking.paid;
  if (booking.status === 'hold' && booking.paid > 0 && downpaymentDue(booking) === 0) {
    booking.status = 'confirmed';
    logActivity(state, staffId, 'booking.confirmed', booking.id, 'Downpayment met after the price changed');
  } else if (booking.status === 'confirmed' && downpaymentDue(booking) > 0) {
    booking.status = 'hold';
    logActivity(state, staffId, 'booking.unconfirmed', booking.id, `${peso(downpaymentDue(booking))} short of the downpayment after the price changed`);
  }
}

/** Records the discount on the booking; the caller has already checked it. */
function setDiscount(state: State, booking: Booking, input: DiscountInput, staffId: string): void {
  const amount = discountAmount(booking.pricing.total, input.kind, input.value);
  booking.discount = {
    kind: input.kind,
    value: input.value,
    amount,
    note: input.note?.trim() || null,
    by: staffId,
    at: demoNow(state),
  };
  const what = input.kind === 'percent' ? `${input.value}% (${peso(amount)})` : peso(amount);
  logActivity(state, staffId, 'booking.discounted', booking.id, booking.discount.note ? `${what} · ${booking.discount.note}` : what);
  reprice(state, booking, staffId);
}

export type DiscountResult = { error: string } | { error?: undefined; booking: Booking };

/** Gives or replaces a manual discount on an existing booking. */
export function applyDiscount(bookingId: string, input: DiscountInput, staffId: string): DiscountResult {
  return update((state): DiscountResult => {
    const booking = findBooking(state, bookingId);
    const staff = findStaff(state, staffId);
    if (!booking || !staff) return { error: 'This booking no longer exists.' };
    const problem = discountProblem(staff, input, booking.pricing.total, booking.paid);
    if (problem) return { error: problem };
    setDiscount(state, booking, input, staffId);
    return { booking };
  });
}

export function removeDiscount(bookingId: string, staffId: string): DiscountResult {
  return update((state): DiscountResult => {
    const booking = findBooking(state, bookingId);
    const staff = findStaff(state, staffId);
    if (!booking || !staff) return { error: 'This booking no longer exists.' };
    if (!staff.permissions.includes('discounts.apply')) return { error: 'Your account cannot change discounts.' };
    if (!booking.discount) return { booking };
    booking.discount = null;
    reprice(state, booking, staffId);
    logActivity(state, staffId, 'booking.discount_removed', booking.id);
    return { booking };
  });
}

/** Times, session and type for a product on a date. */
function schedule(state: State, product: string, date: ISODate): Pick<Booking, 'session' | 'productType' | 'startsAt' | 'endsAt'> {
  const window = bookingWindow(state, product, date);
  if (findExclusive(state, product)) return { session: 'exclusive', productType: 'exclusive', ...window };
  const unit = findUnit(state, product);
  return { session: sessionFor(state, product).id, productType: unit ? unit.kind : 'entrance', ...window };
}

const sortBookings = (state: State): void => {
  state.bookings.sort((a, b) => (a.date === b.date ? a.startsAt.localeCompare(b.startsAt) : a.date.localeCompare(b.date)));
};

function createBookingInState(state: State, input: NewBooking, staffId: string): Booking {
  const extras = cleanExtras(input.extras);
  const { promo: _promo, warnings: _warnings, ...pricing } = quote(state, { ...input, extras });
  const guest = findOrCreateGuest(state, { name: input.guestName, mobile: input.mobile ?? null, address: input.address ?? null, email: input.email ?? null });
  const when = schedule(state, input.product, input.date);

  const booking: Booking = {
    id: `BK-${input.date.slice(5, 7)}${input.date.slice(8, 10)}-${pad(nextSequence(state.bookings), 3)}`,
    guestId: guest.id,
    guestName: guest.name,
    product: input.product,
    productType: when.productType,
    date: input.date,
    nights: 1,
    session: when.session,
    startsAt: when.startsAt,
    endsAt: when.endsAt,
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
    discount: null,
    scPwd: Math.max(0, Math.round(input.scPwd ?? 0)),
    extras,
    guestList: cleanGuestList(input.guestList),
  };

  const staff = findStaff(state, staffId);
  if (input.discount && staff && !discountProblem(staff, input.discount, booking.pricing.total)) {
    setDiscount(state, booking, input.discount, staffId);
  }

  state.bookings.push(booking);
  sortBookings(state);
  logActivity(state, staffId, 'booking.created', booking.id, `${booking.guestName} · ${booking.product} · ${booking.date}`);

  if (input.deposit > 0) {
    applyPayment(state, booking, {
      amount: input.deposit, method: input.method, reference: input.reference ?? null,
      sentTime: input.sentTime ?? null, senderName: input.senderName ?? null,
    }, staffId);
  }

  const inquiry = input.inquiryId ? state.inquiries.find((item) => item.id === input.inquiryId) : undefined;
  if (inquiry) Object.assign(inquiry, { status: 'booked', relatedBookingId: booking.id, assignedTo: staffId } satisfies Partial<Inquiry>);

  return booking;
}

export interface BookingEdit {
  guestName: string;
  mobile: string;
  address: string;
  email: string;
  scPwd: number;
  extras: ExtraCharge[];
  source: BookingSource;
  product: string;
  date: ISODate;
  adults: number;
  kids: number;
  notes: string;
  /** A new discount, null to remove it, or 'keep' to leave the current one as it is. */
  discount: DiscountInput | null | 'keep';
  /** The companions sheet. Left out, the current list stays. */
  guestList?: Companion[];
}

export type EditResult = { error: string } | { error?: undefined; booking: Booking };

/**
 * Changes a booking that has not arrived yet. Payments stay; the price,
 * discount and 50% downpayment are worked out again, so the booking can move
 * between on hold and confirmed.
 */
export function updateBooking(bookingId: string, input: BookingEdit, staffId: string): EditResult {
  return update((state): EditResult => {
    const booking = findBooking(state, bookingId);
    const staff = findStaff(state, staffId);
    if (!booking || !staff) return { error: 'This booking no longer exists.' };
    if (!staff.permissions.includes('bookings.write')) return { error: 'Your account cannot edit bookings.' };
    if (!isEditable(state, booking)) return { error: 'This booking can no longer be edited.' };

    const guests = input.adults + input.kids;
    const unit = findUnit(state, input.product);
    const availability = checkAvailability(state, { ...input, excludeId: booking.id });
    if (!input.guestName.trim()) return { error: 'Enter the guest name.' };
    if (guests === 0) return { error: 'Add at least one guest.' };
    if (!availability.ok) return { error: availability.reason ?? 'Not available.' };
    if (unit && guests > unit.capacityMax) return { error: `${unit.name} fits up to ${unit.capacityMax} guests.` };

    const extras = cleanExtras(input.extras);
    const { promo: _promo, warnings: _warnings, ...pricing } = quote(state, { ...input, extras });
    const current = booking.discount ?? null;
    let discount: DiscountInput | null;
    if (input.discount === 'keep') {
      discount = current;
    } else {
      if (!staff.permissions.includes('discounts.apply')) return { error: 'Your account cannot change discounts.' };
      discount = input.discount;
      if (discount) {
        const problem = discountProblem(staff, discount, pricing.total, booking.paid);
        if (problem) return { error: problem };
      }
    }
    const off = discount ? discountAmount(pricing.total, discount.kind, discount.value) : 0;
    if (pricing.total - off < booking.paid) {
      return { error: `The guest already paid ${peso(booking.paid)}, so the new total can't be less than that.` };
    }

    const changes: string[] = [];
    const before = { product: booking.product, date: booking.date, guests: booking.adults + booking.kids, total: booking.total };

    const guest = findOrCreateGuest(state, { name: input.guestName, mobile: input.mobile, address: input.address, email: input.email });
    if (guest.id !== booking.guestId) changes.push(`guest ${booking.guestName} → ${guest.name}`);

    Object.assign(booking, {
      guestId: guest.id,
      guestName: guest.name,
      source: input.source,
      product: input.product,
      date: input.date,
      adults: input.adults,
      kids: input.kids,
      notes: input.notes.trim() || null,
      scPwd: Math.max(0, Math.round(input.scPwd)),
      extras,
      pricing,
      ...schedule(state, input.product, input.date),
    } satisfies Partial<Booking>);

    if (input.guestList) {
      const list = cleanGuestList(input.guestList);
      const before_ = booking.guestList ?? [];
      if (list.length !== before_.length || list.some((row, index) => row.name !== before_[index]?.name)) {
        changes.push(`${list.length} on the guest list`);
      }
      booking.guestList = list;
    }

    if (input.discount === 'keep') {
      if (current) booking.discount = { ...current, amount: discountAmount(pricing.total, current.kind, current.value) };
    } else if (!discount) {
      if (current) changes.push('discount removed');
      booking.discount = null;
    } else {
      const same = current && current.kind === discount.kind && current.value === discount.value && (current.note ?? '') === (discount.note?.trim() ?? '');
      booking.discount = same && current
        ? { ...current, amount: off }
        : { kind: discount.kind, value: discount.value, amount: off, note: discount.note?.trim() || null, by: staffId, at: demoNow(state) };
      if (!same) {
        const what = discount.kind === 'percent' ? `${discount.value}% (${peso(off)})` : peso(off);
        logActivity(state, staffId, 'booking.discounted', booking.id, booking.discount.note ? `${what} · ${booking.discount.note}` : what);
      }
    }

    reprice(state, booking, staffId);
    sortBookings(state);

    if (before.product !== booking.product) changes.push(`${productLabel(state, before.product)} → ${productLabel(state, booking.product)}`);
    if (before.date !== booking.date) changes.push(`${before.date} → ${booking.date}`);
    if (before.guests !== booking.adults + booking.kids) changes.push(`${before.guests} → ${booking.adults + booking.kids} guests`);
    if (before.total !== booking.total) changes.push(`total ${peso(before.total)} → ${peso(booking.total)}`);
    logActivity(state, staffId, 'booking.updated', booking.id, changes.join(' · ') || 'Details updated');
    return { booking };
  });
}

/** Saves the guest list (the companions sheet). */
export function setGuestList(bookingId: string, list: Companion[], staffId: string): Booking {
  return update((state) => {
    const booking = must(findBooking(state, bookingId), `Booking ${bookingId}`);
    booking.guestList = cleanGuestList(list);
    logActivity(state, staffId, 'booking.guest_list', booking.id, `${booking.guestList.length} on the guest list`);
    return booking;
  });
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
export function payByQr(bookingId: string, reference: string, staffId: string | null, senderName?: string | null): QrPaymentResult {
  return update((state): QrPaymentResult => {
    const booking = findBooking(state, bookingId);
    if (!booking) return { error: 'This booking no longer exists.' };
    const amount = downpaymentDue(booking);
    if (amount === 0) return { error: 'The downpayment for this booking is already paid.' };
    const problem = referenceProblem(state, reference);
    if (problem) return { error: problem };
    if (senderName !== undefined && !senderName?.trim()) return { error: 'Enter the name on the GCash account that sent the payment.' };
    const payment = applyPayment(state, booking, { amount, method: 'gcash', reference: formatReference(reference), via: 'qr', senderName }, staffId);
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

// ---------- Private events ----------

export interface NewEvent {
  title: string;
  date: ISODate;
  packageId: string;
  addOns: { item: string; amount: number }[];
  guests: number;
  /** Closes the resort for the day: no other bookings can be taken. */
  exclusive: boolean;
  stage: EventStage;
  contactName: string;
  contactMobile: string;
  coordinatorId: string;
  ocularDate: ISODate;
  notes: string;
  /** Recorded against the booking, for events that are already reserved. */
  deposit: number;
  method: PaymentMethod;
}

export type EventResult = { error: string } | { error?: undefined; event: ResortEvent; booking: Booking | null };

/** Stages that mean the date is taken, so the event carries a booking. */
const BOOKED_STAGES: EventStage[] = ['reserved', 'paid', 'done'];

const eventTotal = (event: Pick<ResortEvent, 'packagePrice' | 'addOns'>): number =>
  event.packagePrice + event.addOns.reduce((sum, addOn) => sum + addOn.amount, 0);

/** "14:00-06:00" from the package, as the day's start and end. */
function eventWindow(pkg: EventPackage, date: ISODate): { startsAt: Timestamp; endsAt: Timestamp } {
  const [start = '14:00', end = '06:00'] = pkg.hours.split('-');
  const endDate = end <= start ? addDays(date, 1) : date;
  return { startsAt: `${date}T${start}:00+08:00`, endsAt: `${endDate}T${end}:00+08:00` };
}

/** Bookings already on that date that an all-day event would clash with. */
const clashesOn = (state: State, date: ISODate): Booking[] =>
  state.bookings.filter((booking) => isActive(booking) && booking.date === date && booking.product !== 'event');

function makeEventBooking(state: State, event: ResortEvent, contactName: string, staffId: string): Booking {
  const pkg = must(findPackage(state, event.packageId), 'Event package');
  const guest = findOrCreateGuest(state, { name: contactName, mobile: null });
  const lines: PriceLine[] = [
    { label: pkg.name, qty: 1, unitPrice: event.packagePrice, amount: event.packagePrice },
    ...event.addOns.map((addOn) => ({ label: addOn.item, qty: 1, unitPrice: addOn.amount, amount: addOn.amount })),
  ];
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const window = eventWindow(pkg, event.date);

  const booking: Booking = {
    id: `BK-${event.date.slice(5, 7)}${event.date.slice(8, 10)}-${pad(nextSequence(state.bookings), 3)}`,
    guestId: guest.id,
    guestName: guest.name,
    product: 'event',
    productType: 'event',
    date: event.date,
    nights: 1,
    session: 'exclusive',
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    adults: event.guests,
    kids: 0,
    pets: null,
    source: 'messenger',
    status: 'hold',
    pricing: { lines, subtotal: total, promoId: null, discount: 0, total },
    total,
    depositRequired: Math.ceil(total * DOWNPAYMENT_RATE),
    paid: 0,
    balance: total,
    idVerified: false,
    eventId: event.id,
    createdAt: demoNow(state),
    createdBy: staffId,
    checkedInAt: null,
    checkedOutAt: null,
    cancelledAt: null,
    cancelReason: null,
    notes: event.notes,
    discount: null,
    scPwd: 0,
    extras: [],
    guestList: [],
  };

  state.bookings.push(booking);
  sortBookings(state);
  event.bookingId = booking.id;
  logActivity(state, staffId, 'booking.created', booking.id, `${event.title} · event · ${event.date}`);
  return booking;
}

/**
 * Puts a private event in the pipeline. An event that is already reserved also
 * gets its booking, which is what closes the date on the calendar.
 */
export function createEvent(input: NewEvent, staffId: string): EventResult {
  return update((state): EventResult => {
    const staff = findStaff(state, staffId);
    if (!staff?.permissions.includes('events.manage')) return { error: 'Your account cannot manage events.' };

    const pkg = findPackage(state, input.packageId);
    if (!pkg) return { error: 'Pick an event package.' };
    if (!input.title.trim()) return { error: 'Give the event a name.' };
    if (!input.contactName.trim()) return { error: 'Enter who is arranging it.' };
    if (!input.date) return { error: 'Pick the event date.' };
    if (input.guests < 1) return { error: 'Add how many guests are coming.' };
    if (input.guests > pkg.maxGuests) return { error: `${pkg.name} takes up to ${pkg.maxGuests} guests.` };

    const taken = BOOKED_STAGES.includes(input.stage);
    const closes = input.exclusive;
    const existing = state.events.find((event) => event.date === input.date && event.blocksCalendar);
    if (taken && closes && existing) return { error: `${existing.title} already closes the resort on ${formatDate(input.date)}.` };
    const clashes = taken && closes ? clashesOn(state, input.date) : [];
    if (clashes.length) {
      return { error: `${plural(clashes.length, 'booking')} already on ${formatDate(input.date)}. Move or cancel ${clashes.length === 1 ? 'it' : 'them'} before closing the resort.` };
    }

    const addOns = input.addOns.filter((addOn) => addOn.item.trim() && addOn.amount > 0)
      .map((addOn) => ({ item: addOn.item.trim(), amount: Math.round(addOn.amount) }));
    const contact = findOrCreateGuest(state, { name: input.contactName, mobile: input.contactMobile || null });

    const event: ResortEvent = {
      id: nextId(state.events, 'EV', 3),
      title: input.title.trim(),
      type: pkg.id.replace('PKG-', '').toLowerCase(),
      date: input.date,
      packageId: pkg.id,
      packagePrice: pkg.price,
      addOns,
      total: 0,
      guests: Math.round(input.guests),
      exclusive: closes,
      blocksCalendar: taken && closes,
      stage: input.stage,
      contactGuestId: contact.id,
      coordinatorId: input.coordinatorId || staffId,
      ocularDate: input.ocularDate || input.date,
      bookingId: null,
      notes: input.notes.trim() || null,
    };
    event.total = eventTotal(event);
    state.events.push(event);
    state.events.sort((a, b) => a.date.localeCompare(b.date));
    logActivity(state, staffId, 'event.created', event.id, `${event.title} · ${formatDate(event.date)} · ${STAGE_LABELS[event.stage]}`);

    let booking: Booking | null = null;
    if (taken) {
      booking = makeEventBooking(state, event, contact.name, staffId);
      if (input.deposit > 0) applyPayment(state, booking, { amount: Math.min(input.deposit, booking.total), method: input.method }, staffId);
    }
    return { event, booking };
  });
}

/** Turns a pipeline event into a booking: the date is taken from now on. */
export function bookEvent(eventId: string, staffId: string): EventResult {
  return update((state): EventResult => {
    const staff = findStaff(state, staffId);
    if (!staff?.permissions.includes('events.manage')) return { error: 'Your account cannot manage events.' };
    const event = state.events.find((item) => item.id === eventId);
    if (!event) return { error: 'This event no longer exists.' };
    if (event.bookingId) return { error: 'This event already has a booking.' };

    const clashes = event.exclusive ? clashesOn(state, event.date) : [];
    if (clashes.length) {
      return { error: `${plural(clashes.length, 'booking')} already on ${formatDate(event.date)}. Move or cancel ${clashes.length === 1 ? 'it' : 'them'} before closing the resort.` };
    }

    const contact = findGuest(state, event.contactGuestId);
    const booking = makeEventBooking(state, event, contact?.name ?? event.title, staffId);
    event.bookingId = booking.id;
    event.blocksCalendar = event.exclusive;
    if (event.stage === 'inquiry' || event.stage === 'ocular') event.stage = 'reserved';
    logActivity(state, staffId, 'event.booked', event.id, `${event.title} · ${peso(booking.total)}`);
    return { event, booking };
  });
}

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

export type GuestBooking = Pick<NewBooking, 'guestName' | 'mobile' | 'product' | 'date' | 'adults' | 'kids' | 'notes' | 'address' | 'email' | 'scPwd' | 'guestList'>;

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
