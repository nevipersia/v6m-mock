// Types shared by the V6M Desk shell, its views and its drawers.

import type { SafeHTML, TemplateValue } from '../core/dom.js';
import type { Permission, Staff, State } from '../core/types.js';
import type { IconName } from './components/icons.js';

export type PageId = 'dashboard' | 'calendar' | 'bookings' | 'inbox' | 'events' | 'users';

export interface BookingPrefill {
  product?: string | undefined;
  date?: string | undefined;
  guestName?: string;
  mobile?: string;
  source?: string;
  inquiryId?: string;
}

/** What every signed-in view and drawer receives. */
export interface DeskContext {
  state: State;
  staff: Staff;
  can: (permission: Permission) => boolean;
  canView: (pageId: string) => boolean;
  toast: (message: string) => void;
  redraw: () => void;
  openBooking: (bookingId: string) => void;
  newBooking: (prefill?: BookingPrefill) => void;
  newBookingLink: (prefill?: BookingPrefill) => void;
  editBooking: (bookingId: string) => void;
  newEvent: () => void;
  closeDrawer: () => void;
}

/**
 * Payload for data-action / data-submit / data-input handlers. `el` is the
 * element carrying the attribute (the form, for data-submit).
 */
export interface HandlerPayload<Ctx = DeskContext> {
  el: HTMLElement;
  event: Event;
  ctx: Ctx;
}

export type Handler<Ctx = DeskContext> = (payload: HandlerPayload<Ctx>) => void | Promise<void>;
export type HandlerMap<Ctx = DeskContext> = Record<string, Handler<Ctx>>;

export interface ViewModule {
  render: (ctx: DeskContext) => SafeHTML;
  actions?: HandlerMap;
  inputs?: HandlerMap;
  /** Pointer and focus moving over an element, for read-outs that don't change state. */
  hovers?: HandlerMap;
}

export interface Route {
  id: PageId;
  label: string;
  icon: IconName;
  view: ViewModule;
}

/** Drawer handlers also get the drawer body and a way to redraw just the drawer. */
export interface DrawerPayload extends HandlerPayload {
  root: HTMLElement;
  redraw: () => void;
}

export type DrawerHandler = (payload: DrawerPayload) => void | Promise<void>;

export interface DrawerContent {
  title: string | ((ctx: DeskContext) => string);
  render: (ctx: DeskContext) => TemplateValue;
  /** Re-render whenever the store changes. */
  live: boolean;
  actions?: Record<string, DrawerHandler>;
  inputs?: Record<string, DrawerHandler>;
}

/** Form controls that handlers read values from. */
export type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Narrow a handler's element to a form control. */
export const asField = (el: HTMLElement): Field => el as Field;

/** What the signed-out screen receives: data, a redraw and a hand-over once signed in. */
export interface LoginContext {
  readonly state: State;
  redraw: () => void;
  toast: (message: string) => void;
  signedIn: (staff: Staff) => void;
}
