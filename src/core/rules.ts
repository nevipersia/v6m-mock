// Business rules: lookups, availability and pricing. Pure functions of state.

import { addDays, formatDate, parseDate } from './format.js';
import type {
  Booking, BookingSource, DiscountKind, ExclusivePackage, ExtraCharge, ManualDiscount, Staff, Timestamp, BookingStatus, EventStage, ISODate, PaymentMethod, PoolSession, PriceLine,
  Permission, Pricing, Promo, ResortEvent, Role, State, Unit,
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
  reserved: 'Reserved',
  paid: 'Paid',
  done: 'Done',
};

const INACTIVE_STATUSES: BookingStatus[] = ['cancelled', 'no_show'];

export const isActive = (booking: Booking): boolean => !INACTIVE_STATUSES.includes(booking.status);

// ---------- Lookups ----------

/** Not deleted: what new bookings, pickers and the calendar may offer. */
export const live = <T extends { retired?: boolean }>(items: T[] = []): T[] => items.filter((item) => !item.retired);

export const findUnit = (state: State, id: string | null | undefined) => state.units.find((unit) => unit.id === id);
export const findSession = (state: State, id: string | null | undefined) => state.poolSessions.find((session) => session.id === id);
export const findBooking = (state: State, id: string | null | undefined) => state.bookings.find((booking) => booking.id === id);

/** Events still on: an event whose booking was cancelled drops off the Events page. */
export const liveEvents = (state: State): ResortEvent[] =>
  state.events.filter((event) => findBooking(state, event.bookingId)?.status !== 'cancelled');

/** An event that has happened: marked done, checked out, or booked for a day already past. */
export function eventFinished(state: State, event: ResortEvent): boolean {
  if (event.stage === 'done') return true;
  const booking = findBooking(state, event.bookingId);
  return !!booking && (booking.status === 'checked_out' || event.date < state.meta.asOf);
}

/** What the Events page tracks: live events still to happen. Finished ones live on in Bookings. */
export const pipelineEvents = (state: State): ResortEvent[] =>
  liveEvents(state).filter((event) => !eventFinished(state, event));
export const findGuest = (state: State, id: string | null | undefined) => state.guests.find((guest) => guest.id === id);
export const findStaff = (state: State, id: string | null | undefined) => state.staff.find((person) => person.id === id);
export const findPackage = (state: State, id: string | null | undefined) => state.eventPackages.find((pkg) => pkg.id === id);
/** Rooms take any number of guests; cottages keep their fewest and most. */
export const hasGuestLimit = (unit: Unit): boolean => unit.kind !== 'room';

/** A unit's guest range for labels ("10–15", "up to 6"), or null for a room, which has none. */
export function guestRange(unit: Unit): string | null {
  if (!hasGuestLimit(unit)) return null;
  return unit.capacityMin > 1 ? `${unit.capacityMin}–${unit.capacityMax}` : `up to ${unit.capacityMax}`;
}

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
  /** The desk may go past a headcount limit; it only gets a note saying so. */
  overLimits?: boolean;
}

export interface Availability {
  ok: boolean;
  reason?: string;
  slotsLeft?: number;
  /** Set when the booking goes past a headcount limit the desk allowed. */
  over?: string;
}

export function checkAvailability(state: State, { product, date, adults = 0, kids = 0, excludeId, overLimits = false }: BookingRequest): Availability {
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
    if (adults + kids > pkg.maxGuests) {
      const reason = `Exclusive rentals take up to ${pkg.maxGuests} guests.`;
      return overLimits ? { ok: true, over: reason } : { ok: false, reason };
    }
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
  if (adults + kids > slotsLeft && overLimits) {
    return { ok: true, slotsLeft, over: `Over the ${session.label.toLowerCase()} limit: ${Math.max(0, slotsLeft)} slots were left on ${formatDate(date)}.` };
  }
  if (adults + kids > slotsLeft) {
    return {
      ok: false,
      slotsLeft: Math.max(0, slotsLeft),
      reason: `Only ${Math.max(0, slotsLeft)} ${session.label.toLowerCase()} slots are left on ${formatDate(date)}.`,
    };
  }
  return { ok: true, slotsLeft };
}

/** How one day looks for one product in a date picker: "Open", "Booked", "Closed". */
export interface DayAvailability {
  label: string;
  tone: 'open' | 'full';
  /** Can't be picked. The desk may still pick a full entrance session, since it can go over the limit. */
  disabled: boolean;
}

export function dayAvailability(state: State, product: string, date: ISODate, { excludeId, strict = false }: { excludeId?: string; strict?: boolean } = {}): DayAvailability {
  const shut = (label: string): DayAvailability => ({ label, tone: 'full', disabled: true });
  if (closingEvent(state, date)) return shut('Closed');

  const window = bookingWindow(state, product, date);
  if (findExclusive(state, product)) {
    return bookingsOverlapping(state, window, excludeId).length ? shut('Taken') : { label: 'Free', tone: 'open', disabled: false };
  }
  if (exclusiveOverlapping(state, window, excludeId)) return shut('Exclusive');

  const unit = findUnit(state, product);
  if (unit && unitBookingOn(state, product, date, excludeId)) return shut('Booked');

  const session = sessionFor(state, product);
  const slotsLeft = session.capacity - poolGuests(state, date, session.id, excludeId);
  if (slotsLeft <= 0) return { label: 'Full', tone: 'full', disabled: strict };
  return { label: unit ? 'Free' : 'Open', tone: 'open', disabled: false };
}

/** dayAvailability for one product, ready for a date picker; null for a product the catalog doesn't have. */
export function availabilityFor(state: State, product: string, options: { excludeId?: string; strict?: boolean } = {}): ((date: ISODate) => DayAvailability) | null {
  const known = findExclusive(state, product) || findUnit(state, product) || findSession(state, product);
  return known ? (date) => dayAvailability(state, product, date, options) : null;
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

export type PromoStatus = 'running' | 'scheduled' | 'ended' | 'paused';

/** Whether a promotion is taking effect around `today`, for the Packages page. */
export function promoStatus(promo: Promo, today: ISODate): PromoStatus {
  if (!promo.active) return 'paused';
  if (today < promo.validFrom) return 'scheduled';
  if (today > promo.validTo) return 'ended';
  return 'running';
}

/** The one promotion a package is on, if any. */
export const promoFor = (state: State, packageId: string): Promo | null =>
  state.promos.find((promo) => promo.appliesTo.includes(packageId)) ?? null;

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
  if (unit && hasGuestLimit(unit) && guests > unit.capacityMax) warnings.push(`${unit.name} fits up to ${unit.capacityMax} guests.`);
  if (unit && hasGuestLimit(unit) && unit.capacityMin > 1 && guests > 0 && guests < unit.capacityMin) {
    warnings.push(`${unit.name} is sized for ${unit.capacityMin}–${unit.capacityMax} guests.`);
  }

  return { lines, subtotal, promoId: promo?.id ?? null, promo, discount, total: subtotal - discount, warnings };
}

// ---------- Manual discounts ----------

/** Every permission there is, in the order the desk lists them. */
export const ALL_PERMISSIONS: Permission[] = [
  'bookings.write', 'payments.write', 'bookings.cancel', 'inbox.write', 'events.manage',
  'discounts.apply', 'expenses.manage', 'packages.manage', 'users.manage',
];

/**
 * What a role may do. The two roles are the same desk, except that only
 * owners manage user accounts.
 */
export const permissionsFor = (role: Role): Permission[] =>
  role === 'owner' ? [...ALL_PERMISSIONS] : ALL_PERMISSIONS.filter((permission) => permission !== 'users.manage');

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

