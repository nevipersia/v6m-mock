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

Warm Filipino tropical with a poster-like edge, taken from their Instagram.

- Logo: orange sun with a palm, navy serif "V6M", blue wave.
- Colors: orange `#F2782B`, navy `#1F2D5C`, pool blue `#2E86C1`, leaf green `#3E7D3A`,
  lime `#B5C93A`, terracotta `#B8452E`, flamingo pink `#F29BB0`, cream `#FBF5EA`.
- Type: Fraunces (display serif), Caveat (script, used sparingly), Plus Jakarta Sans (UI).
- Voice: warm and playful, Taglish-friendly. "Hola! Thanks for reaching V6M Resort."

The resort's brochure look (charcoal green and gold, Anton headings) was tried and reverted on
request; photos cropped from the brochure stay in `assets/img/` for the booking page's package card.

## What exists

A PRD for the internal tool (product name **V6M Desk**) covering research, goals and metrics,
personas, prioritised features, design direction, technical notes, rollout and risks. It lives as a
Claude doc:
https://claude.ai/code/artifact/85caaa34-b90e-40ca-a2e1-bdd759b52bb3

And this repo — a working prototype of the staff tool. The guest-facing website was built first and
then removed on request; its inquiries stay in the data as inbox history.

- **V6M Desk** (`/admin/`): staff app — email and password sign-in (two demo accounts, or an invite
  code that also sets a password),
  Dashboard, Bookings (calendar or list, by month, week or day), Finances, Packages, Inbox, Events, Users.
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
    store.ts                Holds the state; update() re-renders and hands each change to the backend
    backend.ts              The Backend contract, plus a read-only one for the booking page
    backends/local.ts       Demo: mock-data.json + localStorage, syncs tabs
    backends/supabase.ts    Supabase: loads the tables, saves the rows each change touched, Realtime
    tables.ts               Collection ↔ table mapping, camelCase ↔ snake_case, +08:00 timestamps
    config.ts               Demo or Supabase, from assets/config.js
    supabase-client.ts      The browser's Supabase client (library via the import map)
    rules.ts                Availability, pricing, lookups, labels
    period.ts               A window of days: its length, its chart bars, ranked slices
    sales.ts                What was sold and collected over a window
    finance.ts              Profit and loss: money in against money out
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
    api.ts                  Demo: actions in the browser; Supabase: the booking-link Edge Function
    screens.ts              Form, downpayment, thank-you and problem screens
  admin/
    main.ts                 Sign-in, hash routing, event dispatch, focus restore
    types.ts                DeskContext, view and drawer contracts
    auth.ts                 Roles, page access, permissions
    routes.ts, layout.ts    Navigation, shell, page header; the sidebar folds to icons
                            (remembered in localStorage) and carries the signed-in account,
                            which phones show in the top bar instead
    components/             drawer, booking-detail, booking-form, booking-link, booking-pdf,
                            event-form, expense-form, guest-summary, jump, badges, icons, toast
    views/                  login, dashboard, calendar, bookings, finances, packages, inbox, events, users
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
- Text boxes (`textarea`) cannot be resized by dragging; `base.css` sets `resize: none`.
- Headcount limits (pool slots per session, a unit's most guests, an exclusive rental's most guests)
  block the guest booking page only. The desk passes `overLimits: true` to `checkAvailability`, which
  then returns `ok` with an `over` note, and the form shows it with the quote's warnings as an amber
  "Saving anyway is fine" line. Clashes (closed dates, a unit already taken, exclusive overlaps) still block.
- Guest details from the registration template: complete address, email, SC/PWD count, a guest list
  (`booking.guestList`: name, gender, age, remarks), additional charges (`booking.extras`, typed
  amounts, part of the price) and payment details (`payment.sentAt`, `payment.senderName`).
- The guest list is optional everywhere: on the booking page (labelled "(optional)") and at the desk,
  any number of names (none, some, or more than the headcount) saves, and the counter reads
  "… named · optional" without the red. `core/guest-list.ts` holds
  the shared rules: `fitGuestList` keeps a row per guest, `namesAsked` caps that at
  `NAMES_ASKED_CAP` (20, so a 120-guest exclusive rental does not get 120 blank rows). Desk-side the list is part of `booking-form.ts`
  (new and edit; `updateBooking` takes an optional `guestList`) as well as its own section in the
  booking drawer. The Bookings list shows how many are named and carries per-row Edit and Sheet
  (PDF) buttons. Under 640px the table gives way to a day-grouped list of short rows
  (`mobileList` in `views/bookings.ts`) whose tap opens the drawer, and the filter pickers fold
  behind a Filters button (`filtersOpen`).
- The dashboard is deliberately one screen: four cards for today (Arriving today and In house open
  `components/guest-summary.ts` in the drawer; Collected today opens Finances; Balances due opens
  Bookings' list on today through `showBookingsOn`), Needs attention folded into one line, and a
  summary of sales beside income and expenses over one shared 7/30/90-day window. Every chart and
  list behind those figures lives on `views/finances.ts`.
- Sales analytics on the Finances page come from `core/sales.ts`: bookings are counted by `createdAt`
  (what was sold), payments by `receivedAt` (what came in), over 7, 30 or 90 days back from
  `meta.asOf`. `salesBetween(state, from, to)` does any window; `salesReport(state, days)` adds the
  trend bars, bucketed into weeks past 14 days. Clicking a bar re-cuts the section by running
  `salesBetween` over that bar alone. Sales group into five fixed `SalesGroup`s so the share charts
  never need a sixth colour; the five hues are `--cat-1`…`--cat-5` in `tokens.css`, checked as a set
  with the dataviz validator (all pairs, light surface). No permission gates the section.
- Expenses and profit and loss (`core/finance.ts`, section in `views/finances.ts`, form in
  `components/expense-form.ts`): `state.expenses` is what the resort spent, dated on the day the
  money went out. Five categories (payroll, utilities, supplies, upkeep, other) so the breakdown
  never needs a sixth colour. The section sets payments received against expenses over 7, 30 or 90
  days — both sides are cash, so a booking that is still owed for counts under Sales, not here. Its
  own range and pinned bar are separate from the sales ones; `financeBetween` re-cuts it to one bar
  the same way. `profitBefore` is null when the window before had no money moving at all, which
  reads as "nothing to compare with". The `expenses.manage` permission gates both recording and
  seeing the figures; owners and managers have it by default. An expense is the one day-to-day
  record staff can delete (behind a confirm step), because it can simply be typed in wrong.
- `core/period.ts` holds what the sales and finance figures share: `daysBetween`, `buckets` (a
  window's chart bars, one per day up to `DAILY_LIMIT` and one per week past it), `rankSlices` and
  the `Slice` shape. `trendChart` in `views/finances.ts` draws any two-series trend from those buckets,
  which is why both trends hover, read out and pin the same way.
- Views can export `hovers` beside `actions` and `inputs` (`ViewModule` in `admin/types.ts`), wired
  in `admin/main.ts` for mouseover/mouseout/focusin/focusout. It drives the read-out lines under the
  trend and the share charts. Handlers read `event.type` to tell arriving from leaving.
- `flag()` in `core/dom.ts` renders "true"/"false" for ARIA state attributes: a bare boolean renders
  as nothing in these templates, which would leave `aria-pressed=""`.
- Private events: `createEvent` and `bookEvent` in `core/actions.ts`, form in
  `admin/components/event-form.ts`. Stage decides whether a booking is written: `reserved`, `paid`
  and `done` take the date, `inquiry` and `ocular` do not. Event bookings skip `quote`/`schedule`
  (both throw on the `event` product) — `makeEventBooking` prices the package plus add-ons and takes
  its hours from `EventPackage.hours`. `blocksCalendar` is set only when the event is both exclusive
  and booked, and an event cannot close a day that already has active bookings.
- Bookings is one tab with a Calendar / List switch (`mode` in `views/bookings.ts`); the calendar
  side is `views/calendar.ts`, no longer a route of its own (an old `#/calendar` link lands on
  Bookings). The calendar opens on the month; Week is the only other view. Clicking a day opens it
  in place (`ui.openDay`) with a back button to the month or week it came from — it never switches
  the view. The month and year open a pop-up picker (`pickerDialog`): a year, its months (a month
  moves the calendar behind straight away) and that month's days. The list shares all of this: it
  shows the bookings in the calendar's month, week or open day under the same bar (`navBar`,
  `shownDays`), with a guest-name search in place of the old type / status / date filters, and no
  totals. `showBookingsOn(day)` opens it on one day, as the dashboard's Balances due card does.
- Motion (`components/motion.ts` + the Motion section at the end of `admin.css`): every render
  rebuilds the markup, so nothing animates by class alone. After each render `markEntering` adds
  `.page--enter` when the page is new, `.is-entering` to any `[data-enter="slot|key"]` whose key
  changed (with `data-motion` = on/back/in/out/swap choosing the direction), and `.is-entering` to a
  pop-up that was not open before. `[data-count-up]` figures count up when their page opens. The
  drawer slides out before it hides. `prefers-reduced-motion` turns all of it off.
- Finances (`views/finances.ts`, needs `expenses.manage`) is the month's books: a month bar like
  Bookings', three totals, one In-and-out chart (weekly; clicking a week narrows the page to it),
  the ledger table of every payment and expense (All / Income / Expenses, rows open the booking or
  the expense), then Where the money went (categories with bars) beside Still owed by guests for
  the month. `financeRange(state, from, to)` in `core/finance.ts` serves any stretch of days.
- Dropdowns and dates (`components/fields.ts`, `components/date-picker.ts`): every `select.input`
  and `input.input[type=date]` on the desk gets a button that opens a styled list or the shared date
  pop-up (the same `.picker` look as the Bookings calendar). The real control stays in the form,
  hidden, and receives the value plus input/change events, so views need no changes. A
  MutationObserver picks up new fields, side panels included. Date pickers open next to the button that
  opened them (`components/popover.ts` `placeNear`; the Bookings picker names its button with
  `data-anchor`), below it or above when there is no room, at a compact 292px. `data-optional` on a date or time input
  adds Clear. Time inputs open an hour / minute / AM-PM picker; text inputs with a `<datalist>` show
  their suggestions in the same list style, filtered as you type. Layout rules that place a field by
  `[name=…]` need a matching `[data-field-for=…]` rule for its button. The guest booking page keeps native pickers.
- Packages (`views/packages.ts`, `components/package-form.ts`, needs `packages.manage`, which
  owners have by default): every bookable thing — entrance sessions, rooms and cottages, exclusive
  rentals, event packages — as cards in four tabs, edited in the side panel, plus the shared
  promotions table. A package is on at most one promotion: `promo.appliesTo` lists its packages,
  `setPromo` in `core/actions.ts` takes a package off every other promotion first, and `normalize`
  in `core/store.ts` repairs older data by keeping the active one. Ticking a promotion is part of
  the package's form; editing a promotion saves at once because it changes every package on it.
  Deleting a package sets `retired: true` — `live()` in `core/rules.ts` keeps it out of every picker,
  the calendar, the guest page and new bookings, while old bookings still find its name. Delete is
  refused while upcoming bookings, open booking links, upcoming events or rooms (for an entrance)
  still use it. Event packages now take their promotion when an event is booked, like stays do.
  Supabase: the five catalog tables are written under `packages.manage` (not `users.manage`), have a
  `retired` column, no delete policy, and are in the realtime publication.
- An event saved at the Inquiry stage needs only its date (always filled in): name, contact and
  guests may be blank (`createEvent` names it "<contact> inquiry" or "Event inquiry", leaves
  `contactGuestId` empty, and cards say "guests not set"). Reserved and Paid still require them.
- Inquiries are edited in the same drawer (`createEventForm(eventId)`, `ctx.editEvent`): clicking an
  unbooked event card, its Edit button, or its row in the Inquiry stage summary opens it.
  `updateEvent` shares `eventProblem` / `eventFields` / `bookIfTaken` with `createEvent`, so changing
  the stage to Reserved or Paid there books it. Booked events refuse it and change through the booking.
- The Edit inquiry panel has Remove inquiry (asks first): `deleteEvent` deletes an unbooked event
  outright (database policy "inquiry remove" allows only `booking_id is null` with `events.manage`).
- The Inquiry column shows at most `INQUIRIES_SHOWN` (2) cards, then a "+N more · see all" button
  that opens the Inquiry stage summary, as its header does. Other columns show every card.
- The Events page has no Done column. An event that has happened (stage `done`, its booking checked
  out, or a booked date already past: `eventFinished`) leaves the page and lives on as its booking in
  Bookings (`pipelineEvents` in `core/rules.ts`). `checkOut` sets the event's stage to `done`.
- Events whose booking is cancelled drop off the Events page, its stage summaries, the calendar's event
  row and the dashboard (`liveEvents` in `core/rules.ts`). `cancelBooking` clears the event's
  `blocksCalendar` so the date opens again; `normalize` does the same for older data.
- Events has three stages on screen — Reserved, Paid, Done (Inquiry shows only when one waits).
  The ocular visit stage and date were dropped; `normalize` turns an old `ocular` event into an
  inquiry. Each stage is a dashboard-style card that opens `components/stage-summary.ts` in the
  side panel (events, guests, worth, paid, owed, then each event); a booked event card opens its
  booking from anywhere on it. `syncEventStage` in `core/actions.ts` moves an event to Paid when its
  booking's balance reaches zero (any payment or reprice) and back to Reserved if a balance returns.
- Alerts (`components/toast.ts`, `ctx.toast(message, tone)`): a card in the top right for every
  change (bottom right, beside the jump buttons), success by default, `info` for copies and downloads, `warning` for cancellations,
  removals and revoked access, `error` for anything that failed. They stack (four at most), drain
  a timer bar, pause on hover and close with ✕; errors stay longest.
- Drawers can put buttons in their header beside Close (`DrawerContent.tools`); a booking's Edit
  and Sheet live there.
- Pop-ups are `<dialog data-modal data-cancel="action">`. `admin/main.ts` opens each one as a modal
  after every render, runs the `data-cancel` action on Esc or a backdrop click, and gives focus back
  to the control with the same `data-focus-key` once a redraw has replaced it.
- The booking PDF is the guest registration sheet (companions template): details, guest list with
  signature column, charges, total / downpayment / overall amount, "Received by". Multi-page.
- Every booking needs a 50% downpayment (`depositRequired`, rounded up to the peso)
  before it is confirmed; less stays on hold. `applyPayment` in `core/actions.ts` enforces it.
- Editing (`updateBooking` in `core/actions.ts`, form `booking-form.ts` with `editId`): hold or
  confirmed bookings only (`isEditable`), not events. Re-checks availability excluding the
  booking itself, re-quotes, keeps payments, re-prices. An unchanged discount is kept as is, so a
  manager can edit a booking an owner discounted without a note.
- Manual discounts (`applyDiscount` / `removeDiscount`, rules in `core/rules.ts`): permission
  `discounts.apply` (both roles). The reason note is optional for everyone.
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
- Access follows the role alone (`permissionsFor` in `core/rules.ts`): owners have every permission,
  managers every one except `users.manage`, so only owners see the Users page. The Users page shows
  each account's role and a Change role select (not for yourself, so an owner always remains);
  there are no per-account permission ticks. `setUserRole` and `inviteUser` write the matching
  permissions, and `store.normalize()` resets saved permissions to the role's on load.
- Booking links are single use and expire; using one creates a hold for the staff member who sent it.

## Mock data

`data/mock-data.json` holds one week, **Sep 15–21 2026**, and the apps treat **Sep 17 2026** as today.
It also holds 31 expenses from Jul 24 to Sep 17 — the book starts where the payments do, so the
dashboard's windows compare like with like: the last 30 days show a profit, the last 7 a small loss
(payday landed in them) and the 90 days roughly break even.
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

## Supabase

The same build runs on Supabase when `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set at build time
(`scripts/build-site.mjs` writes `dist/assets/config.js`; the repo's `assets/config.js` says
`mock`). Setup and launch checklist: `DEPLOY.md`.

- Every action still mutates the in-memory state through `store.update()`. The Supabase backend
  diffs each collection against the last load or save (JSON per row) and inserts new rows, upserts
  changed ones and deletes removed ones, parents first. A refused save fires `onSaveError` (the
  desk toasts) and the store reloads from the server. Realtime pushes other desks' rows in.
- `expenses` is a day-to-day table like bookings and payments, with one extra policy: active staff
  may delete a row, since an expense can be typed in wrong. The desk still asks for
  `expenses.manage` first.
- Schema: `supabase/migrations/`. One table per collection, snake_case columns, nested values as
  jsonb, `meta` and `amenities` in `settings`. Postgres returns timestamps in UTC; `fromRow`
  rewrites them as `+08:00` because the app slices them as strings. `meta.asOf` is today in Manila.
- Sign-in (`admin/auth.ts`): Supabase Auth; `Staff.userId` links a login to its staff row.
  `my_staff_status()` is checked before loading, since an unlinked or suspended login reads nothing.
  Invites are redeemed by the `redeem-invite` Edge Function, which creates the login.
- RLS: active staff read everything and write day-to-day tables; `users.manage` is needed for
  staff, invites, catalog and settings. Anon gets nothing. Finer permissions are enforced by the UI.
- Guests: `book/api.ts` calls `supabase/functions/booking-link`, which runs the compiled core
  (`npm run build:functions` copies it) with the service role and returns bookings with personal
  fields blanked. `useBookingLink` keeps only guest fields (`guestBookingInput`) and re-checks them
  (`guestBookingProblem`, shared with the page); `retry: true` errors go back to the form.
- Roles are Owner and Manager. The Staff role was removed; `store.normalize()` loads any saved
  account with an unknown role as a Manager, and gives every account its role's permissions.
- Guests are matched on name and mobile (`findOrCreateGuest`), so two guests sharing a name keep
  their own details.
