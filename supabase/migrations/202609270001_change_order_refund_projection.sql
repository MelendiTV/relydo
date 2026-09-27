-- Additive proposal; no historical backfill or resolution state changes.
-- payment_status and paid_at continue to attest the original customer funding.
begin;
alter table public.change_orders
  add column refunded_amount numeric(12,2) not null default 0,
  add column stripe_refund_id text,
  add column refunded_at timestamptz,
  add constraint change_order_refund_projection_complete check (
    (refunded_amount=0 and stripe_refund_id is null and refunded_at is null) or
    (refunded_amount>0 and stripe_refund_id is not null and refunded_at is not null)
  );

-- Only an exact durable refund receipt can introduce a refund projection.
create function public.co_guard_refund_projection() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and
    (new.refunded_amount,new.stripe_refund_id,new.refunded_at) is not distinct from
    (old.refunded_amount,old.stripe_refund_id,old.refunded_at) then return new; end if;
  if tg_op='INSERT' and new.refunded_amount=0 and new.stripe_refund_id is null and new.refunded_at is null then return new; end if;
  if tg_op='UPDATE' and old.stripe_refund_id is not null then raise exception 'CHANGE_ORDER_REFUND_IMMUTABLE'; end if;
  if not exists (
    select 1 from public.job_financial_steps s
    join public.job_financial_resolutions r on r.request_id=s.request_id
    cross join lateral jsonb_array_elements(r.plan) e
    where s.request_id=new.request_id and s.kind='refund'
      and s.charge_id=e->>'chargeId' and s.params=e->'params' and e->>'kind'='refund'
      and e#>>'{source,changeOrderId}'=new.id::text
      and e#>>'{source,paymentIntentId}'=new.stripe_payment_intent_id
      and public.financial_receipt_matches(e,s.receipt)
      and s.receipt->>'id'=new.stripe_refund_id
      and (s.receipt->>'amount')::numeric=new.refunded_amount*100
      and s.confirmed_at=new.refunded_at
  ) then raise exception 'CHANGE_ORDER_REFUND_RECEIPT_REQUIRED'; end if;
  return new;
end $$;
create trigger co_guard_refund_projection before insert or update on public.change_orders
for each row execute function public.co_guard_refund_projection();

-- Runs inside record_job_financial_step: receipt and projection commit together.
-- Covers refund_customer and partial without changing their immutable plans.
create function public.co_project_refund_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
declare e jsonb; c public.change_orders%rowtype;
begin
  if new.kind<>'refund' or new.receipt is null or new.receipt#>>'{source,changeOrderId}' is null then return new; end if;
  select value into e from public.job_financial_resolutions r,
    lateral jsonb_array_elements(r.plan)
    where r.request_id=new.request_id and value->>'kind'=new.kind
      and value->>'chargeId'=new.charge_id and value->'params'=new.params;
  if e is null or new.confirmed_at is null or not public.financial_receipt_matches(e,new.receipt)
    then raise exception 'CHANGE_ORDER_REFUND_RECEIPT_REQUIRED'; end if;
  select * into c from public.change_orders
    where id::text=e#>>'{source,changeOrderId}' and request_id=new.request_id for update nowait;
  if not found or c.payment_status is distinct from 'paid'
    or c.stripe_payment_intent_id is distinct from e#>>'{source,paymentIntentId}'
    then raise exception 'CHANGE_ORDER_REFUND_SOURCE_CONFLICT'; end if;
  if c.stripe_refund_id is not null then
    if c.stripe_refund_id is distinct from new.receipt->>'id'
      or c.refunded_amount*100 is distinct from (new.receipt->>'amount')::numeric
      or c.refunded_at is distinct from new.confirmed_at
      then raise exception 'CHANGE_ORDER_REFUND_PROJECTION_CONFLICT'; end if;
    return new;
  end if;
  update public.change_orders set refunded_amount=(new.receipt->>'amount')::numeric/100,
    stripe_refund_id=new.receipt->>'id',refunded_at=new.confirmed_at,updated_at=clock_timestamp()
    where id=c.id;
  return new;
end $$;
create trigger co_project_refund_receipt after insert or update of receipt,confirmed_at on public.job_financial_steps
for each row execute function public.co_project_refund_receipt();
revoke all on function public.co_guard_refund_projection(),public.co_project_refund_receipt()
  from public,anon,authenticated,service_role;
commit;
