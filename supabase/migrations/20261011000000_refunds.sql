-- Money given back (a long stay left early) is kept as a payment of type
-- 'refund' with a negative amount, so the books and the balance stay right.
alter table public.payments drop constraint if exists payments_type_check;
alter table public.payments add constraint payments_type_check check (type in ('deposit', 'balance', 'full', 'refund'));
