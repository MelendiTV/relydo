-- One BASE payment per offer, including refunded/cancelled payments.
-- Reassignments can retain multiple offers/payments for one request.
-- Change Orders are stored in public.change_orders, not public.payments.
-- Run only after inspecting the target schema/data. No automatic deduplication.
begin;
set local lock_timeout = '5s';
-- Prevent writes between the duplicate audit and index creation; reads remain available.
lock table public.payments in share row exclusive mode;
do $$
begin
  if exists (
    select 1 from public.payments
    where offer_id is not null
    group by offer_id having count(*) > 1
  ) then
    raise exception 'BASE_PAYMENT_DUPLICATE_OFFERS: reconcile existing payments before retrying; no rows have been changed'
      using errcode = '23505';
  end if;
end $$;
-- PostgreSQL preserves historical rows with NULL offer_id. Current BASE writers
-- require an offer_id; this index guarantees uniqueness for every non-NULL offer.
create unique index payments_base_offer_unique on public.payments (offer_id);
commit;
