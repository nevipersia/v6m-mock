// What can be booked, grouped the way the resort sells it: entrance per
// session, cottages and rooms, and the exclusive rental packages.

import { formatTime, peso } from './format.js';
import { exclusiveSessionLabel, findExclusive, findSession, findUnit } from './rules.js';
import type { State } from './types.js';

export interface ProductOption {
  value: string;
  label: string;
}

export interface ProductGroup {
  label: string;
  options: ProductOption[];
}

const hours = (start: string, end: string) => `${formatTime(start)}–${formatTime(end)}`;

/** Grouped options for a booking picker. `style` guest adds times and prices for people outside the resort. */
export function productGroups(state: State, style: 'desk' | 'guest' = 'desk'): ProductGroup[] {
  const guest = style === 'guest';
  return [
    {
      label: 'Entrance',
      options: state.poolSessions.map((session) => ({
        value: session.id,
        label: guest
          ? `${session.label} · ${hours(session.start, session.end)} · ${peso(session.adult)} adult`
          : `${session.label} entrance (${hours(session.start, session.end)})`,
      })),
    },
    {
      label: 'Cottages and rooms',
      options: state.units.map((unit) => {
        const range = unit.capacityMin > 1 ? `${unit.capacityMin}–${unit.capacityMax}` : `up to ${unit.capacityMax}`;
        return {
          value: unit.id,
          label: guest ? `${unit.name} · ${range} guests · ${peso(unit.price)} + entrance` : `${unit.name} (${range})`,
        };
      }),
    },
    {
      label: 'Exclusive rental (no other guests)',
      options: (state.exclusivePackages ?? []).map((pkg) => ({
        value: pkg.id,
        label: `${exclusiveSessionLabel(pkg)} · ${pkg.name} · ${hours(pkg.start, pkg.end)} · ${peso(pkg.price)}`,
      })),
    },
  ].filter((group) => group.options.length);
}

export const allProductIds = (state: State): string[] =>
  productGroups(state).flatMap((group) => group.options.map((option) => option.value));

export interface ProductInfo {
  title: string;
  hours: string;
  details: string;
  photo: string | null;
  exclusive: boolean;
  /** Rates the owner still has to confirm. */
  provisional: boolean;
}

/** What a guest should know about the product they picked, for the booking page's info card. */
export function productInfo(state: State, product: string): ProductInfo | null {
  const pkg = findExclusive(state, product);
  if (pkg) {
    return {
      title: `${pkg.name} · ${exclusiveSessionLabel(pkg)}`,
      hours: hours(pkg.start, pkg.end),
      details: `${pkg.includes}. Up to ${pkg.maxGuests} guests, and no other groups while you are here.`,
      photo: pkg.photo ?? null,
      exclusive: true,
      provisional: false,
    };
  }
  const unit = findUnit(state, product);
  if (unit) {
    const session = findSession(state, unit.session);
    return {
      title: unit.name,
      hours: hours(unit.checkIn, unit.checkOut),
      details: `${unit.inclusions.join(' · ')}. Plus ${session?.label.toLowerCase() ?? ''} entrance per guest.`,
      photo: unit.photo ?? null,
      exclusive: false,
      provisional: Boolean(session?.ratesToConfirm),
    };
  }
  const session = findSession(state, product);
  if (!session) return null;
  return {
    title: session.label,
    hours: hours(session.start, session.end),
    details: `${peso(session.adult)} per adult, ${peso(session.kid)} per kid. Pools, cottages area and grilling area.`,
    photo: session.photo ?? null,
    exclusive: false,
    provisional: Boolean(session.ratesToConfirm),
  };
}
