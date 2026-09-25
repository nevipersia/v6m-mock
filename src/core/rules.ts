// Business rules: lookups, availability and pricing. Pure functions of state.

import { addDays, formatDate, parseDate } from './format.js';
import type {
  Booking, BookingSource, DiscountKind, ExclusivePackage, ExtraCharge, ManualDiscount, Staff, Timestamp, BookingStatus, EventStage, ISODate, PaymentMethod, PoolSession, PriceLine,
  Pricing, Promo, ResortEvent, State, Unit,
} from './types.js';

export const STATUS_LABELS: Record<BookingStatus, string> = {
  hold: 'On hold',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  cancelled: 'Cancelled',
  no_show: 'No show',
};

export const SOURCE_LABELS: Record<BookingSource, string> = {
  messenger: 'Messenger',
  instagram: 'Instagram',
  phone: 'Phone',
  website: 'Website',
  walk_in: 'Walk-in',
  booking_link: 'Booking link',
};

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  bank_transfer: 'Bank transfer',
};

export const STAGE_LABELS: Record<EventStage, string> = {
  inquiry: 'Inquiry',
  ocular: 'Ocular visit',
  reserved: 'Reserved',
  paid: 'Paid',
  done: 'Done',
};

const INACTIVE_STATUSES: BookingStatus[] = ['cancelled', 'no_show'];

export const isActive = (booking: Booking): boolean => !INACTIVE_STATUSES.includes(booking.status);

// ---------- Lookups ----------

export const findUnit = (state: State, id: string | null | undefined) => state.units.find((unit) => unit.id === id);
export const findSession = (state: State, id: string | null | undefined) => state.poolSessions.find((session) => session.id === id);
export const findBooking = (state: State, id: string | null | undefined) => state.bookings.find((booking) => booking.id === id);
export const findGuest = (state: State, id: string | null | undefined) => state.guests.find((guest) => guest.id === id);
export const findStaff = (state: State, id: string | null | undefined) => state.staff.find((person) => person.id === id);
export const findPackage = (state: State, id: string | null | undefined) => state.eventPackages.find((pkg) => pkg.id === id);
export const findExclusive = (state: State, id: string | null | undefined): ExclusivePackage | undefined =>
  (state.exclusivePackages ?? []).find((pkg) => pkg.id === id);

/** The pool session a regular product runs in: its own id for entrance, or the unit's session. */
export function sessionFor(state: State, product: string): PoolSession {
  const unit = findUnit(state, product);
  const session = findSession(state, unit ? unit.session : product);
  if (!session) throw new Error(`No pool session for product "${product}"`);
  return session;
}

export const exclusiveSessionLabel = (pkg: ExclusivePackage): string => (pkg.session === 'day' ? 'Day tour' : 'Overnight');

export function productLabel(state: State, product: string): string {
  if (product === 'event') return 'Private event';
  const pkg = findExclusive(state, product);
  if (pkg) return `Exclusive ${exclusiveSessionLabel(pkg).toLowerCase()} · ${pkg.name}`;
  return findUnit(state, product)?.name ?? findSession(state, product)?.label ?? product;
}

/** Category used for colors: a session id, room, cottage, exclusive or event. */
export function productKind(state: State, product: string): string {
  if (product === 'event') return 'event';
  if (findExclusive(state, product)) return 'exclusive';
  return findUnit(state, product)?.kind ?? product;
}

/** Start and end of a product's time window on a date. */
export function bookingWindow(state: State, product: string, date: ISODate): { startsAt: Timestamp; endsAt: Timestamp } {
  const pkg = findExclusive(state, product);
  const unit = findUnit(state, product);
  const session = pkg ? null : sessionFor(state, product);
  const start = pkg ? pkg.start : unit ? unit.checkIn : session!.start;
  const end = pkg ? pkg.end : unit ? unit.checkOut : session!.end;
  const endDate = end <= start ? addDays(date, 1) : date;
  return { startsAt: `${date}T${start}:00+08:00`, endsAt: `${endDate}T${end}:00+08:00` };
}

const overlapsWindow = (booking: Booking, window: { startsAt: Timestamp; endsAt: Timestamp }): boolean =>
  booking.startsAt < window.endsAt && window.startsAt < booking.endsAt;

/** Active bookings whose time overlaps the window. */
export const bookingsOverlapping = (state: State, window: { startsAt: Timestamp; endsAt: Timestamp }, excludeId?: string): Booking[] =>
  state.bookings.filter((b) => b.id !== excludeId && isActive(b) && b.product !== 'event' && overlapsWindow(b, window));

/** The exclusive rental holding the resort during this window, if any. */
export const exclusiveOverlapping = (state: State, window: { startsAt: Timestamp; endsAt: Timestamp }, excludeId?: string): Booking | undefined =>
  bookingsOverlapping(state, window, excludeId).find((b) => b.productType === 'exclusive');

/** The exclusive rental that touches this date, if any. */
export const exclusiveOn = (state: State, date: ISODate): Booking | undefined =>
  state.bookings.find((b) => isActive(b) && b.productType === 'exclusive' && b.date === date);

export const nightsOf = (booking: Booking): ISODate[] =>
  Array.from({ length: booking.nights }, (_, i) => addDays(booking.date, i));

// ---------- Availability ----------

/** An exclusive event that closes the resort on this date, if any. */
export const closingEvent = (state: State, date: ISODate): ResortEvent | undefined =>
  state.events.find((event) => event.blocksCalendar && event.date === date);

export const unitBookingOn = (state: State, unitId: string, date: ISODate, excludeId?: string): Booking | undefined =>
  state.bookings.find((b) => b.id !== excludeId && isActive(b) && b.product === unitId && nightsOf(b).includes(date));

/** Guests counted against a pool session's capacity. Exclusive rentals are not a shared session. */
export const poolGuests = (state: State, date: ISODate, sessionId: string, excludeId?: string): number =>
  state.bookings
    .filter((b) => b.id !== excludeId && isActive(b) && b.date === date && b.session === sessionId && b.productType !== 'exclusive')
    .reduce((sum, b) => sum + b.adults + b.kids, 0);

export interface BookingRequest {
  product: string;
  date: ISODate;
  adults?: number;
  kids?: number;
  nights?: number;
  excludeId?: string;
}

export interface Availability {
  ok: boolean;
  reason?: string;
  slotsLeft?: number;
}

export function checkAvailability(state: State, { product, date, adults = 0, kids = 0, excludeId }: BookingRequest): Availability {
  if (closingEvent(state, date)) {
    return { ok: false, reason: `V6M is closed on ${formatDate(date)} for a private event.` };
  }

  const window = bookingWindow(state, product, date);
  const pkg = findExclusive(state, product);
  if (pkg) {
    const clash = bookingsOverlapping(state, window, excludeId)[0];
    if (clash) {
      return { ok: false, reason: `Another group is booked then (${clash.guestName}, ${productLabel(state, clash.product)}). An exclusive rental needs the whole time free.` };
    }
    if (adults + kids > pkg.maxGuests) return { ok: false, reason: `Exclusive rentals take up to ${pkg.maxGuests} guests.` };
    return { ok: true };
  }

  const exclusive = exclusiveOverlapping(state, window, excludeId);
  if (exclusive) {
    return { ok: false, reason: `V6M is booked for an exclusive rental then (${exclusive.guestName}). No other guests that time.` };
  }

  const unit = findUnit(state, product);
  if (unit && unitBookingOn(state, product, date, excludeId)) {
    return { ok: false, reason: `${unit.name} is already booked for ${formatDate(date)}.` };
  }

  const session = sessionFor(state, product);
  const slotsLeft = session.capacity - poolGuests(state, date, session.id, excludeId);
  if (adults + kids > slotsLeft) {
    return {
      ok: false,
      slotsLeft: Math.max(0, slotsLeft),
      reason: `Only ${Math.max(0, slotsLeft)} ${session.label.toLowerCase()} slots are left on ${formatDate(date)}.`,
    };
  }
  return { ok: true, slotsLeft };
}

// ---------- Pricing ----------

export function findPromo(state: State, { product, date, guests }: { product: string; date: ISODate; guests: number }): Promo | null {
  const weekday = parseDate(date).getDay();
  return state.promos.find((promo) =>
    promo.active
    && date >= promo.validFrom
    && date <= promo.validTo
    && promo.weekdays.includes(weekday)
    && promo.appliesTo.includes(product)
    && guests >= promo.minPax,
  ) ?? null;
}

export interface Quote extends Pricing {
  promo: Promo | null;
  warnings: string[];
}

const extraLines = (extras: ExtraCharge[] = []): PriceLine[] =>
  extras.filter((extra) => extra.amount > 0 && extra.label.trim())
    .map((extra) => ({ label: extra.label.trim(), qty: 1, unitPrice: extra.amount, amount: extra.amount }));

/** Price breakdown in the same shape as booking.pricing, plus the promo and warnings. */
export function quote(state: State, request: BookingRequest & { extras?: ExtraCharge[] }): Quote {
  const { product, date, adults = 0, kids = 0, nights = 1 } = request;
  const pkg = findExclusive(state, product);
  if (pkg) {
    const lines = [{ label: `Exclusive · ${pkg.name} (${exclusiveSessionLabel(pkg)})`, qty: 1, unitPrice: pkg.price, amount: pkg.price }, ...extraLines(request.extras)];
    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const warnings = adults + kids > pkg.maxGuests ? [`Exclusive rentals take up to ${pkg.maxGuests} guests.`] : [];
    return { lines, subtotal, promoId: null, promo: null, discount: 0, total: subtotal, warnings };
  }
  const unit: Unit | undefined = findUnit(state, product);
  const session = sessionFor(state, product);
  const guests = adults + kids;
  const lines: PriceLine[] = [];

  if (!unit || unit.addsEntrance) {
    if (adults) lines.push({ label: `Adult entrance (${session.label})`, qty: adults, unitPrice: session.adult, amount: adults * session.adult });
    if (kids) lines.push({ label: `Kid entrance (${session.label})`, qty: kids, unitPrice: session.kid, amount: kids * session.kid });
  }
  if (unit) lines.push({ label: unit.name, qty: nights, unitPrice: unit.price, amount: unit.price * nights });
  lines.push(...extraLines(request.extras));

  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const promo = findPromo(state, { product, date, guests });
  const discount = promo ? Math.round((subtotal * promo.percent) / 100) : 0;

  const warnings: string[] = [];
  if (unit && guests > unit.capacityMax) warnings.push(`${unit.name} fits up to ${unit.capacityMax} guests.`);
  if (unit && unit.capacityMin > 1 && guests > 0 && guests < unit.capacityMin) {
    warnings.push(`${unit.name} is sized for ${unit.capacityMin}–${unit.capacityMax} guests.`);
  }

  return { lines, subtotal, promoId: promo?.id ?? null, promo, discount, total: subtotal - discount, warnings };
}

// ---------- Manual discounts ----------

/** Owners may discount without a reason; everyone else with the permission must write one. */
export const discountNeedsNote = (staff: Staff): boolean => staff.role !== 'owner';

export const canDiscount = (staff: Staff): boolean => staff.permissions.includes('discounts.apply');

/** Pesos a discount takes off `base`, never more than `base`. */
export function discountAmount(base: number, kind: DiscountKind, value: number): number {
  if (!(value > 0)) return 0;
  const amount = kind === 'percent' ? Math.round((base * Math.min(value, 100)) / 100) : Math.round(value);
  return Math.min(amount, base);
}

export interface DiscountInput {
  kind: DiscountKind;
  value: number;
  note?: string | null;
}

const formatPeso = (amount: number): string => `₱${Math.round(amount).toLocaleString('en-PH')}`;

/**
 * Why this staff member cannot give this discount, or null when it is fine.
 * `base` is the price being discounted; `floor` is the least the total may
 * drop to (what the guest already paid, since the desk does not refund here).
 */
export function discountProblem(staff: Staff, input: DiscountInput, base: number, floor = 0): string | null {
  if (!canDiscount(staff)) return 'Your account cannot give discounts. Ask the owner.';
  if (!(input.value > 0)) return input.kind === 'percent' ? 'Enter a percentage above 0.' : 'Enter a discount above ₱0.';
  if (input.kind === 'percent' && input.value > 100) return 'A percentage discount goes up to 100%.';
  if (input.kind === 'amount' && input.value > base) return `The discount can't be more than the ${formatPeso(base)} price.`;
  if (base - discountAmount(base, input.kind, input.value) < floor) {
    return `The guest already paid ${formatPeso(floor)}, so the total can't go below that.`;
  }
  if (discountNeedsNote(staff) && !input.note?.trim()) return 'Add a note saying why you are giving this discount.';
  return null;
}

export const discountLabel = (discount: ManualDiscount): string =>
  discount.kind === 'percent' ? `Discount (${discount.value}%)` : 'Discount';

/** Bookings the desk can edit: not yet arrived, and not an event. */
export function isEditable(_state: State, booking: Booking): boolean {
  if (!['hold', 'confirmed'].includes(booking.status)) return false;
  return booking.productType !== 'event' && !booking.eventId;
}

// ---------- Downpayment ----------

/** Every booking needs this share of its total paid before it counts as confirmed. */
export const DOWNPAYMENT_RATE = 0.5;
export const DOWNPAYMENT_PERCENT = Math.round(DOWNPAYMENT_RATE * 100);

/** The required downpayment: 50% of the total rounded up to the peso. */
export function depositRequired(_state: State, _product: string, total: number): number {
  return Math.ceil(total * DOWNPAYMENT_RATE);
}

/** What is still needed to reach the downpayment; 0 once it is met. */
export const downpaymentDue = (booking: Booking): number => Math.max(0, booking.depositRequired - booking.paid);

