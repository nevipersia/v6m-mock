// Turns an invite code into a login. The sign-in page posts { code, password };
// this creates the Supabase Auth user for the invited email, links it to the
// staff row and activates it, then returns { email } so the page can sign in.
// A browser cannot do this itself: it can neither read invites nor create
// confirmed logins.

import { redeemInvite } from '../_shared/core/actions.js';
import { update } from '../_shared/core/store.js';
import { admin, serve, withState } from '../_shared/server.ts';

const INVALID = 'That code is not valid, or it has already been used.';

serve(async (body) => {
  const code = String(body.code ?? '').trim().toUpperCase();
  const password = String(body.password ?? '');
  if (!code) return { error: 'Enter the code from your invite.' };
  if (password.length < 8) return { error: 'Pick a password of at least 8 characters.' };

  let createdUserId: string | null = null;
  try {
    return await withState(['staff', 'invites', 'activity_log'], async (state) => {
      const invite = state.invites.find((item: any) => item.code.toUpperCase() === code && !item.usedAt);
      const staff = invite && state.staff.find((person: any) => person.id === invite.staffId);
      if (!invite || !staff || staff.status !== 'invited') return { error: INVALID };

      const { data, error } = await admin.auth.admin.createUser({ email: staff.email, password, email_confirm: true });
      if (error || !data.user) {
        return {
          error: /already|registered|exists/i.test(error?.message ?? '')
            ? 'That email already has a login. Ask the owner to check the account.'
            : 'Could not create your login. Try again in a moment.',
        };
      }
      createdUserId = data.user.id;

      const joined = redeemInvite(code, password);
      if (!joined) return { error: INVALID };
      update((current: any) => {
        const person = current.staff.find((item: any) => item.id === joined.id);
        // The password stays in Supabase Auth; the staff row never stores it.
        person.password = null;
        person.userId = createdUserId;
      });
      return { email: staff.email };
    });
  } catch (error) {
    // The login exists but the account was not linked: remove it so the code can be tried again.
    if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
    throw error;
  }
});
