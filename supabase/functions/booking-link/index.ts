// The guest booking page's server. Guests have no login, so the page cannot
// read the database; it posts here instead:
//
//   { action: 'open', code }                                   → { stage, state }
//   { action: 'submit', code, input }                          → { booking, link } | { error, retry? }
//   { action: 'pay', code, bookingId, reference, senderName }  → { booking, payment } | { error }
//
// The booking code is the only key. 'open' returns the catalog plus bookings
// with every personal field blanked, which is all the page's availability
// checks and price summary read.

import { bookingLinkStage, payByQr, useBookingLink } from '../_shared/core/actions.js';
import { addDays } from '../_shared/core/format.js';
import { serve, withState } from '../_shared/server.ts';

const TABLES = [
  'staff', 'pool_sessions', 'exclusive_packages', 'units', 'promos', 'event_packages',
  'guests', 'bookings', 'payments', 'events', 'booking_links', 'activity_log',
];

/** Someone else's booking, reduced to what availability checks need. */
const anonymous = (booking: any) => ({
  ...booking,
  guestId: '',
  guestName: '',
  notes: null,
  guestList: [],
  extras: [],
  discount: null,
  pets: null,
  createdBy: '',
  cancelReason: null,
});

function publicState(state: any, stage: any) {
  const link = stage.stage === 'problem' ? null : stage.link;
  const own = stage.stage === 'pay' ? stage.booking.id : null;
  // Overnight stays that started a few days back can still overlap today.
  const from = addDays(state.meta.asOf, -3);
  return {
    ...state,
    staff: state.staff
      .filter((person: any) => person.id === link?.createdBy)
      .map((person: any) => ({ id: person.id, name: person.name, email: '', role: person.role, permissions: [], status: person.status, demo: false, password: null })),
    invites: [],
    guests: [],
    inquiries: [],
    savedReplies: [],
    activityLog: [],
    bookingLinks: link ? [link] : [],
    payments: state.payments.filter((payment: any) => payment.bookingId === own),
    events: state.events
      .filter((event: any) => event.date >= from)
      .map((event: any) => ({ ...event, title: '', notes: null, contactGuestId: '', coordinatorId: '', addOns: [] })),
    bookings: state.bookings
      .filter((booking: any) => booking.id === own || booking.date >= from)
      .map((booking: any) => (booking.id === own ? booking : anonymous(booking))),
  };
}

serve((body) => withState(TABLES, (state) => {
  const code = String(body.code ?? '');

  switch (body.action) {
    case 'open': {
      const stage = bookingLinkStage(state, code);
      return { stage, state: publicState(state, stage) };
    }

    case 'submit':
      // useBookingLink keeps only the fields a guest may set and re-checks them.
      return useBookingLink(code, body.input);

    case 'pay': {
      const stage = bookingLinkStage(state, code);
      if (stage.stage !== 'pay' || stage.booking.id !== body.bookingId) {
        return { error: 'This payment does not belong to this booking link.' };
      }
      return payByQr(stage.booking.id, String(body.reference ?? ''), null, String(body.senderName ?? '').slice(0, 120));
    }

    default:
      return { error: 'Unknown request.' };
  }
}));
