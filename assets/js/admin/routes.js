import * as bookings from './views/bookings.js';
import * as calendar from './views/calendar.js';
import * as dashboard from './views/dashboard.js';
import * as events from './views/events.js';
import * as inbox from './views/inbox.js';
import * as users from './views/users.js';

/**
 * Each view module exports render(ctx) and optionally:
 *   actions: { [data-action]: ({ el, event, ctx }) => void }
 *   inputs:  { [data-input]:  ({ el, event, ctx }) => void }
 */
export const ROUTES = [
  { id: 'dashboard', label: 'Dashboard', icon: 'sun', view: dashboard },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', view: calendar },
  { id: 'bookings', label: 'Bookings', icon: 'list', view: bookings },
  { id: 'inbox', label: 'Inbox', icon: 'inbox', view: inbox },
  { id: 'events', label: 'Events', icon: 'sparkles', view: events },
  { id: 'users', label: 'Users', icon: 'users', view: users },
];

export const findRoute = (id) => ROUTES.find((route) => route.id === id);
