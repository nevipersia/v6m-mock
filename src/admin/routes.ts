import * as bookings from './views/bookings.js';
import * as dashboard from './views/dashboard.js';
import * as events from './views/events.js';
import * as finances from './views/finances.js';
import * as inbox from './views/inbox.js';
import * as users from './views/users.js';
import type { Route } from './types.js';

/**
 * Each view module exports render(ctx) and optionally:
 *   actions: { [data-action]: ({ el, event, ctx }) => void }
 *   inputs:  { [data-input]:  ({ el, event, ctx }) => void }
 */
export const ROUTES: Route[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'sun', view: dashboard },
  { id: 'bookings', label: 'Bookings', icon: 'calendar', view: bookings },
  { id: 'finances', label: 'Finances', icon: 'receipt', view: finances },
  { id: 'inbox', label: 'Inbox', icon: 'inbox', view: inbox },
  { id: 'events', label: 'Events', icon: 'sparkles', view: events },
  { id: 'users', label: 'Users', icon: 'users', view: users },
];

export const findRoute = (id: string): Route | undefined => ROUTES.find((route) => route.id === id);
