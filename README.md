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

## Sales on the dashboard

The dashboard opens with today at a glance — arrivals, who is in house, how full each pool session
is, collected today, balances due — then a **Sales** section over the last **7, 30 or 90 days**:

- **Sales booked**, the total of the bookings taken in that window, with how many were taken.
- **Collected**, the payments received, against the same length of time before it (▲ or ▼ percent).
- **Average booking** and **Still to collect** on those bookings.
- A **trend** chart with two bars per period: what was booked and what was collected. Seven days
  charts a bar per day; the longer windows switch to a bar per week so the chart stays readable.
- **What sold**, ranked by money: exclusive rentals, cottages, rooms, each entrance session and
  events, with each one's share and booking count.
- **How guests paid**: GCash, cash and bank transfer, with shares.

"Booked" counts a booking on the day it was taken, not the day of the stay, so the figures answer
"how are we selling?" rather than "who is here?". Cancelled bookings are left out. Every account can
see this section; it is not behind a permission.

## What can be booked

- **Entrance per head**, in four sessions from the resort's guest registration template: day tour
  8 AM–4 PM, night tour 2 PM–10 PM, overnight 3 PM–12 NN and overnight tour 6 PM–6 AM. Night tour and
  3 PM overnight rates are placeholders until the owner confirms them.
- **Cottages and rooms**, plus entrance.
- **Exclusive rental**, from the brochure: full resort use (₱40,000 day / ₱50,000 overnight), partial
  room use (₱35,000 / ₱45,000) or cottages only (₱30,000 / ₱40,000), up to 120 guests. While one is
  booked, no other guests are booked for that time, and the calendar marks those cells "Exclusive".
  An exclusive rental can only be booked when its whole time window is free.

Each booking keeps the details from the guest information form: complete address, contact number,
email, SC/PWD count, a **guest list** (name, gender, age, remarks), **additional charges** (picked
from a dropdown — videoke, corkage, extra heads, extra cottage or room — or **Other…** to type
anything else, with the amount staff type) and payment details (mode, time sent, GCash sender).
**Who is coming** is required on the booking link: the guest names everyone in their headcount
before they can send the booking. The list resizes itself as they change the number of adults and
kids, and a counter shows how many are still missing. Groups larger than 20 name the first 20 and
the rest sign at the gate.

At the desk, names sit inside the booking form, so **New booking** and **Edit booking** change the
headcount and the names in one place (optional there — staff often fill them at the gate). The
booking drawer's guest list section shows "5 missing" or "Complete" and edits the names on its own.
**Registration sheet** downloads the companions sheet as a PDF with signature lines and
"Received by" — from the booking drawer, or straight from the **Sheet** button on any row of the
Bookings list, which also has an **Edit** button and shows how many guests are named.

## The 50% downpayment

Every booking needs 50% of its total paid (rounded up to the peso) before
it counts as confirmed. Anything less keeps it **on hold**, and the desk shows how much is still
short ("₱750 to confirm"). Staff can record the downpayment in the new booking form or on the booking,
or collect it by **GCash QR** from the booking drawer.

## Editing a booking

Open a booking and click **Edit booking** (or **Edit** on a row of the Bookings list) to change the
guest, mobile, source, booking type, date, number of guests, the guest list, notes or discount. It works for bookings on hold or confirmed (not checked in, checked out,
cancelled or events). Payments stay; the availability, price and 50% downpayment are
worked out again, so an edit can confirm a booking or put it back on hold, and the total can't drop
below what was already paid. Each edit is written to the booking's activity log.

## Discounts

Owners and managers can give a discount by hand, as pesos off or a percentage: when creating a
booking, when editing one (**Edit booking** in the booking drawer), or with **Give a discount** in the
drawer. Managers must write a reason; owners
may leave it blank. The reason, who gave it and when show on the booking, in its activity log and on
the registration sheet PDF.

- The permission is **Give discounts** on the Users page. Owners and managers have it by default; the
  owner can grant it to anyone else, and every non-owner must write a reason.
- A discount can't push the total below what the guest already paid (the desk does not refund).
- The 50% downpayment follows the discounted total. A discount can confirm a booking that was short;
  removing one can put a confirmed booking back on hold.

## Paying by QR (mock)

The payment QR shows the amount due, the booking and a check code. The guest "pays" and types the
13-digit GCash reference from their receipt; the app then pretends to check it with GCash and, if it
passes, records the payment and confirms the booking. **It is a mock:** the QR follows a real QR's
layout but cannot be scanned, and nothing is charged. Verification refuses references that are not
13 digits, are one repeated digit, or were already used. **Simulate a GCash payment** fills in a
test reference. The rules live in `src/core/qr-payment.ts`; swap them for the payment provider's API in
a real build.

## Sending a booking link

**New booking** is the one way in. Taking the booking yourself is the default; if the guest would
rather fill it in themselves, the **Send a booking link** button at the top of that form opens the
link panel, which links back the same way. The link is a single-use URL. Give it to a
guest: they fill in their own details once, then pay the 50% downpayment by GCash QR. The booking
appears on the calendar under the staff member who sent it, on hold until the downpayment is
verified. If the guest leaves before paying, opening the link again goes straight to the payment step;
once paid, the link stops working.

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
    qr-payment.ts           Mock GCash QR payment: request, check code, reference checks
    qr.ts                   Draws the QR-style code as SVG (not scannable)
    payment-card.ts         The QR payment card shared by both pages
    format.ts               Pesos, dates, times, digit grouping, PH mobile check
    pdf.ts                  Minimal multi-page PDF writer, no dependencies
    catalog.ts              What can be booked, grouped for pickers and the booking page
    guest-list.ts           Guest list rows shared by both pages
    dom.ts                  Safe html`` templates and event delegation
  book/
    main.ts                 Booking page: load, validate, submit
    screens.ts              Form, downpayment, thank-you and problem screens
  admin/
    main.ts                 Sign-in, hash routing, event dispatch, focus restore
    types.ts                DeskContext, view and drawer contracts
    auth.ts                 Roles, page access, permissions
    routes.ts, layout.ts    Navigation, shell, page header
    components/             drawer, booking-detail, booking-form, booking-link, booking-pdf, badges, icons, toast
    views/                  login, dashboard, calendar, bookings, inbox, events, users
assets/
  img/                      Logo, and photos cropped from the V6M brochure for the booking page
  css/                      tokens.css, base.css (shared) · admin.css · book.css
  js/                       Build output of src/ (git-ignored)
tsconfig.json               Strict TypeScript, ES modules, no bundler
scripts/build-site.mjs      Copies the built site into dist/ for hosting
vercel.json                 Vercel build command and output folder
```

The guest-facing website was removed; the inquiries in the sample data are kept as history for the
inbox.

Rates come from public listings of V6M Resort and may be out of date. Guests, staff, events, promos and packages in the sample data are fictional.
