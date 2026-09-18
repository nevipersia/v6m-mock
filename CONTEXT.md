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

And this repo — a working prototype of two apps sharing one data file:

- **Guest website** (`/`): hero, rate checker with live availability, promo banner, week availability
  grid, rooms and cottages, pool rates, event packages, FAQs, inquiry form.
- **V6M Desk** (`/admin/`): mock staff app — sign-in, Today, Calendar, Bookings, Inbox, Events,
  Housekeeping, plus a booking drawer.

Static files, no build step, ES modules. Run it with `npm start`, then http://localhost:4789 and
http://localhost:4789/admin/. Opening the HTML directly does not work because the browser blocks
reading `data/mock-data.json`.

## Project structure

```
index.html                  Guest website markup
admin/index.html            V6M Desk shell
data/mock-data.json         Sample data
assets/
  img/                      logo.svg, hero.svg
  css/
    tokens.css              Brand colors, fonts, radii (shared)
    base.css                Reset, buttons, fields, pills (shared)
    site.css                Website layout
    admin.css               V6M Desk layout
  js/
    core/                   Shared by both apps
      store.js              Loads JSON, saves changes to localStorage, syncs tabs
      rules.js              Availability, pricing, lookups, labels
      actions.js            Every state change
      format.js             Pesos, dates, times, PH mobile check
      dom.js                html`` templating (escapes by default) + event delegation
    site/                   One module per website section
    admin/
      main.js               Sign-in, hash routing, event dispatch, focus restore
      auth.js               Roles, page access, permissions
      routes.js, layout.js  Navigation, shell, page header
      components/           drawer, booking-detail, booking-form, badges, icons, toast
      views/                today, calendar, bookings, inbox, events, housekeeping, login
```

## Conventions to follow

- Views export `render(ctx)` and optional `actions` / `inputs` objects. `main.js` dispatches clicks on
  `[data-action]`, submits on `form[data-submit]` and input on `[data-input]`. Drawer content objects
  use the same shape plus `live` (re-render when the store changes) and a `title`.
- `ctx` carries `state`, `staff`, `can(permission)`, `canView(page)`, `toast()`, `redraw()`,
  `openBooking(id)`, `newBooking(prefill)`.
- All mutations go through `core/actions.js` → `store.update()`, which saves and notifies subscribers.
- Never build markup by string concatenation; use the `html` tag so values are escaped.
- Sentence case, no emoji in UI chrome, plain error text, mobile-first (bottom tab bar under 900px).

## Business rules encoded

- One booking per unit per night. An exclusive event that is reserved, paid or done closes the whole
  resort that day.
- Each pool session caps at 120 guests — a placeholder until the owner confirms.
- Rooms and cottages add per-head overnight entrance; the Airbnb villa does not.
- A booking stays "on hold" until a payment is recorded, then becomes confirmed.
- Deposits: 50% rooms, cottages and overnight; 30% day tours; 40% events; Airbnb paid in full.
- Check-in needs a valid-ID tick and collects any balance. Check-out sends the unit to cleaning.

## Mock data

`data/mock-data.json` holds one week, **Sep 15–21 2026**, and the apps treat **Sep 17 2026** as today.
It contains 42 bookings, 42 payments, 47 guests, 40 inquiries, one event (Cruz 18th debut on Sep 21,
reserved, ₱48,000, closes the resort), housekeeping, saved replies, an activity log and 5 staff.

Staff accounts for the mock sign-in (no passwords):

| Account | Role | Access |
| --- | --- | --- |
| Liza Manalo | owner | Everything, including cancellations |
| Joy Dimaculangan, Mark Katigbak | front_desk | Everything except cancellations |
| Nene Recto | housekeeping | Housekeeping only |
| Paolo Mercado | events | Events, calendar, inbox, today |

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
3. Required deposit percentage, and the cancellation or rebooking policy?
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
