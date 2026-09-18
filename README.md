# V6M Resort mock

A clickable prototype of the internal tool for V6M Resort (Lipa City, Batangas):

- **V6M Desk** (`/admin/`): the staff app — dashboard, calendar, bookings, inbox, events and user accounts.
- **Booking link** (`/book/?code=…`): a single-use page a staff member sends to one guest.

Opening `/` redirects to the desk.

Everything runs in the browser. Nothing is booked, paid or sent.

## Run it

The pages load `data/mock-data.json`, which browsers block when a file is opened directly, so serve the folder:

```bash
npm start
```

Then open http://localhost:4789/admin/.

## Signing in

Sign in with an email and password. Two demo accounts are listed on the sign-in page, and one click
fills them in:

| Account | Email | Password | Can do |
| --- | --- | --- | --- |
| Liza Manalo | liza@v6mresort.example | `owner1234` | Everything, including cancellations and user accounts |
| Joy Dimaculangan | joy@v6mresort.example | `manager1234` | Bookings, payments, inbox and events |

Passwords sit in `data/mock-data.json` in plain text because this is a mock. A real build would hash
them on a server and never ship them to the browser.

New accounts are invite only: the owner creates one on the Users page, and the person redeems the
single-use code and picks their own password.

The owner can invite more accounts, tick or untick individual permissions, suspend someone, or revoke
an invite before it is used. Each invite code works once.

## Sending a booking link

From the dashboard or the bookings page, **Send booking link** creates a single-use URL. Give it to a
guest, they fill in their own details once, and the booking appears on the calendar as a hold under
the staff member who sent it. The link then stops working.

Booking links live in this browser's storage, so a link only opens on the same browser in this mock.

## How data works

- `data/mock-data.json` is the starting data: one week (Sep 15–21, 2026) of guests, bookings, payments, inquiries and one private event. The app treats **Sep 17, 2026** as today, and the calendar can still be moved to any other date.
- Changes you make (bookings, payments, check-ins, invites, booking links) are saved in your browser's localStorage, so open tabs stay in sync.
- **Reset data** in V6M Desk clears those changes. Replacing `mock-data.json` with a file that has a different `meta.seed` also discards them.

## Project structure

```
index.html                  Redirect to /admin/
admin/index.html            V6M Desk shell
book/index.html             Single-use booking page
data/mock-data.json         Sample data
assets/
  img/                      Logo and hero illustration
  css/
    tokens.css              Brand colors, fonts, radii (shared)
    base.css                Reset, buttons, fields, pills (shared)
    admin.css               V6M Desk layout
    book.css                Booking page layout
  js/
    core/                   Shared by every page
      store.js              Loads data, saves changes, syncs tabs
      rules.js              Availability, pricing, lookups
      actions.js            Every state change (bookings, payments, invites, links…)
      format.js             Pesos, dates, times, digit grouping
      pdf.js                Minimal PDF writer, no dependencies
      dom.js                Safe HTML templates and event delegation
    book/                   Single-use booking page
    admin/
      main.js               Sign-in, hash routing, event dispatch
      auth.js               Roles and permissions
      routes.js, layout.js  Navigation and page shell
      components/           Drawer, booking detail, booking form, booking links, PDF, badges, icons, toast
      views/                Login, dashboard, calendar, bookings, inbox, events, users
```

The guest-facing website was removed; the inquiries in the sample data are kept as history for the
inbox.

Rates come from public listings of V6M Resort and may be out of date. Guests, staff, events, promos and packages in the sample data are fictional.
