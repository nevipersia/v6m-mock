# V6M Resort mock

A clickable prototype of the internal tool for V6M Resort (Lipa City, Batangas):

- **V6M Desk** (`/admin/`): the staff app — dashboard, calendar, bookings, inbox, events and user accounts.
- **Booking link** (`/book/?code=…`): a single-use page a staff member sends to one guest.

Opening `/` redirects to the desk.

Everything runs in the browser. Nothing is booked, paid or sent.

## Run it

The code is TypeScript in `src/`, compiled by `tsc` straight to ES modules in `assets/js/` (no
bundler). The pages load `data/mock-data.json`, which browsers block when a file is opened directly,
so build and serve the folder:

```bash
npm install
npm start
```

Then open http://localhost:4789/admin/. `npm start` compiles once and serves. While you edit, run
`npm run watch` in a second terminal so `assets/js/` stays current, and `npm run typecheck` to check
types without writing files.

## Deploying

`npm run build` compiles the TypeScript and copies the static site (`index.html`, `admin/`, `book/`,
`data/`, `assets/`) into `dist/`. `vercel.json` tells Vercel to run that build and serve `dist/`; any
static host works the same way.

## Signing in

Sign in with an email and password. Two demo accounts sit on the sign-in page so anyone can open the
tool and see how it works: **Sign in** gets you straight in, **Fill in** drops the credentials into
the form. They read the sample data in `data/mock-data.json` and never touch real resort bookings or
guests, and the top bar shows a "Demo account" badge while you use one.

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

## Editing the booking page

The guest booking page reads `data/booking-page.json`: every piece of wording, the accent and
background colors, whether the kids, notes and price estimate show, the house rules list, and which
bookings a guest may pick (an empty `products` list offers everything bookable). Missing or invalid
values fall back to the defaults in `src/core/booking-page.ts`, so a bad edit cannot break the page.
Edit the file by hand, or use the booking page editor artifact and paste its JSON over the file.

## How data works

- `data/mock-data.json` is the starting data: one week (Sep 15–21, 2026) of guests, bookings, payments, inquiries and one private event. The app treats **Sep 17, 2026** as today, and the calendar can still be moved to any other date.
- Changes you make (bookings, payments, check-ins, invites, booking links) are saved in your browser's localStorage, so open tabs stay in sync.
- **Reset data** in V6M Desk clears those changes. Replacing `mock-data.json` with a file that has a different `meta.seed` also discards them.

## Project structure

```
index.html                  Redirect to /admin/
admin/index.html            V6M Desk shell
book/index.html             Single-use booking page
data/
  mock-data.json            Sample data
  booking-page.json         Booking page wording, colors, fields and house rules
src/                        TypeScript sources (compiled to assets/js/, which is not committed)
  core/                     Shared by every page
    types.ts                Types for everything in the data files
    store.ts                Loads data, saves changes to localStorage, syncs tabs
    rules.ts                Availability, pricing, lookups, labels
    actions.ts              Every state change (bookings, payments, invites, links…)
    booking-page.ts         Loads and validates booking-page.json
    format.ts               Pesos, dates, times, digit grouping, PH mobile check
    pdf.ts                  Minimal PDF writer, no dependencies
    dom.ts                  Safe html`` templates and event delegation
  book/
    main.ts                 Booking page: load, validate, submit
    screens.ts              Form, thank-you and problem screens
  admin/
    main.ts                 Sign-in, hash routing, event dispatch, focus restore
    types.ts                DeskContext, view and drawer contracts
    auth.ts                 Roles, page access, permissions
    routes.ts, layout.ts    Navigation, shell, page header
    components/             drawer, booking-detail, booking-form, booking-link, booking-pdf, badges, icons, toast
    views/                  login, dashboard, calendar, bookings, inbox, events, users
assets/
  img/                      Logo
  css/                      tokens.css, base.css (shared) · admin.css · book.css
  js/                       Build output of src/ (git-ignored)
tsconfig.json               Strict TypeScript, ES modules, no bundler
scripts/build-site.mjs      Copies the built site into dist/ for hosting
vercel.json                 Vercel build command and output folder
```

The guest-facing website was removed; the inquiries in the sample data are kept as history for the
inbox.

Rates come from public listings of V6M Resort and may be out of date. Guests, staff, events, promos and packages in the sample data are fictional.
