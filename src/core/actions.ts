// State changes shared by V6M Desk and the booking page. Every action goes
// through store.update(), which saves to localStorage and re-renders subscribers.

import { update } from './store.js';
import { addDays, formatDate, isEmail, isPHMobile, peso, plural } from './format.js';
import {
  DOWNPAYMENT_RATE, METHOD_LABELS, STAGE_LABELS, bookingWindow, checkAvailability, depositRequired, discountAmount,
  discountProblem, downpaymentDue, findBooking, findExclusive, findGuest, findPackage, findStaff, findUnit, isActive,
  isEditable, findPromo, live, productLabel, quote, sessionFor, type DiscountInput,
} from './rules.js';
import { formatReference, referenceProblem } from './qr-payment.js';
import type {
  Booking, BookingLink, BookingSource, Companion, EventPackage, EventStage, Expense, ExpenseCategory, ExtraCharge, Guest,
  ISODate, Inquiry, Invite, Payment, PaymentMethod, Permission, PriceLine, Promo, ResortEvent, Role, Staff, StaffStatus, State,
  Timestamp,
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

const digits = (value: string | null | undefined): string => String(value ?? '').replace(/\D/g, '').replace(/^63/, '0');

/**
 * Finds the guest or adds them; any details given fill in or update the record.
 * With a mobile number the number must match too, so two guests who share a
 * name never overwrite each other's contact details.
 */
function findOrCreateGuest(state: State, { name, mobile, address, email }: GuestDetails): Guest {
  const cleanName = name.trim();
  const phone = digits(mobile);
  let guest = state.guests.find((g) => g.name.toLowerCase() === cleanName.toLowerCase()
    && (!phone || !g.mobile || digits(g.mobile) === phone));
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
/**
 * Keeps an event's stage in step with its booking's money: paid in full moves
 * it to Paid, and a balance coming back (a discount taken off, a price raised)
 * moves it back to Reserved. Done is left alone; the event has happened.
 */
function syncEventStage(state: State, booking: Booking, staffId: string | null): void {
  const event = state.events.find((item) => item.bookingId === booking.id);
  if (!event || event.stage === 'done' || !isActive(booking)) return;
  if (booking.balance <= 0 && event.stage !== 'paid') {
    event.stage = 'paid';
    logActivity(state, staffId, 'event.paid', event.id, `${event.title} · paid in full`);
  } else if (booking.balance > 0 && event.stage === 'paid') {
    event.stage = 'reserved';
    logActivity(state, staffId, 'event.reserved', event.id, `${event.title} · ${peso(booking.balance)} still owed`);
  }
}

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
  syncEventStage(state, booking, staffId);
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
  syncEventStage(state, booking, staffId);
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
    const availability = checkAvailability(state, { ...input, excludeId: booking.id, overLimits: true });
    if (!input.guestName.trim()) return { error: 'Enter the guest name.' };
    if (guests === 0) return { error: 'Add at least one guest.' };
    if (!availability.ok) return { error: availability.reason ?? 'Not available.' };

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
    // An event checked out has happened; it leaves the Events page for Bookings.
    const event = state.events.find((item) => item.bookingId === booking.id);
    if (event && event.stage !== 'done') {
      event.stage = 'done';
      logActivity(state, staffId, 'event.done', event.id, event.title);
    }
    return booking;
  });
}

export function cancelBooking(bookingId: string, reason: string, staffId: string): Booking {
  return update((state) => {
    const booking = must(findBooking(state, bookingId), `Booking ${bookingId}`);
    Object.assign(booking, { status: 'cancelled', cancelledAt: demoNow(state), cancelReason: reason } satisfies Partial<Booking>);
    // A cancelled event no longer closes the resort that day.
    const event = state.events.find((item) => item.bookingId === booking.id);
    if (event) event.blocksCalendar = false;
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
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  // An event package's promotion takes its percent off the whole event, as it does for a stay.
  const promo = findPromo(state, { product: pkg.id, date: event.date, guests: event.guests });
  const promoOff = promo ? Math.round((subtotal * promo.percent) / 100) : 0;
  const total = subtotal - promoOff;
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
    pricing: { lines, subtotal, promoId: promo?.id ?? null, discount: promoOff, total },
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
 * Why an event can't be saved as entered, or null. An inquiry is only a lead:
 * whatever is known so far saves, and the rest is asked for once it is reserved.
 */
function eventProblem(state: State, input: NewEvent, pkg: EventPackage, ignoreId?: string): string | null {
  if (!input.date) return 'Pick the event date.';
  if (input.stage !== 'inquiry') {
    if (!input.title.trim()) return 'Give the event a name.';
    if (!input.contactName.trim()) return 'Enter who is arranging it.';
    if (input.guests < 1) return 'Add how many guests are coming.';
    if (input.guests > pkg.maxGuests) return `${pkg.name} takes up to ${pkg.maxGuests} guests.`;
  }
  if (!BOOKED_STAGES.includes(input.stage) || !input.exclusive) return null;
  const existing = state.events.find((event) => event.id !== ignoreId && event.date === input.date && event.blocksCalendar);
  if (existing) return `${existing.title} already closes the resort on ${formatDate(input.date)}.`;
  const clashes = clashesOn(state, input.date);
  if (clashes.length) {
    return `${plural(clashes.length, 'booking')} already on ${formatDate(input.date)}. Move or cancel ${clashes.length === 1 ? 'it' : 'them'} before closing the resort.`;
  }
  return null;
}

/** The event's own fields from the form, finding or adding the contact as a guest. */
function eventFields(state: State, input: NewEvent, pkg: EventPackage, staffId: string): { fields: Omit<ResortEvent, 'id' | 'bookingId'>; contact: Guest | null } {
  const taken = BOOKED_STAGES.includes(input.stage);
  const addOns = input.addOns.filter((addOn) => addOn.item.trim() && addOn.amount > 0)
    .map((addOn) => ({ item: addOn.item.trim(), amount: Math.round(addOn.amount) }));
  const contactName = input.contactName.trim() || input.contactMobile.trim();
  const contact = contactName ? findOrCreateGuest(state, { name: contactName, mobile: input.contactMobile || null }) : null;
  const fields: Omit<ResortEvent, 'id' | 'bookingId'> = {
    title: input.title.trim() || (contact ? `${contact.name} inquiry` : 'Event inquiry'),
    type: pkg.id.replace('PKG-', '').toLowerCase(),
    date: input.date,
    packageId: pkg.id,
    packagePrice: pkg.price,
    addOns,
    total: 0,
    guests: Math.max(0, Math.round(input.guests) || 0),
    exclusive: input.exclusive,
    blocksCalendar: taken && input.exclusive,
    stage: input.stage,
    contactGuestId: contact?.id ?? '',
    coordinatorId: input.coordinatorId || staffId,
    notes: input.notes.trim() || null,
  };
  fields.total = eventTotal(fields);
  return { fields, contact };
}

/** Writes the booking for an event that has reached a booked stage, with any downpayment. */
function bookIfTaken(state: State, event: ResortEvent, input: NewEvent, contact: Guest | null, staffId: string): Booking | null {
  if (!BOOKED_STAGES.includes(event.stage)) return null;
  const booking = makeEventBooking(state, event, contact?.name ?? event.title, staffId);
  if (input.deposit > 0) applyPayment(state, booking, { amount: Math.min(input.deposit, booking.total), method: input.method }, staffId);
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
    const problem = eventProblem(state, input, pkg);
    if (problem) return { error: problem };

    const { fields, contact } = eventFields(state, input, pkg, staffId);
    const event: ResortEvent = { id: nextId(state.events, 'EV', 3), ...fields, bookingId: null };
    state.events.push(event);
    state.events.sort((a, b) => a.date.localeCompare(b.date));
    logActivity(state, staffId, 'event.created', event.id, `${event.title} · ${formatDate(event.date)} · ${STAGE_LABELS[event.stage]}`);
    return { event, booking: bookIfTaken(state, event, input, contact, staffId) };
  });
}

/**
 * Fills in or changes an inquiry. Moving it to Reserved or Paid books it, the
 * same as saving a new event at that stage. Booked events change through
 * their booking instead.
 */
export function updateEvent(eventId: string, input: NewEvent, staffId: string): EventResult {
  return update((state): EventResult => {
    const staff = findStaff(state, staffId);
    if (!staff?.permissions.includes('events.manage')) return { error: 'Your account cannot manage events.' };
    const event = state.events.find((item) => item.id === eventId);
    if (!event) return { error: 'This event no longer exists.' };
    if (event.bookingId) return { error: 'This event is booked already. Change it from its booking.' };
    const pkg = findPackage(state, input.packageId);
    if (!pkg) return { error: 'Pick an event package.' };
    const problem = eventProblem(state, input, pkg, event.id);
    if (problem) return { error: problem };

    const { fields, contact } = eventFields(state, input, pkg, staffId);
    Object.assign(event, fields);
    state.events.sort((a, b) => a.date.localeCompare(b.date));
    logActivity(state, staffId, 'event.updated', event.id, `${event.title} · ${formatDate(event.date)} · ${STAGE_LABELS[event.stage]}`);
    return { event, booking: bookIfTaken(state, event, input, contact, staffId) };
  });
}

/** Removes an inquiry that came to nothing. Booked events are cancelled through their booking. */
export function deleteEvent(eventId: string, staffId: string): { error: string } | { error?: undefined; event: ResortEvent } {
  return update((state) => {
    const staff = findStaff(state, staffId);
    if (!staff?.permissions.includes('events.manage')) return { error: 'Your account cannot manage events.' };
    const at = state.events.findIndex((item) => item.id === eventId);
    const event = state.events[at];
    if (!event) return { error: 'This event no longer exists.' };
    if (event.bookingId) return { error: 'This event is booked. Cancel its booking instead.' };
    state.events.splice(at, 1);
    logActivity(state, staffId, 'event.removed', event.id, event.title);
    return { event };
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
    if (event.stage === 'inquiry') event.stage = 'reserved';
    logActivity(state, staffId, 'event.booked', event.id, `${event.title} · ${peso(booking.total)}`);
    return { event, booking };
  });
}

// ---------- Expenses ----------

/** What the expense form collects. Amount and date are the only hard fields. */
export interface NewExpense {
  date: ISODate;
  category: ExpenseCategory;
  item: string;
  amount: number;
  method: PaymentMethod;
  vendor: string;
  note: string;
}

export type ExpenseResult = { expense: Expense; error?: undefined } | { expense?: undefined; error: string };

/** Checks shared by recording and editing: the same rules either way. */
function expenseProblem(state: State, input: NewExpense): string | null {
  if (!input.item.trim()) return 'Say what the money was spent on.';
  if (!input.date) return 'Pick the day it was spent.';
  if (input.date > state.meta.asOf) return 'That date is in the future. Record it on the day it was spent.';
  if (!Number.isFinite(input.amount) || input.amount <= 0) return 'Enter how much it was.';
  return null;
}

const expenseFields = (input: NewExpense): Omit<Expense, 'id' | 'recordedBy' | 'createdAt'> => ({
  date: input.date,
  category: input.category,
  item: input.item.trim(),
  amount: Math.round(input.amount),
  method: input.method,
  vendor: input.vendor.trim() || null,
  note: input.note.trim() || null,
});

export function recordExpense(input: NewExpense, staffId: string): ExpenseResult {
  return update((state): ExpenseResult => {
    const staff = findStaff(state, staffId);
    if (!staff?.permissions.includes('expenses.manage')) return { error: 'Your account cannot record expenses.' };
    const problem = expenseProblem(state, input);
    if (problem) return { error: problem };

    const expense: Expense = {
      id: nextId(state.expenses, 'EXP'),
      ...expenseFields(input),
      recordedBy: staffId,
      createdAt: demoNow(state),
    };
    state.expenses.push(expense);
    logActivity(state, staffId, 'expense.recorded', expense.id, `${expense.item} · ${peso(expense.amount)}`);
    return { expense };
  });
}

export function updateExpense(expenseId: string, input: NewExpense, staffId: string): ExpenseResult {
  return update((state): ExpenseResult => {
    const staff = findStaff(state, staffId);
    if (!staff?.permissions.includes('expenses.manage')) return { error: 'Your account cannot record expenses.' };
    const expense = state.expenses.find((item) => item.id === expenseId);
    if (!expense) return { error: 'That expense is no longer there.' };
    const problem = expenseProblem(state, input);
    if (problem) return { error: problem };

    Object.assign(expense, expenseFields(input));
    logActivity(state, staffId, 'expense.updated', expense.id, `${expense.item} · ${peso(expense.amount)}`);
    return { expense };
  });
}

export function removeExpense(expenseId: string, staffId: string): ExpenseResult {
  return update((state): ExpenseResult => {
    const staff = findStaff(state, staffId);
    if (!staff?.permissions.includes('expenses.manage')) return { error: 'Your account cannot record expenses.' };
    const index = state.expenses.findIndex((item) => item.id === expenseId);
    const expense = state.expenses[index];
    if (!expense) return { error: 'That expense is no longer there.' };

    state.expenses.splice(index, 1);
    logActivity(state, staffId, 'expense.removed', expense.id, `${expense.item} · ${peso(expense.amount)}`);
    return { expense };
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

/**
 * `retry` means the guest can fix the form and send it again (the date filled
 * up meanwhile, say); without it the link itself is the problem.
 */
export type BookingLinkResult = { error: string; retry?: boolean } | { error?: undefined; booking: Booking; link: BookingLink };

const text = (value: unknown, max = 500): string => (typeof value === 'string' ? value.slice(0, max) : '');
const count = (value: unknown): number => (Number.isInteger(value) && (value as number) >= 0 ? Math.min(value as number, 500) : 0);

/**
 * Keeps only what a guest may set. Anything else a request carries (a
 * discount, a deposit, extra charges) is dropped, because a guest's browser
 * can send whatever it likes.
 */
export function guestBookingInput(raw: unknown): GuestBooking {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(input.guestList) ? input.guestList.slice(0, 200) : [];
  return {
    guestName: text(input.guestName, 120),
    mobile: text(input.mobile, 40),
    email: text(input.email, 200),
    address: text(input.address, 300),
    product: text(input.product, 60),
    date: text(input.date, 10),
    adults: count(input.adults),
    kids: count(input.kids),
    scPwd: count(input.scPwd),
    notes: text(input.notes, 1000),
    guestList: list.map((row): Companion => {
      const item = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      const gender = item.gender === 'Female' || item.gender === 'Male' ? item.gender : '';
      return { name: text(item.name, 120), gender, age: count(item.age) || null, remarks: text(item.remarks, 200) };
    }),
  };
}

const isGuestProduct = (state: State, product: string): boolean =>
  [...live(state.poolSessions), ...live(state.units), ...live(state.exclusivePackages)].some((item) => item.id === product);

/**
 * Everything a guest's booking must satisfy, checked on the booking page and
 * again by whoever saves it. @returns the first problem, or '' when it is fine.
 */
export function guestBookingProblem(state: State, input: GuestBooking): string {
  const guests = input.adults + input.kids;
  if (!input.guestName?.trim()) return 'Enter your name.';
  if (!isPHMobile(input.mobile ?? '')) return 'Enter a PH mobile number, like 0917 123 4567.';
  if (input.email?.trim() && !isEmail(input.email)) return 'Enter an email address like maria@example.com, or leave it blank.';
  if (!input.address?.trim()) return 'Enter your complete address.';
  if (!/^\d{4}-\d\d-\d\d$/.test(input.date)) return 'Pick a date.';
  if (input.date < state.meta.asOf) return 'Pick a date from today on.';
  if (!isGuestProduct(state, input.product)) return 'Pick what you are booking.';
  if (guests === 0) return 'Add at least one guest.';
  if ((input.scPwd ?? 0) > guests) return 'Senior / PWD can\'t be more than the number of guests.';
  const availability = checkAvailability(state, input);
  if (!availability.ok) return availability.reason ?? 'That date is not available.';
  const unit = findUnit(state, input.product);
  if (unit && guests > unit.capacityMax) return `${unit.name} fits up to ${unit.capacityMax} guests.`;
  const pkg = findExclusive(state, input.product);
  if (pkg && guests > pkg.maxGuests) return `Exclusive rentals take up to ${pkg.maxGuests} guests.`;
  return '';
}

/** Guest-side submit: creates the booking for the staff member who sent the link. */
export function useBookingLink(code: string, raw: GuestBooking): BookingLinkResult {
  const input = guestBookingInput(raw);
  return update((state): BookingLinkResult => {
    const link = findBookingLink(state, code);
    const problem = bookingLinkProblem(state, link);
    if (problem || !link) return { error: problem ?? 'This booking link is not valid.' };
    const inputProblem = guestBookingProblem(state, input);
    if (inputProblem) return { error: inputProblem, retry: true };

    const booking = createBookingInState(state, { ...input, source: 'booking_link', deposit: 0, method: 'cash' }, link.createdBy);
    link.status = 'used';
    link.bookingId = booking.id;
    link.usedAt = demoNow(state);
    logActivity(state, link.createdBy, 'link.used', link.id, `${booking.guestName} · ${booking.id}`);
    return { booking, link };
  });
}

// ---------- Packages and promotions ----------
//
// Everything that can be booked — entrance sessions, rooms and cottages,
// exclusive rentals and event packages — and the promotions that run on them.
// A package is on at most one promotion. Deleting a package retires it: it
// leaves every picker and page, but old bookings still find its name.

export type PackageKind = 'entrance' | 'unit' | 'exclusive' | 'event';

/** One form for every kind; each kind reads only its own fields. */
export interface PackageDraft {
  kind: PackageKind;
  /** Set when editing; empty when adding. */
  id: string;
  name: string;
  /** Adult entrance for a session; the price for everything else. */
  price: number;
  /** Kid entrance (sessions). */
  kid: number;
  /** Opening hours: a session's, an exclusive rental's or an event's. */
  start: string;
  end: string;
  /** How many guests the pool takes (sessions), or the most a package allows. */
  maxGuests: number;
  /** Rooms and cottages. */
  unitKind: 'room' | 'cottage';
  minGuests: number;
  checkIn: string;
  checkOut: string;
  /** The entrance session a room or cottage comes with. */
  session: string;
  addsEntrance: boolean;
  /** One per line: what a room, cottage or event comes with. */
  inclusions: string;
  priceNote: string;
  /** Exclusive rentals. */
  exclusiveSession: 'day' | 'overnight';
  use: 'full' | 'partial' | 'cottages';
  includes: string;
  /** Events: the whole resort, or shared with other guests. */
  exclusive: boolean;
  /** The one promotion it is on, or '' for none. */
  promoId: string;
}

export type PackageResult = { id: string } | { error: string };

const PACKAGE_WORD: Record<PackageKind, string> = {
  entrance: 'entrance', unit: 'room or cottage', exclusive: 'exclusive rental', event: 'event package',
};

const canManagePackages = (state: State, staffId: string): boolean =>
  !!findStaff(state, staffId)?.permissions.includes('packages.manage');

const listOf = (value: string): string[] => value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
const isTime = (value: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** A form filled from a package, or blank for a new one of that kind. */
export function packageDraft(state: State, kind: PackageKind, id = ''): PackageDraft {
  const blank: PackageDraft = {
    kind, id: '', name: '', price: 0, kid: 0, start: '08:00', end: '17:00', maxGuests: 0,
    unitKind: 'cottage', minGuests: 1, checkIn: '08:00', checkOut: '17:00',
    session: live(state.poolSessions)[0]?.id ?? '', addsEntrance: true, inclusions: '', priceNote: '',
    exclusiveSession: 'day', use: 'full', includes: '', exclusive: true, promoId: '',
  };
  const promoId = id ? state.promos.find((promo) => promo.appliesTo.includes(id))?.id ?? '' : '';
  if (kind === 'entrance') {
    const item = state.poolSessions.find((one) => one.id === id);
    return item ? { ...blank, id, name: item.label, price: item.adult, kid: item.kid, start: item.start, end: item.end, maxGuests: item.capacity, promoId } : blank;
  }
  if (kind === 'unit') {
    const item = findUnit(state, id);
    return item ? {
      ...blank, id, name: item.name, price: item.price, unitKind: item.kind, minGuests: item.capacityMin, maxGuests: item.capacityMax,
      checkIn: item.checkIn, checkOut: item.checkOut, session: item.session, addsEntrance: item.addsEntrance,
      inclusions: item.inclusions.join('\n'), priceNote: item.priceNote ?? '', promoId,
    } : blank;
  }
  if (kind === 'exclusive') {
    const item = findExclusive(state, id);
    return item ? {
      ...blank, id, name: item.name, price: item.price, exclusiveSession: item.session, use: item.use, includes: item.includes,
      start: item.start, end: item.end, maxGuests: item.maxGuests, promoId,
    } : blank;
  }
  const item = findPackage(state, id);
  const [start = '08:00', end = '17:00'] = item?.hours.split('-') ?? [];
  return item ? {
    ...blank, id, name: item.name, price: item.price, maxGuests: item.maxGuests, exclusive: item.exclusive,
    start, end, inclusions: item.inclusions.join('\n'), promoId,
  } : blank;
}

/** What is wrong with a package form, or '' when it can be saved. */
export function packageProblem(state: State, draft: PackageDraft): string {
  if (!draft.name.trim()) return 'Give it a name.';
  if (!(draft.price > 0)) return draft.kind === 'entrance' ? 'Enter the adult rate.' : 'Enter a price above zero.';
  if (draft.kind === 'entrance' && draft.kid < 0) return 'The kid rate cannot be below zero.';
  if (draft.kind !== 'unit' && (!isTime(draft.start) || !isTime(draft.end))) return 'Enter the start and end times.';
  if (draft.kind === 'unit') {
    if (!isTime(draft.checkIn) || !isTime(draft.checkOut)) return 'Enter the check-in and check-out times.';
    if (!(draft.minGuests >= 1)) return 'It takes at least one guest.';
    if (draft.maxGuests < draft.minGuests) return 'The most guests cannot be fewer than the fewest.';
    if (!live(state.poolSessions).some((session) => session.id === draft.session)) return 'Pick the entrance it comes with.';
  } else if (!(draft.maxGuests >= 1)) {
    return draft.kind === 'entrance' ? 'Enter how many guests the pool takes.' : 'Enter the most guests it allows.';
  }
  if (draft.kind === 'exclusive' && !draft.includes.trim()) return 'Say what the rental includes.';
  if (draft.promoId && !state.promos.some((promo) => promo.id === draft.promoId)) return 'That promotion is no longer there.';
  return '';
}

/** Puts a package on one promotion, taking it off any other, or off all of them. */
function setPromo(state: State, packageId: string, promoId: string): void {
  for (const promo of state.promos) {
    promo.appliesTo = promo.appliesTo.filter((id) => id !== packageId);
    if (promo.id === promoId) promo.appliesTo.push(packageId);
  }
}

export function savePackage(draft: PackageDraft, staffId: string): PackageResult {
  return update((state): PackageResult => {
    if (!canManagePackages(state, staffId)) return { error: 'Your account cannot change packages.' };
    const problem = packageProblem(state, draft);
    if (problem) return { error: problem };
    const name = draft.name.trim();
    const adding = !draft.id;
    let id = draft.id;

    if (draft.kind === 'entrance') {
      const fields = { label: name, adult: draft.price, kid: draft.kid, start: draft.start, end: draft.end, capacity: draft.maxGuests };
      const item = state.poolSessions.find((one) => one.id === id);
      if (item) Object.assign(item, fields);
      else state.poolSessions.push({ id: (id = nextId(state.poolSessions, 'SES')), ...fields });
    } else if (draft.kind === 'unit') {
      const fields = {
        name, kind: draft.unitKind, price: draft.price, capacityMin: draft.minGuests, capacityMax: draft.maxGuests,
        checkIn: draft.checkIn, checkOut: draft.checkOut, session: draft.session, addsEntrance: draft.addsEntrance,
        inclusions: listOf(draft.inclusions),
      };
      const note = draft.priceNote.trim();
      const item = findUnit(state, id);
      if (item) {
        Object.assign(item, fields);
        if (note) item.priceNote = note;
        else delete item.priceNote;
      } else {
        state.units.push({ id: (id = nextId(state.units, 'UNIT')), ...fields, ...(note ? { priceNote: note } : {}) });
      }
    } else if (draft.kind === 'exclusive') {
      const fields = {
        name, session: draft.exclusiveSession, use: draft.use, includes: draft.includes.trim(),
        start: draft.start, end: draft.end, price: draft.price, maxGuests: draft.maxGuests,
      };
      const item = findExclusive(state, id);
      if (item) Object.assign(item, fields);
      else state.exclusivePackages.push({ id: (id = nextId(state.exclusivePackages, 'EX')), ...fields });
    } else {
      const fields = {
        name, price: draft.price, maxGuests: draft.maxGuests, exclusive: draft.exclusive,
        hours: `${draft.start}-${draft.end}`, inclusions: listOf(draft.inclusions),
      };
      const item = findPackage(state, id);
      if (item) Object.assign(item, fields);
      else state.eventPackages.push({ id: (id = nextId(state.eventPackages, 'PKG')), ...fields });
    }

    setPromo(state, id, draft.promoId);
    logActivity(state, staffId, adding ? 'package.added' : 'package.updated', id, `${name} · ${peso(draft.price)}`);
    return { id };
  });
}

/**
 * Why a package cannot go yet — upcoming bookings, open booking links, events
 * still to come, or rooms that sell its entrance — or '' when it can.
 */
export function packageInUse(state: State, kind: PackageKind, id: string): string {
  const today = state.meta.asOf;
  if (kind === 'event') {
    const events = state.events.filter((event) => event.packageId === id && event.date >= today && event.stage !== 'done').length;
    return events ? `${plural(events, 'upcoming event')} ${events === 1 ? 'uses' : 'use'} it.` : '';
  }
  const bookings = state.bookings.filter((b) => b.product === id && isActive(b) && b.status !== 'checked_out' && b.date >= today).length;
  if (bookings) return `${plural(bookings, 'upcoming booking')} ${bookings === 1 ? 'is' : 'are'} for it.`;
  const links = state.bookingLinks.filter((link) => link.product === id && link.status === 'sent' && link.expiresAt >= today).length;
  if (links) return `${plural(links, 'booking link')} still ${links === 1 ? 'offers' : 'offer'} it.`;
  if (kind === 'entrance') {
    const units = live(state.units).filter((unit) => unit.session === id).map((unit) => unit.name);
    if (units.length) return `${units.join(', ')} ${units.length === 1 ? 'comes' : 'come'} with this entrance.`;
  }
  return '';
}

export function deletePackage(kind: PackageKind, id: string, staffId: string): PackageResult {
  return update((state): PackageResult => {
    if (!canManagePackages(state, staffId)) return { error: 'Your account cannot change packages.' };
    const item = kind === 'entrance' ? state.poolSessions.find((one) => one.id === id)
      : kind === 'unit' ? findUnit(state, id)
        : kind === 'exclusive' ? findExclusive(state, id)
          : findPackage(state, id);
    if (!item || item.retired) return { error: `That ${PACKAGE_WORD[kind]} is no longer there.` };
    const busy = packageInUse(state, kind, id);
    if (busy) return { error: `Cannot delete it yet: ${busy}` };

    item.retired = true;
    setPromo(state, id, '');
    logActivity(state, staffId, 'package.deleted', id, 'label' in item ? item.label : item.name);
    return { id };
  });
}

export interface PromoDraft {
  id: string;
  name: string;
  percent: number;
  validFrom: ISODate;
  validTo: ISODate;
  /** 0 Sunday … 6 Saturday. */
  weekdays: number[];
  minPax: number;
  active: boolean;
}

export type PromoResult = { promo: Promo } | { error: string };

export function promoDraft(state: State, id = ''): PromoDraft {
  const promo = state.promos.find((item) => item.id === id);
  if (promo) {
    return {
      id: promo.id, name: promo.name, percent: promo.percent, validFrom: promo.validFrom, validTo: promo.validTo,
      weekdays: [...promo.weekdays], minPax: promo.minPax, active: promo.active,
    };
  }
  const today = state.meta.asOf;
  return { id: '', name: '', percent: 10, validFrom: today, validTo: addDays(today, 30), weekdays: [0, 1, 2, 3, 4, 5, 6], minPax: 0, active: true };
}

export function promoProblem(draft: PromoDraft): string {
  if (!draft.name.trim()) return 'Give the promotion a name.';
  if (!(draft.percent >= 1 && draft.percent <= 100)) return 'Enter a percent from 1 to 100.';
  if (!draft.validFrom || !draft.validTo) return 'Enter the first and last day it runs.';
  if (draft.validTo < draft.validFrom) return 'The last day cannot be before the first.';
  if (!draft.weekdays.length) return 'Pick at least one day of the week.';
  if (draft.minPax < 0) return 'The fewest guests cannot be below zero.';
  return '';
}

export function savePromo(draft: PromoDraft, staffId: string): PromoResult {
  return update((state): PromoResult => {
    if (!canManagePackages(state, staffId)) return { error: 'Your account cannot change promotions.' };
    const problem = promoProblem(draft);
    if (problem) return { error: problem };
    const fields = {
      name: draft.name.trim(), percent: Math.round(draft.percent), validFrom: draft.validFrom, validTo: draft.validTo,
      weekdays: [...new Set(draft.weekdays)].sort((a, b) => a - b), minPax: Math.round(draft.minPax), active: draft.active,
    };
    let promo = state.promos.find((item) => item.id === draft.id);
    if (promo) Object.assign(promo, fields);
    else {
      promo = { id: nextId(state.promos, 'PR'), ...fields, appliesTo: [], source: 'Added on the Packages page' };
      state.promos.push(promo);
    }
    logActivity(state, staffId, draft.id ? 'promo.updated' : 'promo.added', promo.id, `${promo.name} · ${promo.percent}% off`);
    return { promo };
  });
}
