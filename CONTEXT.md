# V6M mock — context handoff

Paste this file into a new chat to bring it up to speed. Everything here is current as of the
"Add mock guest website and V6M Desk staff app" commit on `main`.

## The business

**V6M Resort and Events Place** — Purok 3, Brgy. Munting Pulo, Lipa City, Batangas, about 10 minutes
from SM Lipa. A small family-and-barkada resort that sells these against the same pools, rooms and
calendar:

- Pool entrance per head, in four sessions (from the resort's guest registration template):
  day tour 8 AM–4 PM, night tour 2 PM–10 PM, overnight 3 PM–12 NN, overnight tour 6 PM–6 AM
- Rooms and cottages (Suite, Deluxe, Cottage A/B/C), plus entrance
- Exclusive rental packages (from the "Exclusive Rental Rates" brochure): while one is booked, no
  other guests are booked for that time. Up to 120 guests. 3 pools, 7 kubo cottages, 7 air-conditioned
  villas, free Wi-Fi, grilling area, ample parking.
- Exclusive events: debuts, weddings, prenups, birthdays

There is no Airbnb listing in the tool (removed on request).

Guests reach them on Facebook Messenger, Instagram DMs and two phone lines. Contact: 0927-823-3678,
(043) 756 4547 (brochure), v6mresortandeventsplace@gmail.com. Socials: facebook.com/v6mresort and
instagram.com/v6m_resort.

### Rates (from public third-party listings — the owner has NOT confirmed these)

| Product | Window | Capacity | Price |
| --- | --- | --- | --- |
| Day tour entrance | 8 AM – 4 PM | per head | ₱150 adult / ₱100 kid |
| Overnight entrance | 6 PM – 6 AM | per head | ₱200 adult / ₱150 kid |
| Suite room | 3 PM – 12 NN | up to 6 | ₱2,500 + entrance |
| Deluxe room | 3 PM – 12 NN | couple | ₱2,200 + entrance |
| Cottage A | 6 PM – 6 AM | 10–15 | ₱2,000 + entrance |
| Cottage B | 6 PM – 6 AM | 8–10 | ₱1,500 + entrance |
| Cottage C | 6 PM – 6 AM | 4–6 | ₱1,000 + entrance |
| Night tour entrance | 2 PM – 10 PM | per head | ₱180 / ₱130 **placeholder** |
| Overnight entrance (rooms) | 3 PM – 12 NN | per head | ₱200 / ₱150 **placeholder** |

Exclusive rental rates, from the V6M brochure:

| Package | Day tour 8 AM – 4 PM | Overnight |
| --- | --- | --- |
| Full resort use (all rooms + amenities) | ₱40,000 | ₱50,000 (3 PM – 12 NN) |
| Partial room use (3 rooms + amenities) | ₱35,000 | ₱45,000 (3 PM – 12 NN) |
| Cottages only (all kubo cottages + amenities) | ₱30,000 | ₱40,000 (6 PM – 6 AM) |

Other real facts: rooms include air-con, smart TV, hot and cold shower and Wi-Fi; there is a grilling
station, parking and gardens; pets are allowed in diapers or cages; guests bring valid IDs; a real
promo ran for 15% off in July–August, Monday to Thursday.

## Brand aesthetic

Follows the resort's own "Exclusive Rental Rates" brochure and logo.

- Logo: `assets/img/logo.jpg` (the real one: orange sun, palms, navy "V6M", blue wave).
- Photos: cropped from the brochure into `assets/img/` (pool, villas, kubo, rooms, package thumbnails).
- Colors: charcoal green `#2B312C` (was navy), gold `#8C7446` / `#A48B5E` (accent, was orange),
  cream `#FAF6EF`; logo sun orange `#F2782B` stays for rooms. Token names in `tokens.css` kept their
  old names (`--navy`, `--orange`) so the CSS did not need rewriting.
- Type: Anton (bold condensed caps for headings), Cinzel (engraved caps for small labels), Poppins (text).
- Voice: warm and direct, Taglish-friendly. "100% Exclusive. No Sharing. No Strangers."

## What exists

A PRD for the internal tool (product name **V6M Desk**) covering research, goals and metrics,
personas, prioritised features, design direction, technical notes, rollout and risks. It lives as a
Claude doc:
https://claude.ai/code/artifact/85caaa34-b90e-40ca-a2e1-bdd759b52bb3

And this repo — a working prototype of the staff tool. The guest-facing website was built first and
then removed on request; its inquiries stay in the data as inbox history.

- **V6M Desk** (`/admin/`): staff app — email and password sign-in (two demo accounts, or an invite
  code that also sets a password),
  Dashboard, Calendar (day/week/month with free navigation), Bookings, Inbox, Events, Users.
- **Booking link** (`/book/?code=…`): single-use page a staff member sends to one guest; the booking
  they submit lands on the calendar as a hold under that staff member.

TypeScript (strict) in `src/`, compiled by `tsc` to plain ES modules in `assets/js/` (git-ignored, no
bundler, no framework). Run `npm install` once, then `npm start` (build + serve) and open
http://localhost:4789/admin/ (`/` redirects there). Use `npm run watch` while editing. Opening the HTML directly does not work because the browser blocks reading
`data/mock-data.json`.

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
    pdf.ts                  Minimal PDF writer, no dependencies
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
  img/                      Logo
  css/                      tokens.css, base.css (shared) · admin.css · book.css
  js/                       Build output of src/ (git-ignored)
tsconfig.json               Strict TypeScript, ES modules, no bundler
```

## Conventions to follow

- Views export `render(ctx)` and optional `actions` / `inputs` objects. `main.js` dispatches clicks on
  `[data-action]`, submits on `form[data-submit]` and input on `[data-input]`. Drawer content objects
  use the same shape plus `live` (re-render when the store changes) and a `title`.
- `ctx` is a `DeskContext` (`src/admin/types.ts`): `state`, `staff`, `can(permission)`,
  `canView(page)`, `toast()`, `redraw()`, `openBooking(id)`, `newBooking(prefill)`, `newBookingLink()`.
- Data shapes live in `src/core/types.ts`. Change them there first when the JSON changes.
- Import sibling modules with a `.js` extension (`'./rules.js'`); `tsc` resolves it to the `.ts` file.
- The booking page's wording, colors, optional fields, house rules and allowed products come from
  `data/booking-page.json`, validated by `normalizeBookingPage()` in `src/core/booking-page.ts`.
- All mutations go through `core/actions.js` → `store.update()`, which saves and notifies subscribers.
- Never build markup by string concatenation; use the `html` tag so values are escaped.
- Sentence case, no emoji in UI chrome, plain error text, mobile-first (bottom tab bar under 900px).

## Business rules encoded

- One booking per unit per night. An exclusive event that is reserved, paid or done closes the whole
  resort that day.
- Each pool session caps at 120 guests — a placeholder until the owner confirms.
- Rooms (3 PM–12 NN, `overnightstay` session) and cottages (6 PM–6 AM, `overnight`) add per-head
  entrance for their session.
- Exclusive rentals (`state.exclusivePackages`, product ids `EX-DAY-FULL` … `EX-NIGHT-COTTAGES`,
  `productType: 'exclusive'`): a booking needs its whole time window free of every other active
  booking, and while it exists no regular booking whose window overlaps it can be made
  (`bookingWindow`, `bookingsOverlapping`, `exclusiveOverlapping` in `core/rules.ts`). Up to 120 guests.
- Guest details from the registration template: complete address, email, SC/PWD count, a guest list
  (`booking.guestList`: name, gender, age, remarks), additional charges (`booking.extras`, typed
  amounts, part of the price) and payment details (`payment.sentAt`, `payment.senderName`).
- The booking PDF is the guest registration sheet (companions template): details, guest list with
  signature column, charges, total / downpayment / overall amount, "Received by". Multi-page.
- Every booking needs a 50% downpayment (`depositRequired`, rounded up to the peso)
  before it is confirmed; less stays on hold. `applyPayment` in `core/actions.ts` enforces it.
- Editing (`updateBooking` in `core/actions.ts`, form `booking-form.ts` with `editId`): hold or
  confirmed bookings only (`isEditable`), not events. Re-checks availability excluding the
  booking itself, re-quotes, keeps payments, re-prices. An unchanged discount is kept as is, so a
  manager can edit a booking an owner discounted without a note.
- Manual discounts (`applyDiscount` / `removeDiscount`, rules in `core/rules.ts`): permission
  `discounts.apply` (owner and manager by default). Non-owners must give a note; owners need not.
  Stored as `booking.discount`; `booking.total` = `pricing.total` − discount, and `reprice()` moves
  the booking between hold and confirmed as the 50% downpayment changes. The total can't drop below
  what was paid.
- Mock GCash QR payment (`payByQr`, `core/qr-payment.ts`): 13-digit reference, not one repeated
  digit, not already used. The QR is drawn by `core/qr.ts` and is not scannable. Booking-link guests
  pay it after the form; staff can show it from the booking drawer.
- Check-in needs a valid-ID tick and collects any balance.
- Sign-in takes an email and password; demo passwords live in the data in plain text (mock only).
- V6M Desk is invite only: the owner creates an account and a code, each code works once, and the
  person sets their own password when redeeming it.
- Permissions live on each staff record, so the owner can change them per account from the Users page.
- Booking links are single use and expire; using one creates a hold for the staff member who sent it.

## Mock data

`data/mock-data.json` holds one week, **Sep 15–21 2026**, and the apps treat **Sep 17 2026** as today.
It contains about 43 bookings (two exclusive rentals: Sep 23 full resort day tour, Sep 26 cottages-only
overnight), their payments, guests with addresses, two sample guest lists, one booking with videoke and
corkage charges, 40 inquiries, one event (Cruz 18th debut on Sep 21, reserved, ₱48,000, closes the
resort), saved replies (including exclusive rental rates), an activity log and the 2 staff accounts. The
calendar is not limited to that week: staff can page back or forward to any date.

Two demo accounts are ready on the sign-in page (one-click Sign in, or Fill in to see the
credentials). They exist so anyone can see the tool working against the sample data; the top bar
shows a "Demo account" badge while one is in use.

| Account | Role | Sign-in |
| --- | --- | --- |
| Liza Manalo | owner | liza@v6mresort.example / owner1234 |
| Joy Dimaculangan | manager | joy@v6mresort.example / manager1234 |

Anyone else needs an invite code created on the Users page. The data also carries `invites` and
`bookingLinks` arrays, both empty at the start.

Changes made in the apps are saved to `localStorage` under `v6m-mock-state` and shared between the
website and V6M Desk, including across tabs. "Reset data" in V6M Desk clears them. Saved state is
also discarded if `meta.seed` in the JSON changes.

The data was produced by a seeded generator script that validates its own output (no double bookings,
pool capacity, event closures, payments matching balances). **That script is not in the repo** — it
was kept in a temp folder. If you need different data, rewrite it.

Everything except the rates and the resort's own details is fictional: guests, staff, mobile numbers
(all start 0900), the "Back-to-school weekday barkada" promo and all event packages and prices.

## Open questions for the owner

1. Are the 2026 rates above still correct? What are the night tour (2 PM–10 PM) and 3 PM overnight
   entrance rates? (placeholders now)
2. Real maximum pool capacity per session?
3. Confirm the 50% downpayment for every booking type, and the cancellation or rebooking policy?
4. What do the event packages include and cost?
5. Does the on-site restaurant need orders linked to bookings?
6. How many staff, and who may give discounts?
7. Original logo files and brand fonts?
8. UI language: English, Tagalog, or both?
9. Does the front desk work on phones, a counter laptop, or both?

## Possible next steps

- Confirm the open questions and update `data/mock-data.json` plus the rate tables.
- Wire a real backend (the PRD suggests a hosted Postgres such as Supabase) behind `core/store.js` and
  `core/actions.js`, which are the only places that touch data.
- Meta inbox integration, SMS reminders, reports and CSV export.
- A public booking flow with real payments; the current site only records inquiries.
