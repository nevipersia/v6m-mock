// Mock sign-in: pick a sample staff account. No passwords; the choice lives in
// sessionStorage so each browser tab can act as a different person.

const SESSION_KEY = 'v6m-desk-staff';
let memoryFallback = null;

export const ROLE_LABELS = {
  owner: 'Owner',
  front_desk: 'Front desk',
  housekeeping: 'Housekeeping',
  events: 'Events',
};

export const ROLE_SUMMARIES = {
  owner: 'Everything, including cancellations',
  front_desk: 'Bookings, payments, check-ins and the inbox',
  housekeeping: 'Room, cottage and pool status',
  events: 'Event bookings, calendar and inquiries',
};

/** Pages each role can open. The first one is where they land after signing in. */
const PAGE_ACCESS = {
  owner: ['today', 'calendar', 'bookings', 'inbox', 'events', 'housekeeping'],
  front_desk: ['today', 'calendar', 'bookings', 'inbox', 'events', 'housekeeping'],
  housekeeping: ['housekeeping'],
  events: ['events', 'calendar', 'inbox', 'today'],
};

const PERMISSIONS = {
  owner: ['bookings.write', 'bookings.cancel', 'payments.write', 'inbox.write', 'housekeeping.write'],
  front_desk: ['bookings.write', 'payments.write', 'inbox.write', 'housekeeping.write'],
  housekeeping: ['housekeeping.write'],
  events: ['bookings.write', 'payments.write', 'inbox.write'],
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
  return state.staff.find((person) => person.id === id) ?? null;
}

export const canView = (staff, pageId) => PAGE_ACCESS[staff.role].includes(pageId);
export const can = (staff, permission) => PERMISSIONS[staff.role].includes(permission);
export const homePage = (staff) => PAGE_ACCESS[staff.role][0];
