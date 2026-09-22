// Accounts and access. V6M Desk is invite only: you either sign in as one of the
// two demo accounts or redeem an invite code the owner created.
//
// Permissions live on each staff record in the data, so the owner can change
// them from the Users page.

import type { Permission, Role, Staff, State } from '../core/types.js';
import type { PageId } from './types.js';

const SESSION_KEY = 'v6m-desk-staff';
let memoryFallback: string | null = null;

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
};

export const ROLE_SUMMARIES: Record<Role, string> = {
  owner: 'Full access, including cancellations, discounts without a note and user accounts',
  manager: 'Day-to-day running of bookings, payments, discounts (with a note) and the inbox',
  staff: 'Whatever the owner switches on',
};

export const ROLES = Object.keys(ROLE_LABELS) as Role[];

export interface PermissionInfo {
  id: Permission;
  label: string;
  detail: string;
}

/** Everything an account can be granted, in the order the Users page shows them. */
export const PERMISSIONS: PermissionInfo[] = [
  { id: 'bookings.write', label: 'Create and edit bookings', detail: 'Also sends single-use booking links' },
  { id: 'payments.write', label: 'Record payments', detail: 'Deposits, balances and check-in collections' },
  { id: 'bookings.cancel', label: 'Cancel bookings', detail: 'Frees the slot again' },
  { id: 'inbox.write', label: 'Use the inbox', detail: 'Reply to inquiries and turn them into bookings' },
  { id: 'events.manage', label: 'Manage events', detail: 'See the event pipeline and packages' },
  { id: 'discounts.apply', label: 'Give discounts', detail: 'Owners can skip the note; everyone else must say why' },
  { id: 'users.manage', label: 'Manage users', detail: 'Invite accounts and change what they can do' },
];

export const PERMISSION_IDS: Permission[] = PERMISSIONS.map((permission) => permission.id);

export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  owner: [...PERMISSION_IDS],
  manager: ['bookings.write', 'payments.write', 'inbox.write', 'events.manage', 'discounts.apply'],
  staff: ['bookings.write', 'payments.write'],
};

/** Pages everyone can open, and the permission each restricted page needs. */
const PAGE_REQUIREMENTS: Record<PageId, Permission | null> = {
  dashboard: null,
  calendar: null,
  bookings: null,
  inbox: 'inbox.write',
  events: 'events.manage',
  users: 'users.manage',
};

function readSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return memoryFallback;
  }
}

export function signIn(staffId: string): void {
  memoryFallback = staffId;
  try {
    sessionStorage.setItem(SESSION_KEY, staffId);
  } catch {
    // Session storage blocked: stay signed in for this page load only.
  }
}

export function signOut(): void {
  memoryFallback = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to remove.
  }
}

export type SignInResult = { staff: Staff; error?: undefined } | { staff?: undefined; error: string };

/**
 * Mock credential check. Passwords sit in the data in plain text because this
 * is a prototype; a real build would hash them on a server.
 */
export function signInWithPassword(state: State, email: string, password: string): SignInResult {
  const staff = state.staff.find((person) => person.email?.toLowerCase() === email.trim().toLowerCase());
  if (!staff || !staff.password || staff.password !== password) return { error: 'That email and password do not match an account.' };
  if (staff.status === 'invited') return { error: 'That account still needs its invite code.' };
  if (staff.status !== 'active') return { error: 'That account is suspended. Ask the owner to reactivate it.' };
  signIn(staff.id);
  return { staff };
}

export function currentStaff(state: State): Staff | null {
  const id = readSession();
  const staff = state.staff.find((person) => person.id === id);
  return staff && staff.status === 'active' ? staff : null;
}

export const can = (staff: Staff, permission: Permission): boolean => staff.permissions.includes(permission);

const isPageId = (pageId: string): pageId is PageId => pageId in PAGE_REQUIREMENTS;

export const canView = (staff: Staff, pageId: string): boolean => {
  if (!isPageId(pageId)) return false;
  const required = PAGE_REQUIREMENTS[pageId];
  return required === null || can(staff, required);
};

export const homePage = (staff: Staff): PageId =>
  (['dashboard', 'calendar', 'bookings'] as const).find((page) => canView(staff, page)) ?? 'dashboard';
