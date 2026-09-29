-- V6M Desk schema. One table per collection in src/core/types.ts; column names
-- are the TypeScript field names in snake_case (src/core/tables.ts maps them).
-- Nested objects and arrays are jsonb. Money is numeric, dates are date,
-- timestamps are timestamptz, clock times ("08:00") are text.
--
-- Access: signed-in, active staff read everything and write day-to-day
-- records. Only accounts with the users.manage permission (the owner) change
-- accounts, invites, rates and settings. Guests have no login; the
-- booking-link and redeem-invite Edge Functions act for them with the
-- service role, which bypasses these policies.

-- ---------- Settings and catalog ----------

create table public.settings (
  key text primary key,          -- 'meta' and 'amenities'
  value jsonb not null
);

create table public.pool_sessions (
  id text primary key,
  label text not null,
  start text not null,
  "end" text not null,
  adult numeric(12, 2) not null,
  kid numeric(12, 2) not null,
  capacity integer not null,
  photo text,
  rates_to_confirm boolean not null default false,
  sort integer not null default 0
);

create table public.exclusive_packages (
  id text primary key,
  session text not null check (session in ('day', 'overnight')),
  use text not null check (use in ('full', 'partial', 'cottages')),
  name text not null,
  includes text not null,
  start text not null,
  "end" text not null,
  price numeric(12, 2) not null,
  max_guests integer not null,
  photo text,
  sort integer not null default 0
);

create table public.units (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('room', 'cottage')),
  capacity_min integer not null,
  capacity_max integer not null,
  price numeric(12, 2) not null,
  check_in text not null,
  check_out text not null,
  session text not null,
  adds_entrance boolean not null default true,
  inclusions jsonb not null default '[]',
  price_note text,
  photo text,
  sort integer not null default 0
);

create table public.promos (
  id text primary key,
  name text not null,
  percent numeric(5, 2) not null,
  valid_from date not null,
  valid_to date not null,
  weekdays jsonb not null default '[]',
  min_pax integer not null default 0,
  applies_to jsonb not null default '[]',
  active boolean not null default true,
  source text
);

create table public.event_packages (
  id text primary key,
  name text not null,
  price numeric(12, 2) not null,
  max_guests integer not null,
  exclusive boolean not null default false,
  hours text not null,
  inclusions jsonb not null default '[]',
  sort integer not null default 0
);

create table public.saved_replies (
  id text primary key,
  title text not null,
  body text not null,
  sort integer not null default 0
);

-- ---------- Accounts ----------

create table public.staff (
  id text primary key,
  name text not null,
  email text not null,
  role text not null check (role in ('owner', 'manager')),
  permissions jsonb not null default '[]',
  status text not null check (status in ('active', 'invited', 'suspended')),
  user_id uuid unique references auth.users (id) on delete set null
);
create unique index staff_email_key on public.staff (lower(email));

create table public.invites (
  code text primary key,
  staff_id text not null references public.staff (id) on delete cascade,
  created_by text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

-- ---------- Guests, bookings and money ----------

create table public.guests (
  id text primary key,
  name text not null,
  mobile text,
  address text,
  email text
);
create index guests_name_idx on public.guests (lower(name));

create table public.bookings (
  id text primary key,
  guest_id text not null references public.guests (id),
  guest_name text not null,
  product text not null,
  product_type text not null check (product_type in ('entrance', 'room', 'cottage', 'exclusive', 'event')),
  date date not null,
  nights integer not null default 0,
  session text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  adults integer not null default 0,
  kids integer not null default 0,
  pets jsonb,
  source text not null,
  status text not null check (status in ('hold', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
  pricing jsonb not null,
  total numeric(12, 2) not null,
  discount jsonb,
  sc_pwd integer not null default 0,
  extras jsonb not null default '[]',
  guest_list jsonb not null default '[]',
  deposit_required numeric(12, 2) not null,
  paid numeric(12, 2) not null default 0,
  balance numeric(12, 2) not null,
  id_verified boolean not null default false,
  event_id text,
  created_at timestamptz not null default now(),
  created_by text not null,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  notes text
);
create index bookings_date_idx on public.bookings (date);
create index bookings_guest_idx on public.bookings (guest_id);

create table public.payments (
  id text primary key,
  booking_id text not null references public.bookings (id) on delete cascade,
  amount numeric(12, 2) not null,
  method text not null check (method in ('cash', 'gcash', 'bank_transfer')),
  type text not null check (type in ('deposit', 'balance', 'full')),
  reference text,
  proof_attached boolean not null default false,
  received_at timestamptz not null default now(),
  received_by text,
  via text check (via in ('desk', 'qr')),
  sent_at timestamptz,
  sender_name text
);
create index payments_booking_idx on public.payments (booking_id);
-- A GCash reference can only pay once.
create unique index payments_qr_reference_key on public.payments (reference) where via = 'qr' and reference is not null;

create table public.events (
  id text primary key,
  title text not null,
  type text not null,
  date date not null,
  package_id text not null,
  package_price numeric(12, 2) not null,
  add_ons jsonb not null default '[]',
  total numeric(12, 2) not null,
  guests integer not null default 0,
  exclusive boolean not null default false,
  blocks_calendar boolean not null default false,
  stage text not null check (stage in ('inquiry', 'ocular', 'reserved', 'paid', 'done')),
  contact_guest_id text not null,
  coordinator_id text not null,
  ocular_date date,
  booking_id text,
  notes text
);

create table public.inquiries (
  id text primary key,
  channel text not null,
  guest_id text not null,
  "from" text not null,
  received_at timestamptz not null default now(),
  topic text not null,
  message text not null,
  status text not null check (status in ('new', 'replied', 'booked', 'lost')),
  assigned_to text,
  first_reply_minutes integer,
  related_booking_id text
);

create table public.booking_links (
  id text primary key,
  code text not null unique,
  created_by text not null,
  created_at timestamptz not null default now(),
  expires_at date not null,
  product text,
  date date,
  note text,
  status text not null check (status in ('sent', 'used', 'cancelled')),
  booking_id text,
  used_at timestamptz
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  staff_id text,
  action text not null,
  ref text not null,
  detail text
);
create index activity_log_at_idx on public.activity_log (at desc);

-- ---------- Who is asking ----------

-- security definer so the policies below can read staff without recursing into
-- staff's own policies.
create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and status = 'active');
$$;

create function public.has_permission(permission text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff
    where user_id = auth.uid() and status = 'active' and permissions ? permission
  );
$$;

-- The signed-in login's own account status ('active', 'invited', 'suspended'),
-- or null when it is not linked to a staff account. Sign-in reads this first,
-- because an unlinked login can read nothing else.
create function public.my_staff_status() returns text
language sql stable security definer set search_path = public as $$
  select status from staff where user_id = auth.uid();
$$;
revoke execute on function public.my_staff_status() from public, anon;
grant execute on function public.my_staff_status() to authenticated;

-- ---------- Row-level security ----------

do $$
declare
  t text;
begin
  -- Day-to-day records: any active staff member reads and writes them. The
  -- desk checks the finer permissions (payments.write, bookings.cancel…).
  foreach t in array array['guests', 'bookings', 'payments', 'events', 'inquiries', 'booking_links', 'activity_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "staff read" on public.%I for select to authenticated using (public.is_staff())', t);
    execute format('create policy "staff add" on public.%I for insert to authenticated with check (public.is_staff())', t);
    execute format('create policy "staff change" on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff())', t);
  end loop;

  -- Accounts, rates and settings: everyone reads, only users.manage writes.
  foreach t in array array['staff', 'invites', 'settings', 'pool_sessions', 'exclusive_packages', 'units', 'promos', 'event_packages', 'saved_replies'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "staff read" on public.%I for select to authenticated using (public.is_staff())', t);
    execute format('create policy "owner add" on public.%I for insert to authenticated with check (public.has_permission(''users.manage''))', t);
    execute format('create policy "owner change" on public.%I for update to authenticated using (public.has_permission(''users.manage'')) with check (public.has_permission(''users.manage''))', t);
    execute format('create policy "owner remove" on public.%I for delete to authenticated using (public.has_permission(''users.manage''))', t);
  end loop;
end $$;

-- Guests (no login) get nothing directly.
revoke all on all tables in schema public from anon;

-- ---------- Realtime: other desks see changes as they happen ----------

alter publication supabase_realtime add table
  public.staff, public.invites, public.guests, public.bookings, public.payments,
  public.events, public.inquiries, public.booking_links, public.activity_log;

-- ---------- First owner ----------

-- Run once from the SQL editor after creating the owner's login under
-- Authentication → Users:  select public.make_owner('owner@example.com', 'Owner Name');
create function public.make_owner(owner_email text, owner_name text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare
  auth_id uuid;
  new_id text;
begin
  select id into auth_id from auth.users where lower(email) = lower(owner_email);
  if auth_id is null then
    raise exception 'No login for %. Create it under Authentication → Users first.', owner_email;
  end if;

  select id into new_id from public.staff where lower(email) = lower(owner_email);
  if new_id is null then
    select 'ST-' || lpad((coalesce(max(nullif(regexp_replace(id, '\D', '', 'g'), '')::int), 0) + 1)::text, 2, '0')
      into new_id from public.staff;
  end if;

  insert into public.staff (id, name, email, role, permissions, status, user_id)
  values (
    new_id, owner_name, owner_email, 'owner',
    '["bookings.write","payments.write","bookings.cancel","inbox.write","events.manage","discounts.apply","users.manage"]',
    'active', auth_id
  )
  on conflict (id) do update
    set role = 'owner', permissions = excluded.permissions, status = 'active', user_id = excluded.user_id;
  return new_id;
end $$;

revoke execute on function public.make_owner(text, text) from public, anon, authenticated;
