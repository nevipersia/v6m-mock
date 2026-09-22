// Shapes of everything in data/mock-data.json, plus the booking page settings
// in data/booking-page.json. Dates are ISO strings (YYYY-MM-DD) and timestamps
// are ISO strings with a +08:00 offset (Asia/Manila).

export type ISODate = string;
export type Timestamp = string;

export type BookingStatus = 'hold' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
export type BookingSource = 'messenger' | 'instagram' | 'phone' | 'website' | 'walk_in' | 'booking_link';
export type PaymentMethod = 'cash' | 'gcash' | 'bank_transfer';
export type PaymentType = 'deposit' | 'balance' | 'full';
export type EventStage = 'inquiry' | 'ocular' | 'reserved' | 'paid' | 'done';
export type UnitKind = 'room' | 'cottage';
export type ProductType = 'entrance' | UnitKind | 'exclusive' | 'event';
export type InquiryStatus = 'new' | 'replied' | 'booked' | 'lost';
export type InquiryChannel = Extract<BookingSource, 'messenger' | 'instagram' | 'phone' | 'website'>;

export type Role = 'owner' | 'manager' | 'staff';
export type StaffStatus = 'active' | 'invited' | 'suspended';
export type Permission =
  | 'bookings.write'
  | 'payments.write'
  | 'bookings.cancel'
  | 'inbox.write'
  | 'events.manage'
  | 'discounts.apply'
  | 'users.manage';

export interface Meta {
  description: string;
  asOf: ISODate;
  period: { from: ISODate; to: ISODate };
  timezone: string;
  currency: string;
  seed: number;
  rules: string[];
}

export interface Staff {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
  status: StaffStatus;
  demo: boolean;
  /** Plain text because this is a mock; a real build would hash on a server. */
  password: string | null;
}

export interface Invite {
  code: string;
  staffId: string;
  createdBy: string;
  createdAt: Timestamp;
  usedAt: Timestamp | null;
}

export interface PoolSession {
  id: string;
  label: string;
  start: string;
  end: string;
  adult: number;
  kid: number;
  capacity: number;
  /** Photo in assets/img. */
  photo?: string;
  /** The owner has not confirmed these entrance rates yet. */
  ratesToConfirm?: boolean;
}

/** An exclusive rental from the brochure: while it is booked, nobody else is. */
export interface ExclusivePackage {
  id: string;
  session: 'day' | 'overnight';
  use: 'full' | 'partial' | 'cottages';
  name: string;
  includes: string;
  start: string;
  end: string;
  price: number;
  maxGuests: number;
  photo?: string;
}

export interface Unit {
  id: string;
  name: string;
  kind: UnitKind;
  capacityMin: number;
  capacityMax: number;
  price: number;
  checkIn: string;
  checkOut: string;
  session: string;
  addsEntrance: boolean;
  inclusions: string[];
  priceNote?: string;
  photo?: string | null;
}

export interface Promo {
  id: string;
  name: string;
  percent: number;
  validFrom: ISODate;
  validTo: ISODate;
  weekdays: number[];
  minPax: number;
  appliesTo: string[];
  active: boolean;
  source: string;
}

export interface EventPackage {
  id: string;
  name: string;
  price: number;
  maxGuests: number;
  exclusive: boolean;
  hours: string;
  inclusions: string[];
}

export interface SavedReply {
  id: string;
  title: string;
  body: string;
}

export interface Guest {
  id: string;
  name: string;
  mobile: string | null;
  address?: string | null;
  email?: string | null;
}

/** One person on the guest list (the companions sheet signed at the gate). */
export interface Companion {
  name: string;
  gender: 'Female' | 'Male' | '';
  age: number | null;
  remarks: string;
}

/** An additional charge from the registration sheet: videoke, corkage, extra cottage… */
export interface ExtraCharge {
  label: string;
  amount: number;
}

export interface PriceLine {
  label: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface Pricing {
  lines: PriceLine[];
  subtotal: number;
  promoId: string | null;
  discount: number;
  total: number;
}

export interface Pets {
  count: number;
  type: string;
  rulesAcknowledged: boolean;
}

export type DiscountKind = 'amount' | 'percent';

/** A discount a staff member gave by hand, on top of any promo already in the pricing. */
export interface ManualDiscount {
  kind: DiscountKind;
  /** Pesos for 'amount', 1-100 for 'percent'. */
  value: number;
  /** Pesos taken off the total. */
  amount: number;
  /** Why it was given. Required for everyone except owners. */
  note: string | null;
  by: string;
  at: Timestamp;
}

export interface Booking {
  id: string;
  guestId: string;
  guestName: string;
  /** A pool session id, a unit id, or 'event'. */
  product: string;
  productType: ProductType;
  date: ISODate;
  nights: number;
  session: string;
  startsAt: Timestamp;
  endsAt: Timestamp;
  adults: number;
  kids: number;
  pets: Pets | null;
  source: BookingSource;
  status: BookingStatus;
  /** List price after any promo. */
  pricing: Pricing;
  /** What the guest pays: pricing.total minus any manual discount. */
  total: number;
  discount?: ManualDiscount | null;
  /** Senior citizens and PWDs in the group. */
  scPwd?: number;
  extras?: ExtraCharge[];
  guestList?: Companion[];
  depositRequired: number;
  paid: number;
  balance: number;
  idVerified: boolean;
  eventId: string | null;
  createdAt: Timestamp;
  createdBy: string;
  checkedInAt: Timestamp | null;
  checkedOutAt: Timestamp | null;
  cancelledAt: Timestamp | null;
  cancelReason: string | null;
  notes: string | null;
}

export interface Payment {
  id: string;
  bookingId: string;
  amount: number;
  method: PaymentMethod;
  type: PaymentType;
  reference: string | null;
  proofAttached: boolean;
  receivedAt: Timestamp;
  receivedBy: string | null;
  /** 'qr' when the guest paid by scanning the payment QR and the reference was verified. */
  via?: 'desk' | 'qr';
  /** When the guest says they sent it (the "Time sent" on their receipt). */
  sentAt?: Timestamp | null;
  /** Name on the GCash account that sent it. */
  senderName?: string | null;
}

export interface ResortEvent {
  id: string;
  title: string;
  type: string;
  date: ISODate;
  packageId: string;
  packagePrice: number;
  addOns: { item: string; amount: number }[];
  total: number;
  guests: number;
  exclusive: boolean;
  blocksCalendar: boolean;
  stage: EventStage;
  contactGuestId: string;
  coordinatorId: string;
  ocularDate: ISODate;
  bookingId: string | null;
  notes: string | null;
}

export interface Inquiry {
  id: string;
  channel: InquiryChannel;
  guestId: string;
  from: string;
  receivedAt: Timestamp;
  topic: string;
  message: string;
  status: InquiryStatus;
  assignedTo: string | null;
  firstReplyMinutes: number | null;
  relatedBookingId: string | null;
}

export type BookingLinkStatus = 'sent' | 'used' | 'cancelled';

export interface BookingLink {
  id: string;
  code: string;
  createdBy: string;
  createdAt: Timestamp;
  expiresAt: ISODate;
  product: string | null;
  date: ISODate | null;
  note: string | null;
  status: BookingLinkStatus;
  bookingId: string | null;
  usedAt?: Timestamp;
}

export interface ActivityEntry {
  at: Timestamp;
  staffId: string | null;
  action: string;
  ref: string;
  detail: string | null;
}

export interface State {
  meta: Meta;
  staff: Staff[];
  invites: Invite[];
  poolSessions: PoolSession[];
  exclusivePackages: ExclusivePackage[];
  amenities: string[];
  units: Unit[];
  promos: Promo[];
  eventPackages: EventPackage[];
  savedReplies: SavedReply[];
  guests: Guest[];
  bookings: Booking[];
  payments: Payment[];
  events: ResortEvent[];
  inquiries: Inquiry[];
  bookingLinks: BookingLink[];
  activityLog: ActivityEntry[];
}

// ---------- Booking page settings (data/booking-page.json) ----------

export interface BookingPageCopy {
  eyebrow: string;
  title: string;
  intro: string;
  nameLabel: string;
  mobileLabel: string;
  productLabel: string;
  addressLabel: string;
  emailLabel: string;
  guestListLabel: string;
  notesLabel: string;
  notesPlaceholder: string;
  submitLabel: string;
  paymentNote: string;
  payTitle: string;
  payIntro: string;
  payHelp: string;
  thanksScript: string;
  thanksText: string;
  doneNote: string;
  problemHelp: string;
}

export interface BookingPageSettings {
  copy: BookingPageCopy;
  theme: {
    /** Buttons, links and the script eyebrow. */
    accent: string;
    /** Page background behind the card. */
    background: string;
  };
  fields: {
    notes: boolean;
    kids: boolean;
    priceEstimate: boolean;
    email: boolean;
    guestList: boolean;
  };
  /** Bulleted reminders under the form. Empty hides the block. */
  houseRules: string[];
  /** Product ids a guest may pick. Empty means everything that is bookable. */
  products: string[];
}
