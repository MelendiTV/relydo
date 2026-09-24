-- Review before applying. Stop Change Order preparation/confirmation first.
-- This rollback removes ONLY functions/indexes/columns added by stage 1.
-- It refuses to discard any reservation or verified Stripe evidence.
begin;
lock table public.service_requests in access exclusive mode;
do $$ begin
  if to_regclass('public.co_stage2_function_backup') is not null
    or to_regprocedure('public.co_guard_job_lifecycle()') is not null then
    raise exception 'ROLLBACK_BLOCKED: reverse stage 2 before stage 1';
  end if;
end $$;
lock table public.change_orders in access exclusive mode;
do $$ begin
  if exists (select 1 from public.change_orders where payment_reservation_id is not null
    or stripe_payment_verified_at is not null or stripe_payment_evidence is not null) then
    raise exception 'ROLLBACK_BLOCKED: preserve payment evidence; use a reviewed forward migration';
  end if;
end $$;
drop function public.confirm_change_order_payment(uuid,jsonb);
drop function public.attach_change_order_payment(uuid,uuid,uuid,text,text);
drop function public.reserve_change_order_payment(uuid,uuid,text,jsonb);
drop index public.co_payment_intent_unique;
drop index public.co_payment_reservation_unique;
alter table public.change_orders drop constraint co_payment_reservation_complete;
alter table public.change_orders
  drop column payment_reservation_id,
  drop column payment_reservation_flow,
  drop column payment_reservation_created_at,
  drop column payment_reservation_payload,
  drop column stripe_payment_verified_at,
  drop column stripe_payment_evidence;
commit;
