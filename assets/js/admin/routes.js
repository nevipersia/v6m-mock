import * as bookings from './views/bookings.js';
import * as calendar from './views/calendar.js';
import * as events from './views/events.js';
import * as housekeeping from './views/housekeeping.js';
import * as inbox from './views/inbox.js';
import * as today from './views/today.js';

/**
 * Each view module exports render(ctx) and optionally:
 *   actions: { [data-action]: ({ el, event, ctx }) => void }
 *   inputs:  { [data-input]:  ({ el, event, ctx }) => void }
 */
export const ROUTES = [
  { id: 'today', label: 'Today', icon: 'sun', view: today },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', view: calendar },
  { id: 'bookings', label: 'Bookings', icon: 'list', view: bookings },
  { id: 'inbox', label: 'Inbox', icon: 'inbox', view: inbox },
  { id: 'events', label: 'Events', icon: 'sparkles', view: events },
  { id: 'housekeeping', label: 'Housekeeping', icon: 'broom', view: housekeeping },
];

export const findRoute = (id) => ROUTES.find((route) => route.id === id);
