// Business rules: lookups, availability and pricing. Pure functions of state.

import { addDays, formatDate, parseDate } from './format.js';

export const STATUS_LABELS = {
  hold: 'On hold',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  cancelled: 'Cancelled',
  no_show: 'No show',
};

export const SOURCE_LABELS = {
  messenger: 'Messenger',
  instagram: 'Instagram',
  phone: 'Phone',
  website: 'Website',
  walk_in: 'Walk-in',
  airbnb: 'Airbnb',
};

export const METHOD_LABELS = {
  cash: 'Cash',
  gcash: 'GCash',
  bank_transfer: 'Bank transfer',
  airbnb: 'Airbnb',
};

export const STAGE_LABELS = {
  inquiry: 'Inquiry',
  ocular: 'Ocular visit',
  reserved: 'Reserved',
  paid: 'Paid',
  done: 'Done',
};

const INACTIVE_STATUSES = ['cancelled', 'no_show'];

export const isActive = (booking) => !INACTIVE_STATUSES.includes(booking.status);

// ---------- Lookups ----------

export const findUnit = (state, id) => state.units.find((unit) => unit.id === id);
export const findSession = (state, id) => state.poolSessions.find((session) => session.id === id);
export const findBooking = (state, id) => state.bookings.find((booking) => booking.id === id);
export const findGuest = (state, id) => state.guests.find((guest) => guest.id === id);
export const findStaff = (state, id) => state.staff.find((person) => person.id === id);
export const findPackage = (state, id) => state.eventPackages.find((pkg) => pkg.id === id);

export function productLabel(state, product) {
  if (product === 'event') return 'Private event';
  return findUnit(state, product)?.name ?? findSession(state, product)?.label ?? product;
}

/** Category used for colors: daytour, overnight, room, cottage, villa or event. */
export function productKind(state, product) {
  if (product === 'event') return 'event';
  return findUnit(state, product)?.kind ?? product;
}

export function periodDays(state) {
  const days = [];
  for (let day = state.meta.period.from; day <= state.meta.period.to; day = addDays(day, 1)) days.push(day);
  return days;
}

export const nightsOf = (booking) =>
  Array.from({ length: booking.nights }, (_, i) => addDays(booking.date, i));

// ---------- Availability ----------

/** An exclusive event that closes the resort on this date, if any. */
export const closingEvent = (state, date) =>
  state.events.find((event) => event.blocksCalendar && event.date === date);

export const unitBookingOn = (state, unitId, date, excludeId) =>
  state.bookings.find((b) => b.id !== excludeId && isActive(b) && b.product === unitId && nightsOf(b).includes(date));

/** Guests counted against a pool session's capacity. The private villa has its own pool. */
export const poolGuests = (state, date, sessionId, excludeId) =>
  state.bookings
    .filter((b) => b.id !== excludeId && isActive(b) && b.date === date && b.session === sessionId && b.productType !== 'villa')
    .reduce((sum, b) => sum + b.adults + b.kids, 0);

export function poolSlotsLeft(state, date, sessionId) {
  const session = findSession(state, sessionId);
  return Math.max(0, session.capacity - poolGuests(state, date, sessionId));
}

/** @returns {{ ok: boolean, reason?: string, slotsLeft?: number, viaAirbnb?: boolean }} */
export function checkAvailability(state, { product, date, adults = 0, kids = 0, excludeId }) {
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

  const session = findSession(state, unit ? unit.session : product);
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

export function findPromo(state, { product, date, guests }) {
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

/** Price breakdown in the same shape as booking.pricing, plus the promo and warnings. */
export function quote(state, { product, date, adults = 0, kids = 0, nights = 1 }) {
  const unit = findUnit(state, product);
  const session = findSession(state, unit ? unit.session : product);
  const guests = adults + kids;
  const lines = [];

  if (!unit || unit.addsEntrance) {
    if (adults) lines.push({ label: `Adult entrance (${session.label})`, qty: adults, unitPrice: session.adult, amount: adults * session.adult });
    if (kids) lines.push({ label: `Kid entrance (${session.label})`, qty: kids, unitPrice: session.kid, amount: kids * session.kid });
  }
  if (unit) lines.push({ label: unit.name, qty: nights, unitPrice: unit.price, amount: unit.price * nights });

  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const promo = findPromo(state, { product, date, guests });
  const discount = promo ? Math.round((subtotal * promo.percent) / 100) : 0;

  const warnings = [];
  if (unit && guests > unit.capacityMax) warnings.push(`${unit.name} fits up to ${unit.capacityMax} guests.`);
  if (unit && unit.capacityMin > 1 && guests > 0 && guests < unit.capacityMin) {
    warnings.push(`${unit.name} is sized for ${unit.capacityMin}–${unit.capacityMax} guests.`);
  }

  return { lines, subtotal, promoId: promo?.id ?? null, promo, discount, total: subtotal - discount, warnings };
}

export function depositRequired(state, product, total) {
  const roundTo100 = (amount) => Math.round(amount / 100) * 100;
  if (findUnit(state, product)?.channel === 'airbnb') return total;
  if (product === 'daytour') return roundTo100(total * 0.3);
  return roundTo100(total * 0.5);
}
