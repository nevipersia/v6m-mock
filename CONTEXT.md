# V6M mock — context handoff

Paste this file into a new chat to bring it up to speed. Everything here is current as of the
"Add mock guest website and V6M Desk staff app" commit on `main`.

## The business

**V6M Resort and Events Place** — Purok 3, Brgy. Munting Pulo, Lipa City, Batangas, about 10 minutes
from SM Lipa. A small family-and-barkada resort that sells four things against the same pool, rooms
and calendar:

- Pool entrance: day tour (8 AM–4 PM) and overnight swim (6 PM–6 AM)
- Rooms and cottages (Suite, Deluxe, Cottage A/B/C)
- A private villa let through Airbnb ("Enclave Villa")
- Exclusive events: debuts, weddings, prenups, birthdays

Guests reach them on Facebook Messenger, Instagram DMs and two phone lines. Contact: 0927-823-3678,
(043) 774-5903, v6mresortandeventsplace@gmail.com. Socials: facebook.com/v6mresort and
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

Other real facts: rooms include air-con, smart TV, hot and cold shower and Wi-Fi; there is a grilling
station, parking and gardens; pets are allowed in diapers or cages; guests bring valid IDs; a real
promo ran for 15% off in July–August, Monday to Thursday.

## Brand aesthetic

Warm Filipino tropical with a poster-like edge, taken from their Instagram.

- Logo: orange sun with a palm, navy serif "V6M", blue wave.
- Colors: orange `#F2782B`, navy `#1F2D5C`, pool blue `#2E86C1`, leaf green `#3E7D3A`,
  lime `#B5C93A`, terracotta `#B8452E`, flamingo pink `#F29BB0`, cream `#FBF5EA`.
- Type: Fraunces (display serif), Caveat (script, used sparingly), Plus Jakarta Sans (UI).
- Voice: warm and playful, Taglish-friendly. "Hola! Thanks for reaching V6M Resort."

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
- Rooms and cottages add per-head overnight entrance; the Airbnb villa does not.
- Every booking needs a 50% downpayment (`depositRequired`, rounded up to the peso; Airbnb in full)
  before it is confirmed; less stays on hold. `applyPayment` in `core/actions.ts` enforces it.
- Editing (`updateBooking` in `core/actions.ts`, form `booking-form.ts` with `editId`): hold or
  confirmed bookings only (`isEditable`), not events or Airbnb. Re-checks availability excluding the
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
It contains 42 bookings, 36 payments, 53 guests, 40 inquiries, one event (Cruz 18th debut on Sep 21,
reserved, ₱48,000, closes the resort), saved replies, an activity log and the 2 staff accounts. The
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

1. Are the 2026 rates above still correct?
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
- Airbnb iCal import and export, Meta inbox integration, SMS reminders, reports and CSV export.
- A public booking flow with real payments; the current site only records inquiries.
