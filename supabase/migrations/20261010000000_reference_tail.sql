-- Staff may confirm a GCash receipt with only the last 4 digits of its
-- reference, kept as "…1234". Different payments can share those, so only a
-- full 13-digit reference has to be unique.
drop index if exists public.payments_qr_reference_key;
create unique index payments_qr_reference_key on public.payments (reference)
  where via = 'qr' and reference is not null and length(regexp_replace(reference, '\D', '', 'g')) = 13;
