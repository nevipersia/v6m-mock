// Adds a believable trading history to data/mock-data.json for demos: June
// to mid-September of finished, fully paid stays (downpayment ahead, balance
// at check-in), the resort's running costs over the same months, a fuller
// calendar for the weeks ahead, and a few guests arriving or in house today.
//
// It drives the app's own actions (createBooking, recordPayment, checkIn,
// checkOut, recordExpense) against the compiled core, with the demo date and
// the clock set to each moment in turn, so prices, ids, guests and the
// activity log come out exactly as the app makes them. Availability is
// checked with the app's rules before every booking, so nothing double-books
// a unit, overfills a pool session or lands on a closed day.
//
// Run once after `tsc`: `node scripts/add-demo-history.mjs`. It refuses to
// run twice on the same file (meta.history), and is seeded, so it always
// writes the same data. It changes meta.seed, which makes browsers drop any
// saved demo state.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const FILE = 'data/mock-data.json';
const load = (path) => import(pathToFileURL(`assets/js/${path}`).href);

const raw = JSON.parse(readFileSync(FILE, 'utf8'));
if (raw.meta.history) {
  console.error('The demo history is already in data/mock-data.json.');
  process.exit(1);
}

const { createStaticBackend } = await load('core/backend.js');
const store = await load('core/store.js');
const actions = await load('core/actions.js');
const rules = await load('core/rules.js');
const { addDays } = await load('core/format.js');

const TODAY = raw.meta.asOf;
const HISTORY_FROM = '2026-06-01';
/** The week already in the file starts here; history fills the days before it. */
const HISTORY_TO = addDays(raw.meta.period.from, -1);
const AHEAD_TO = addDays(TODAY, 33);
const OWNER = 'ST-01';
const MANAGER = 'ST-02';

// ---------- A seeded random source, so every run writes the same data ----------

let seed = 20261006;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const between = (low, high) => low + Math.floor(random() * (high - low + 1));
const chance = (share) => random() < share;
const pick = (list) => list[Math.floor(random() * list.length)];
const weighted = (pairs) => {
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of pairs) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return pairs[0][0];
};

// ---------- The clock: actions stamp "now" from the demo date and the time of day ----------

const RealDate = Date;
let clock = { h: 9, m: 0 };
globalThis.Date = class extends RealDate {
  constructor(...args) {
    if (args.length) super(...args);
    else {
      super();
      this.setHours(clock.h, clock.m, 0, 0);
    }
  }
  static now() { return new globalThis.Date().getTime(); }
};
/** Makes "now" this day at this time, for the actions that follow. */
function at(state, day, h, m = 0) {
  state.meta.asOf = day;
  clock = { h: Math.min(23, h), m: Math.min(59, m) };
}

// ---------- Guests ----------

const FIRST = ['Maria', 'Jose', 'Ana', 'Mark', 'Kristine', 'John', 'Angelica', 'Paolo', 'Camille', 'Rico', 'Jerome', 'Patricia',
  'Miguel', 'Lea', 'Carlo', 'Bea', 'Joshua', 'Trisha', 'Nico', 'Hazel', 'Ramon', 'Lovely', 'Kevin', 'Joy', 'Arvin', 'Kath',
  'Dennis', 'Mae', 'Vince', 'Liza', 'Rachelle', 'Gerald', 'Jasmine', 'Allan', 'Grace', 'Edgar', 'Shiela', 'Ronald', 'Cherry', 'Marvin'];
const LAST = ['Reyes', 'Santos', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Ramos', 'Castillo', 'Aguilar', 'Villanueva', 'Torres',
  'Marasigan', 'Lontoc', 'Perez', 'Dela Cruz', 'Navarro', 'Ocampo', 'Tolentino', 'Arellano', 'Pascual', 'Hernandez', 'Magpantay',
  'Salazar', 'De Leon', 'Dimaculangan', 'Macaraig', 'Panganiban', 'Umali', 'Katigbak', 'Recto'];
const PLACES = ['Lipa City, Batangas', 'Batangas City', 'Tanauan City, Batangas', 'Sto. Tomas, Batangas', 'Malvar, Batangas',
  'San Jose, Batangas', 'Calamba, Laguna', 'San Pablo City, Laguna', 'Sta. Rosa, Laguna', 'Lucena City, Quezon', 'Muntinlupa City',
  'Las Piñas City', 'Imus, Cavite', 'Dasmariñas, Cavite'];
const mobile = () => `0900 ${between(100, 999)} ${between(1000, 9999)}`;
const address = () => `${pick(['Purok', 'Blk', 'Zone'])} ${between(1, 12)}${chance(0.4) ? ` Lot ${between(1, 40)}` : ''}, ${pick(PLACES)}`;

function newGuest(state) {
  // About a quarter are returning guests.
  if (chance(0.25) && state.guests.length) {
    const guest = pick(state.guests);
    return { guestName: guest.name, mobile: guest.mobile ?? mobile(), address: guest.address ?? address(), email: guest.email ?? '' };
  }
  const first = pick(FIRST);
  const last = pick(LAST);
  const email = chance(0.45) ? `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com' : '';
  return { guestName: `${first} ${last}`, mobile: mobile(), address: address(), email };
}

// ---------- What gets booked ----------

const SOURCES = [['messenger', 34], ['phone', 18], ['instagram', 14], ['walk_in', 22], ['website', 12]];
const METHODS_AHEAD = [['gcash', 60], ['bank_transfer', 18], ['cash', 22]];
const NOTES = ['Birthday celebration', 'Family reunion', 'Company outing', 'Senior citizen in group', 'Arriving late',
  'Bringing a cake', 'Will bring own food', 'Barkada trip', 'Graduation celebration', 'Baptismal celebration'];

/** A headcount that suits the product: groups for entrance, the unit's range for rooms and cottages. */
function headcount(state, product) {
  const unit = rules.findUnit(state, product);
  const pkg = rules.findExclusive(state, product);
  if (pkg) return { adults: between(25, Math.min(60, pkg.maxGuests - 10)), kids: between(4, 12) };
  if (unit) {
    const most = rules.hasGuestLimit(unit) ? unit.capacityMax : unit.kind === 'room' && unit.capacityMax <= 2 ? 3 : 6;
    const least = Math.max(1, unit.capacityMin);
    const total = between(least, Math.max(least, most));
    const kids = unit.kind === 'cottage' ? between(0, Math.floor(total / 3)) : between(0, 1);
    return { adults: Math.max(1, total - kids), kids: Math.min(kids, total - 1) };
  }
  return { adults: between(3, 18), kids: between(0, 7) };
}

function productFor(day, weekend) {
  return weekend
    ? weighted([['daytour', 30], ['nighttour', 8], ['overnight', 14], ['cottageA', 8], ['cottageB', 9], ['cottageC', 10], ['suite', 9], ['deluxe', 8]])
    : weighted([['daytour', 34], ['nighttour', 8], ['overnight', 10], ['cottageC', 8], ['cottageB', 6], ['suite', 9], ['deluxe', 10]]);
}

/** Session times for check-in and check-out stamps. */
function hoursOf(state, product) {
  const pkg = rules.findExclusive(state, product);
  if (pkg) return { start: pkg.start, end: pkg.end };
  const unit = rules.findUnit(state, product);
  if (unit) return { start: unit.checkIn, end: unit.checkOut };
  const session = rules.findSession(state, product);
  return { start: session.start, end: session.end };
}
const hm = (time) => time.split(':').map(Number);

const reference = () => `${between(1000, 9999)} ${between(100, 999)} ${between(100000, 999999)}`;

function payment(method, amount, guestName) {
  if (method === 'cash') return { amount, method };
  return { amount, method, reference: reference(), senderName: guestName };
}

// ---------- Build ----------

store.useBackend(createStaticBackend(structuredClone(raw)));
const state = await store.loadStore();
const made = { past: 0, ahead: 0, today: 0, exclusive: 0, expenses: 0 };

/** Tries to book; returns the booking, or null if the day can't take it. */
function book(day, product, { createdOn, createdAt = [between(8, 19), between(0, 59)], source, deposit = 'downpayment', depositMethod }) {
  const s = store.requireState();
  const people = headcount(s, product);
  const request = { product, date: day, ...people };
  if (!rules.checkAvailability(s, request).ok) return null;
  const guest = newGuest(s);
  const extras = [];
  if (rules.findUnit(s, product)?.kind === 'cottage' || rules.findExclusive(s, product)) {
    if (chance(0.3)) extras.push({ label: 'Videoke', amount: 500 });
    if (chance(0.15)) extras.push({ label: 'Corkage', amount: 300 });
  }
  const total = rules.quote(s, { ...request, extras }).total;
  const required = rules.depositRequired(s, product, total);
  const method = depositMethod ?? weighted(METHODS_AHEAD);
  const amount = deposit === 'full' ? total : deposit === 'none' ? 0 : chance(0.15) ? total : required;
  at(s, createdOn, createdAt[0], createdAt[1]);
  const booking = actions.createBooking({
    ...guest, ...request, extras, source, deposit: amount, method,
    reference: method === 'cash' ? '' : reference(), senderName: method === 'cash' ? '' : guest.guestName,
    scPwd: chance(0.2) ? between(1, Math.min(3, people.adults)) : 0,
    notes: chance(0.35) ? pick(NOTES) : '',
  }, chance(0.6) ? MANAGER : OWNER);
  return booking;
}

/** Arrives, settles the balance, and (for a past day) leaves. */
function stay(booking, { leave = true } = {}) {
  const s = store.requireState();
  const { start, end } = hoursOf(s, booking.product);
  const [sh, sm] = hm(start);
  const late = between(0, 45);
  at(s, booking.date, sh + Math.floor((sm + late) / 60), (sm + late) % 60);
  actions.checkIn(booking.id, { method: weighted([['cash', 70], ['gcash', 25], ['bank_transfer', 5]]) }, chance(0.6) ? MANAGER : OWNER);
  if (!leave) return;
  const [eh, em] = hm(end);
  const leaveDay = booking.endsAt.slice(0, 10);
  at(s, leaveDay, eh, Math.max(0, em - between(0, 20)));
  actions.checkOut(booking.id, chance(0.6) ? MANAGER : OWNER);
}

/** A booking made ahead: lead time, downpayment then, and sometimes the rest a few days before. */
function aheadBooking(day, product, { latestCreate = TODAY } = {}) {
  const lead = between(2, 24);
  let createdOn = addDays(day, -lead);
  if (createdOn > latestCreate) createdOn = addDays(latestCreate, -between(0, 3));
  if (createdOn < '2026-05-15') createdOn = '2026-05-15';
  const source = weighted(SOURCES.filter(([name]) => name !== 'walk_in'));
  return book(day, product, { createdOn, source });
}

// 1. History: June to the day before the file's own week, all finished and paid.
for (let day = HISTORY_FROM; day <= HISTORY_TO; day = addDays(day, 1)) {
  const weekday = new RealDate(`${day}T12:00:00`).getDay();
  const weekend = weekday === 0 || weekday === 6;
  // An exclusive rental now and then on a weekend, booked first so the day is free for it.
  if (weekend && chance(0.1)) {
    const pkg = pick(state.exclusivePackages.filter((item) => item.active !== false));
    const booking = aheadBooking(day, pkg.id, { latestCreate: addDays(day, -10) });
    if (booking) {
      stay(booking);
      made.past += 1;
      made.exclusive += 1;
      continue;
    }
  }
  const count = weekend ? between(3, 5) : between(0, 2);
  for (let i = 0; i < count; i += 1) {
    const product = productFor(day, weekend);
    const walkIn = chance(rules.findUnit(state, product) ? 0.08 : 0.3);
    const booking = walkIn
      ? book(day, product, { createdOn: day, createdAt: [7, between(30, 59)], source: 'walk_in', deposit: 'none' })
      : aheadBooking(day, product, { latestCreate: addDays(day, -1) });
    if (!booking) continue;
    stay(booking);
    made.past += 1;
  }
}

// 2. Today: two groups already in, two more due later.
for (const [product, inHouse] of [['daytour', true], ['cottageC', true], ['nighttour', false], ['overnight', false]]) {
  const booking = aheadBooking(TODAY, product, { latestCreate: addDays(TODAY, -2) });
  if (!booking) continue;
  if (inHouse) stay(booking, { leave: false });
  made.today += 1;
}

// 3. The weeks ahead: downpayments in, a few still on hold.
for (let day = addDays(TODAY, 1); day <= AHEAD_TO; day = addDays(day, 1)) {
  const weekday = new RealDate(`${day}T12:00:00`).getDay();
  const weekend = weekday === 0 || weekday === 6;
  const count = weekend ? between(2, 4) : between(0, 1);
  for (let i = 0; i < count; i += 1) {
    const product = productFor(day, weekend);
    const createdOn = addDays(TODAY, -between(0, 12));
    const s = store.requireState();
    const booking = book(day, product, {
      createdOn, source: weighted(SOURCES.filter(([name]) => name !== 'walk_in')),
      deposit: chance(0.2) ? 'none' : 'downpayment',
    });
    if (booking) made.ahead += 1;
    void s;
  }
}

// 4. Running costs from June until the file's own expenses begin.
const firstExpense = raw.expenses.map((expense) => expense.date).sort()[0] ?? TODAY;
function spend(date, category, item, amount, method, vendor = '') {
  if (date >= firstExpense) return;
  at(state, date, between(7, 17), between(0, 59));
  const result = actions.recordExpense({ date, category, item, amount, method, vendor, note: '' }, MANAGER);
  if (result.error) throw new Error(`${date} ${item}: ${result.error}`);
  made.expenses += 1;
}
for (let day = HISTORY_FROM; day < firstExpense; day = addDays(day, 1)) {
  const date = new RealDate(`${day}T12:00:00`);
  const dom = date.getDate();
  const last = new RealDate(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  if (dom === 15 || dom === last) spend(day, 'payroll', 'Staff wages', dom === 15 ? 6800 : 7200, 'cash');
  if (dom === last) spend(day, 'other', 'Bank charges', 120, 'bank_transfer');
  if (dom === 8) spend(day, 'utilities', 'Meralco bill', between(76, 86) * 100 + between(0, 9) * 10, 'gcash', 'Meralco');
  if (dom === 9) spend(day, 'utilities', 'Water bill', between(14, 16) * 100 + between(0, 9) * 10, 'gcash', 'Lipa Water District');
  if (dom === 10) spend(day, 'utilities', 'Internet', 2499, 'bank_transfer', 'PLDT');
  if (dom % 11 === 6) spend(day, 'supplies', 'Chlorine and pool chemicals', 1780, 'cash', 'Aqua Chem Lipa');
  if (dom % 10 === 3) spend(day, 'supplies', 'Kitchen stock', between(17, 19) * 100 + between(0, 9) * 10, 'cash', 'Public market');
  if (dom === 12) spend(day, 'supplies', 'Cleaning supplies', between(85, 95) * 10, 'cash');
  if (dom === 27) spend(day, 'upkeep', 'Grass cutting', 700, 'cash');
  if (dom === 20) spend(day, 'utilities', 'LPG tank', 1200, 'cash');
  if (day === '2026-06-18') spend(day, 'upkeep', 'Repainting the kubo cottages', 4200, 'cash', 'Batangas Paint Center');
  if (day === '2026-07-04') spend(day, 'other', 'Business permit renewal', 2500, 'cash', 'Lipa City Hall');
}

// ---------- Save ----------

const out = store.requireState();
out.meta.asOf = TODAY;
out.meta.seed = 20261006;
out.meta.history = { from: HISTORY_FROM, addedBy: 'scripts/add-demo-history.mjs' };
// Newest first, as the app keeps them.
out.activityLog.sort((a, b) => b.at.localeCompare(a.at));
writeFileSync(FILE, `${JSON.stringify(out, null, 2)}\n`);
console.log(made, { bookings: out.bookings.length, payments: out.payments.length, guests: out.guests.length, expenses: out.expenses.length });
