# Deploying V6M Desk on Supabase

The app runs in two modes from the same code:

| | Demo (default) | Supabase |
| --- | --- | --- |
| Data | `data/mock-data.json`, changes in the browser's localStorage | Supabase Postgres |
| Sign-in | Two open demo accounts, plain-text passwords | Supabase Auth, invite only |
| "Today" | Frozen on Sep 17 2026 | The real date in Manila |
| Booking link page | Runs the booking rules in the browser | Calls the `booking-link` Edge Function |
| Demo bits (Reset data, Simulate payment, demo accounts) | Shown | Hidden |

`npm run build` picks the mode: with `SUPABASE_URL` and `SUPABASE_ANON_KEY` set it builds for
Supabase and leaves the mock data out of `dist/`; without them it builds the demo.

## What is where

```
supabase/
  migrations/…_v6m_desk.sql   Tables, row-level security, Realtime, make_owner()
  seed.sql                    Rates, rooms, packages, promos, saved replies (no guests or bookings)
  functions/
    booking-link/             The guest booking page's server (open, submit, pay)
    redeem-invite/            Turns an invite code into a login
    _shared/server.ts         Service-role client and the app's store, shared by both
    _shared/core/             The compiled app core, copied by `npm run build:functions` (git-ignored)
  config.toml                 Lets both functions accept calls from people with no login yet
src/core/backends/supabase.ts Loads the tables and saves each change's rows
src/core/tables.ts            Which collection is which table, camelCase ↔ snake_case
src/core/config.ts            Reads the mode from assets/config.js
scripts/build-site.mjs        Writes dist/assets/config.js for Supabase builds
scripts/make-seed.mjs         Regenerates seed.sql from the catalog in data/mock-data.json
```

## One-time setup

You need a Supabase account and a Vercel account (or any static host). The Supabase CLI runs
through `npx`, so there is nothing else to install.

### 1. Create the Supabase project

In the Supabase dashboard, create a project. Pick the **Singapore** region, the closest to Batangas.
Save the database password somewhere safe.

### 2. Create the database

```bash
npx supabase login
```

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

```bash
npx supabase db push --include-seed
```

The project ref is the part of the project URL before `.supabase.co`. `db push` applies the
migration; `--include-seed` then loads `supabase/seed.sql`. (Without the CLI: paste the migration,
then `seed.sql`, into the dashboard's SQL editor and run each.)

### 3. Lock down sign-ups

In **Authentication → Sign In / Providers → Email**, turn **off** "Allow new users to sign up".
Logins are only ever created by the `redeem-invite` function or by you in the dashboard.

Under **Authentication → URL Configuration**, set **Site URL** to the address the desk will live at
(for example `https://v6m-desk.vercel.app/admin/`).

### 4. Deploy the two Edge Functions

```bash
npm run build:functions
```

```bash
npx supabase functions deploy booking-link --no-verify-jwt
```

```bash
npx supabase functions deploy redeem-invite --no-verify-jwt
```

```bash
npx supabase secrets set SITE_URL=https://v6m-desk.vercel.app
```

`SITE_URL` limits which website may call the functions (use your real address, no trailing slash).
The functions get `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Supabase automatically.
Re-run `npm run build:functions` and the deploy whenever `src/core/` changes, so the server keeps
the same booking rules as the desk.

### 5. Make the first owner

1. **Authentication → Users → Add user → Create new user**: the owner's email and a password, with
   **Auto Confirm User** ticked.
2. In the **SQL editor**, run:

   ```sql
   select public.make_owner('owner@example.com', 'Owner Name');
   ```

That account can now sign in and invite everyone else from the Users page. `make_owner` can only be
run from the SQL editor, never from the app.

### 6. Point the website at Supabase

In **Supabase → Project Settings → API Keys**, copy the project URL and the **anon** (or
**publishable**) key. Never use the `service_role` / secret key here: the anon key is meant to be
public, and row-level security decides what it can reach.

In **Vercel → Project → Settings → Environment Variables**, add:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
| `SUPABASE_ANON_KEY` | the anon / publishable key |

Redeploy. The build log should end with `backend: Supabase (https://…supabase.co)`.

To try a Supabase build on your own machine first:

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co SUPABASE_ANON_KEY=your-anon-key npm run build
```

```bash
npx serve dist -l 4790
```

## Check it works

1. Open `/admin/`. There are no demo accounts and the top bar says **Today**, not "Demo date".
2. Sign in as the owner. The calendar and bookings are empty; the rates are there.
3. Users → Invite someone. Open a private window, choose **I have an invite code**, redeem it, and
   sign in as that person.
4. Make a booking, record a payment. Open the desk in a second browser: it appears without a reload.
5. Send a booking link, open it on a phone, fill it in. It lands on the calendar as a hold.

## Before real guests use it

These are decisions or work that the code cannot settle for you.

- **GCash payment is still the demo.** The QR code on the booking page is drawn by the app, is not
  scannable, and "Verify payment" accepts any well-formed 13-digit reference and marks the
  downpayment paid. Before launch, either show the resort's real GCash QR and have staff confirm
  each reference against the GCash app, or connect a payment provider (PayMongo, Xendit) that
  confirms payments itself.
- **Rates marked as placeholders** (night tour and room entrance) still need the owner's numbers.
  Change them in `data/mock-data.json`, run `npm run seed:make`, and run `supabase/seed.sql` again;
  or edit the rows in the Supabase Table Editor.
- **Permissions.** The database enforces who is staff at all, and that only the owner (users.manage)
  can change accounts, invites, rates and settings. Finer permissions (cancelling, discounts,
  recording payments) are enforced by the desk screens, not by the database.
- **Two desks editing the same booking at the same moment**: the last save wins. If two desks create
  records with the same new ID at once, the second save is refused and that desk reloads the latest
  data with a message.
- **Password resets** are done from the dashboard: Authentication → Users → the person → Send
  password recovery. There is no "forgot password" link in the app yet.
- **Backups**: the free plan has no point-in-time recovery. For real bookings, use a paid plan with
  daily backups, or export the tables regularly.
- The desk loads every booking into the browser at sign-in, which is comfortable for several
  thousand bookings. The activity log loads the latest 500 entries.
