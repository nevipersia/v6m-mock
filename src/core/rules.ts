// Business rules: lookups, availability and pricing. Pure functions of state.

import { addDays, formatDate, parseDate } from './format.js';
import type {
  Booking, BookingSource, BookingStatus, EventStage, ISODate, PaymentMethod, PoolSession, PriceLine,
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
  airbnb: 'Airbnb',
  booking_link: 'Booking link',
};

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  bank_transfer: 'Bank transfer',
  airbnb: 'Airbnb',
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

/** The pool session a product runs in: its own id for entrance, or the unit's session. */
export function sessionFor(state: State, product: string): PoolSession {
  const unit = findUnit(state, product);
  const session = findSession(state, unit ? unit.session : product);
  if (!session) throw new Error(`No pool session for product "${product}"`);
  return session;
}

export function productLabel(state: State, product: string): string {
  if (product === 'event') return 'Private event';
  return findUnit(state, product)?.name ?? findSession(state, product)?.label ?? product;
}

/** Category used for colors: daytour, overnight, room, cottage, villa or event. */
export function productKind(state: State, product: string): string {
  if (product === 'event') return 'event';
  return findUnit(state, product)?.kind ?? product;
}

export function periodDays(state: State): ISODate[] {
  const days: ISODate[] = [];
  for (let day = state.meta.period.from; day <= state.meta.period.to; day = addDays(day, 1)) days.push(day);
  return days;
}

export const nightsOf = (booking: Booking): ISODate[] =>
  Array.from({ length: booking.nights }, (_, i) => addDays(booking.date, i));

// ---------- Availability ----------

/** An exclusive event that closes the resort on this date, if any. */
export const closingEvent = (state: State, date: ISODate): ResortEvent | undefined =>
  state.events.find((event) => event.blocksCalendar && event.date === date);

export const unitBookingOn = (state: State, unitId: string, date: ISODate, excludeId?: string): Booking | undefined =>
  state.bookings.find((b) => b.id !== excludeId && isActive(b) && b.product === unitId && nightsOf(b).includes(date));

/** Guests counted against a pool session's capacity. The private villa has its own pool. */
export const poolGuests = (state: State, date: ISODate, sessionId: string, excludeId?: string): number =>
  state.bookings
    .filter((b) => b.id !== excludeId && isActive(b) && b.date === date && b.session === sessionId && b.productType !== 'villa')
    .reduce((sum, b) => sum + b.adults + b.kids, 0);

export function poolSlotsLeft(state: State, date: ISODate, sessionId: string): number {
  const session = findSession(state, sessionId);
  return session ? Math.max(0, session.capacity - poolGuests(state, date, sessionId)) : 0;
}

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
  viaAirbnb?: boolean;
}

export function checkAvailability(state: State, { product, date, adults = 0, kids = 0, excludeId }: BookingRequest): Availability {
  if (closingEvent(state, date)) {
    return { ok: false, reason: `V6M is closed on ${formatDate(date)} for a private event.` };
  }

  const unit = findUnit(state, product);
  if (unit) {
    if (unitBookingOn(state, product, date, excludeId)) {
      const where = unit.channel === 'airbnb' ? 'on Airbnb ' : '';
      return { ok: false, reason: `${unit.name} is already booked ${where}for ${formatDate(date)}.` };
    }
    if (unit.channel === 'airbnb') return { ok: true, viaAirbnb: true };
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

/** Price breakdown in the same shape as booking.pricing, plus the promo and warnings. */
export function quote(state: State, { product, date, adults = 0, kids = 0, nights = 1 }: BookingRequest): Quote {
  const unit: Unit | undefined = findUnit(state, product);
  const session = sessionFor(state, product);
  const guests = adults + kids;
  const lines: PriceLine[] = [];

  if (!unit || unit.addsEntrance) {
    if (adults) lines.push({ label: `Adult entrance (${session.label})`, qty: adults, unitPrice: session.adult, amount: adults * session.adult });
    if (kids) lines.push({ label: `Kid entrance (${session.label})`, qty: kids, unitPrice: session.kid, amount: kids * session.kid });
  }
  if (unit) lines.push({ label: unit.name, qty: nights, unitPrice: unit.price, amount: unit.price * nights });

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

// ---------- Downpayment ----------

/** Every booking needs this share of its total paid before it counts as confirmed. */
export const DOWNPAYMENT_RATE = 0.5;
export const DOWNPAYMENT_PERCENT = Math.round(DOWNPAYMENT_RATE * 100);

/** The required downpayment: 50% of the total rounded up to the peso, or the full total for Airbnb. */
export function depositRequired(state: State, product: string, total: number): number {
  if (findUnit(state, product)?.channel === 'airbnb') return total;
  return Math.ceil(total * DOWNPAYMENT_RATE);
}

/** What is still needed to reach the downpayment; 0 once it is met. */
export const downpaymentDue = (booking: Booking): number => Math.max(0, booking.depositRequired - booking.paid);

export const hasDownpayment = (booking: Booking): boolean => downpaymentDue(booking) === 0;
