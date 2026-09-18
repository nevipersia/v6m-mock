// Accounts and access. V6M Desk is invite only: you either sign in as one of the
// two demo accounts or redeem an invite code the owner created.
//
// Permissions live on each staff record in the data, so the owner can change
// them from the Users page.

const SESSION_KEY = 'v6m-desk-staff';
let memoryFallback = null;

export const ROLE_LABELS = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
};

export const ROLE_SUMMARIES = {
  owner: 'Full access, including cancellations and user accounts',
  manager: 'Day-to-day running of bookings, payments and the inbox',
  staff: 'Whatever the owner switches on',
};

/** Everything an account can be granted, in the order the Users page shows them. */
export const PERMISSIONS = [
  { id: 'bookings.write', label: 'Create and edit bookings', detail: 'Also sends single-use booking links' },
  { id: 'payments.write', label: 'Record payments', detail: 'Deposits, balances and check-in collections' },
  { id: 'bookings.cancel', label: 'Cancel bookings', detail: 'Frees the slot again' },
  { id: 'inbox.write', label: 'Use the inbox', detail: 'Reply to inquiries and turn them into bookings' },
  { id: 'events.manage', label: 'Manage events', detail: 'See the event pipeline and packages' },
  { id: 'users.manage', label: 'Manage users', detail: 'Invite accounts and change what they can do' },
];

export const PERMISSION_IDS = PERMISSIONS.map((permission) => permission.id);

export const ROLE_DEFAULTS = {
  owner: [...PERMISSION_IDS],
  manager: ['bookings.write', 'payments.write', 'inbox.write', 'events.manage'],
  staff: ['bookings.write', 'payments.write'],
};

/** Pages everyone can open, and the permission each restricted page needs. */
const PAGE_REQUIREMENTS = {
  dashboard: null,
  calendar: null,
  bookings: null,
  inbox: 'inbox.write',
  events: 'events.manage',
  users: 'users.manage',
};

function readSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return memoryFallback;
  }
}

export function signIn(staffId) {
  memoryFallback = staffId;
  try {
    sessionStorage.setItem(SESSION_KEY, staffId);
  } catch {
    // Session storage blocked: stay signed in for this page load only.
  }
}

export function signOut() {
  memoryFallback = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to remove.
  }
}

export function currentStaff(state) {
  const id = readSession();
  const staff = state.staff.find((person) => person.id === id);
  return staff && staff.status === 'active' ? staff : null;
}

export const can = (staff, permission) => staff.permissions.includes(permission);

export const canView = (staff, pageId) => {
  const required = PAGE_REQUIREMENTS[pageId];
  return required === null || (required !== undefined && can(staff, required));
};

export const homePage = (staff) => ['dashboard', 'calendar', 'bookings'].find((page) => canView(staff, page)) ?? 'dashboard';
