// Accounts and access. V6M Desk is invite only: the owner creates an account
// and sends its single-use code, which is where the person sets a password.
//
// The demo keeps accounts in the mock data (with two open demo accounts) and
// remembers who is signed in per tab. A Supabase build signs in with Supabase
// Auth; each staff row points at its Auth user through userId.
//
// What an account can do follows its role (`permissionsFor` in core/rules):
// owners everything, managers everything but user accounts. The permissions
// are still written on each staff record, which is what a Supabase build's
// database checks (supabase/migrations).

import { redeemInvite as redeemInviteInState } from '../core/actions.js';
import { isMock } from '../core/config.js';
import { loadStore, requireState } from '../core/store.js';
import { supabaseClient } from '../core/supabase-client.js';
import type { Permission, Role, Staff, State } from '../core/types.js';
import type { PageId } from './types.js';

const SESSION_KEY = 'v6m-desk-staff';
let memoryFallback: string | null = null;
/** Supabase builds: the signed-in Auth user. */
let authUserId: string | null = null;

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
};

export const ROLE_SUMMARIES: Record<Role, string> = {
  owner: 'Everything on the desk, plus the Users page: invites, roles and suspending accounts',
  manager: 'Everything on the desk except the Users page',
};

export const ROLES = Object.keys(ROLE_LABELS) as Role[];

/** Pages everyone can open, and the permission each restricted page needs. */
const PAGE_REQUIREMENTS: Record<PageId, Permission | null> = {
  dashboard: null,
  bookings: null,
  // The books: payments in, expenses out, what is owed.
  finances: 'expenses.manage',
  packages: 'packages.manage',
  inbox: 'inbox.write',
  users: 'users.manage',
};

function readSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return memoryFallback;
  }
}

function rememberDemoSession(staffId: string): void {
  memoryFallback = staffId;
  try {
    sessionStorage.setItem(SESSION_KEY, staffId);
  } catch {
    // Session storage blocked: stay signed in for this page load only.
  }
}

/**
 * Picks up a Supabase session left from an earlier visit. Call before
 * loading data: without a session the database returns nothing.
 */
export async function restoreSession(): Promise<void> {
  if (isMock) return;
  const client = await supabaseClient();
  const { data } = await client.auth.getSession();
  if (data.session) {
    // Suspended since the last visit, or the account was removed: start at sign-in.
    const { data: status } = await client.rpc('my_staff_status');
    if (status === 'active') authUserId = data.session.user.id;
    else await client.auth.signOut();
  }
  client.auth.onAuthStateChange((event, session) => {
    const next = session?.user.id ?? null;
    // Signed out here or in another tab, or the session could not be refreshed.
    if (event === 'SIGNED_OUT' && authUserId) location.reload();
    authUserId = next;
  });
}

/** Whether data can be loaded yet: always in the demo, after sign-in with Supabase. */
export const hasSession = (): boolean => isMock || authUserId !== null;

export async function signOut(): Promise<void> {
  memoryFallback = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to remove.
  }
  if (isMock) return;
  authUserId = null;
  const client = await supabaseClient();
  await client.auth.signOut();
  // Drop everything the last person loaded before anyone else signs in here.
  location.reload();
}

export type SignInResult = { staff: Staff; error?: undefined } | { staff?: undefined; error: string };

function accountProblem(staff: Staff | undefined): string | null {
  if (!staff) return 'That email and password do not match an account.';
  if (staff.status === 'invited') return 'That account still needs its invite code.';
  if (staff.status !== 'active') return 'That account is suspended. Ask the owner to reactivate it.';
  return null;
}

async function signInWithSupabase(email: string, password: string): Promise<SignInResult> {
  const client = await supabaseClient();
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error && (error.name === 'AuthRetryableFetchError' || !error.status)) {
    return { error: 'Could not reach the server. Check your connection and try again.' };
  }
  if (error || !data.user) return { error: 'That email and password do not match an account.' };
  authUserId = data.user.id;

  // An unlinked or suspended login can read nothing, so ask about the account first.
  const { data: status } = await client.rpc('my_staff_status');
  const statusProblem = status === 'active' ? null
    : status === 'suspended' ? 'That account is suspended. Ask the owner to reactivate it.'
      : status === 'invited' ? 'That account still needs its invite code.'
        : 'This login is not linked to a V6M Desk account. Ask the owner for an invite.';
  if (statusProblem) {
    await client.auth.signOut();
    authUserId = null;
    return { error: statusProblem };
  }

  let state: State;
  try {
    state = await loadStore();
  } catch (loadError) {
    await client.auth.signOut();
    authUserId = null;
    return { error: (loadError as Error).message };
  }
  const staff = state.staff.find((person) => person.userId === data.user.id);
  const problem = staff ? accountProblem(staff) : 'This login is not linked to a V6M Desk account. Ask the owner for an invite.';
  if (problem || !staff) {
    await client.auth.signOut();
    authUserId = null;
    return { error: problem ?? 'Could not sign in.' };
  }
  return { staff };
}

/**
 * Checks the email and password. The demo compares against the mock data
 * (plain text, a prototype only); a Supabase build asks Supabase Auth.
 */
export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  if (!isMock) return signInWithSupabase(email, password);
  const state = requireState();
  const staff = state.staff.find((person) => person.email?.toLowerCase() === email.trim().toLowerCase());
  if (!staff || !staff.password || staff.password !== password) return { error: 'That email and password do not match an account.' };
  const problem = accountProblem(staff);
  if (problem) return { error: problem };
  rememberDemoSession(staff.id);
  return { staff };
}

/**
 * Redeems an invite code and signs the new account in. With Supabase the
 * redeem-invite function creates the Auth user, because a guest-level key
 * cannot read invites or create logins.
 */
export async function redeemInvite(code: string, password: string): Promise<SignInResult> {
  const invalid = 'That code is not valid, or it has already been used.';
  if (isMock) {
    const staff = redeemInviteInState(code, password);
    if (!staff) return { error: invalid };
    rememberDemoSession(staff.id);
    return { staff };
  }
  const client = await supabaseClient();
  const { data, error } = await client.functions.invoke<{ email?: string; error?: string }>('redeem-invite', { body: { code, password } });
  if (error || !data?.email) return { error: data?.error ?? invalid };
  return signInWithSupabase(data.email, password);
}

export function currentStaff(state: State): Staff | null {
  const staff = isMock
    ? state.staff.find((person) => person.id === readSession())
    : state.staff.find((person) => authUserId !== null && person.userId === authUserId);
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
  (['dashboard', 'bookings'] as const).find((page) => canView(staff, page)) ?? 'dashboard';
