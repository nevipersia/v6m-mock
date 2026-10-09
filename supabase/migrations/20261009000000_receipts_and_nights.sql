-- A guest's GCash receipt is sent without a reference number (staff may add
-- one when they confirm it), and every booking is at least one night.
alter table public.payment_checks alter column reference drop not null;
alter table public.bookings alter column nights set default 1;
update public.bookings set nights = 1 where nights < 1;
