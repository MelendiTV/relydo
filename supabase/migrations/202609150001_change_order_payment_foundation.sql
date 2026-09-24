-- Stage 1 ONLY. Review before applying. No backfill or financial operations.
-- Deploy with all old Change Order writers stopped; old code bypasses reservations.
begin;

alter table public.change_orders
  add column payment_reservation_id uuid,
  add column payment_reservation_flow text,
  add column payment_reservation_created_at timestamptz,
  add column payment_reservation_payload jsonb,
  add column stripe_payment_verified_at timestamptz,
  add column stripe_payment_evidence jsonb;

alter table public.change_orders add constraint co_payment_reservation_complete check (
  (payment_reservation_id is null and payment_reservation_flow is null
    and payment_reservation_created_at is null and payment_reservation_payload is null)
  or (payment_reservation_id is not null and payment_reservation_flow is not null and payment_reservation_flow in ('checkout', 'payment_sheet')
    and payment_reservation_created_at is not null and payment_reservation_payload is not null)
);
-- Abort the migration on duplicates; never repair historical rows implicitly.
create unique index co_payment_intent_unique on public.change_orders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create unique index co_payment_reservation_unique on public.change_orders (payment_reservation_id)
  where payment_reservation_id is not null;

create function public.reserve_change_order_payment(
  p_change_order_id uuid, p_customer_id uuid, p_flow text, p_payload jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_request_id uuid;
  v_job public.service_requests%rowtype;
  v_order public.change_orders%rowtype;
  v_meta jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_customer_id is null or p_flow is null or p_flow not in ('checkout','payment_sheet') then
    raise exception 'INVALID_RESERVATION_INPUT';
  end if;
  select request_id into v_request_id from public.change_orders where id = p_change_order_id;
  select * into v_job from public.service_requests where id = v_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  select * into v_order from public.change_orders where id = p_change_order_id for update;
  if not found or v_order.request_id is distinct from v_job.id then raise exception 'CHANGE_ORDER_NOT_FOUND'; end if;
  if v_order.customer_id is distinct from p_customer_id or v_job.customer_id is distinct from p_customer_id then
    raise exception 'NOT_CHANGE_ORDER_CUSTOMER';
  end if;
  if v_order.payment_status = 'paid' then return jsonb_build_object('outcome','paid'); end if;
  if v_order.status is distinct from 'accepted' or v_order.payment_status is distinct from 'unpaid'
    or v_job.status is distinct from 'in_progress'
    or coalesce(v_job.job_stage, '') not in ('arrived','working')
    or v_job.preferred_provider_id is distinct from v_order.provider_id then raise exception 'PAYMENT_STATE_CONFLICT'; end if;
  -- Claims are not modified here. Never start/resume a payment during a claim.
  if exists (select 1 from public.job_claims where request_id = v_job.id) then raise exception 'CLAIM_REQUIRES_RECONCILIATION'; end if;

  if v_order.payment_reservation_id is not null then
    if v_order.payment_reservation_flow is distinct from p_flow then raise exception 'PAYMENT_CHANNEL_RESERVED'; end if;
    return jsonb_build_object('outcome','reserved','reservation',jsonb_build_object(
      'id',v_order.payment_reservation_id,'flow',v_order.payment_reservation_flow,
      'created_at',v_order.payment_reservation_created_at,'payload',v_order.payment_reservation_payload,
      'session_id',v_order.stripe_checkout_session_id,'payment_intent_id',v_order.stripe_payment_intent_id));
  end if;
  -- Legacy identifiers may point to expired/unpaid objects. Never replace them automatically.
  if v_order.stripe_checkout_session_id is not null or v_order.stripe_payment_intent_id is not null then
    return jsonb_build_object('outcome','legacy');
  end if;
  if p_payload is null then return jsonb_build_object('outcome','needs_payload'); end if;
  v_meta := p_payload -> 'metadata';
  if v_meta is null or jsonb_typeof(p_payload -> 'params') is distinct from 'object'
    or v_meta ->> 'change_order_id' is distinct from v_order.id::text
    or v_meta ->> 'request_id' is distinct from v_order.request_id::text
    or v_meta ->> 'customer_id' is distinct from v_order.customer_id::text
    or v_meta ->> 'provider_id' is distinct from v_order.provider_id::text
    or v_meta ->> 'payment_type' is distinct from 'change_order'
    or (v_meta ->> 'original_amount')::numeric is distinct from v_order.original_amount
    or (v_meta ->> 'additional_amount')::numeric is distinct from v_order.additional_amount
    or (v_meta ->> 'new_total_amount')::numeric is distinct from v_order.new_total_amount
    or v_order.additional_amount <= 0
    or v_order.new_total_amount <> v_order.original_amount + v_order.additional_amount
    or coalesce(p_payload ->> 'currency','') !~ '^[a-z]{3}$' then raise exception 'PAYMENT_SNAPSHOT_MISMATCH'; end if;
  update public.change_orders set payment_reservation_id = gen_random_uuid(),
    payment_reservation_flow = p_flow, payment_reservation_created_at = clock_timestamp(),
    payment_reservation_payload = p_payload
    where id = v_order.id returning * into v_order;
  return jsonb_build_object('outcome','reserved','reservation',jsonb_build_object(
    'id',v_order.payment_reservation_id,'flow',v_order.payment_reservation_flow,
    'created_at',v_order.payment_reservation_created_at,'payload',v_order.payment_reservation_payload,
    'session_id',null,'payment_intent_id',null));
end $$;

create function public.attach_change_order_payment(
  p_change_order_id uuid, p_customer_id uuid, p_reservation_id uuid,
  p_session_id text default null, p_payment_intent_id text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_request_id uuid;
  v_job public.service_requests%rowtype;
  v_order public.change_orders%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select request_id into v_request_id from public.change_orders where id = p_change_order_id;
  select * into v_job from public.service_requests where id = v_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  select * into v_order from public.change_orders where id = p_change_order_id for update;
  if not found or v_order.request_id is distinct from v_job.id then raise exception 'CHANGE_ORDER_NOT_FOUND'; end if;
  if p_reservation_id is null or v_order.payment_reservation_id is distinct from p_reservation_id
    or v_order.customer_id is distinct from p_customer_id or v_job.customer_id is distinct from p_customer_id then
    raise exception 'PAYMENT_RESERVATION_MISMATCH'; end if;
  if (v_order.payment_reservation_flow = 'checkout' and
      (coalesce(p_session_id,'') = '' or p_payment_intent_id is not null))
    or (v_order.payment_reservation_flow = 'payment_sheet' and
      (coalesce(p_payment_intent_id,'') = '' or p_session_id is not null)) then raise exception 'INVALID_STRIPE_REFERENCE'; end if;
  if (v_order.stripe_checkout_session_id is not null and p_session_id is not null and v_order.stripe_checkout_session_id <> p_session_id)
    or (v_order.stripe_payment_intent_id is not null and p_payment_intent_id is not null and v_order.stripe_payment_intent_id <> p_payment_intent_id) then
    raise exception 'STRIPE_REFERENCE_CONFLICT'; end if;
  -- Persist the identifier even if the job changed while Stripe prepared it.
  -- The caller must not expose a URL/client_secret when allowed=false.
  update public.change_orders set
    stripe_checkout_session_id = coalesce(stripe_checkout_session_id,p_session_id),
    stripe_payment_intent_id = coalesce(stripe_payment_intent_id,p_payment_intent_id)
    where id = v_order.id;
  return jsonb_build_object('attached',true,'allowed',
    v_order.payment_status = 'unpaid' and v_order.status = 'accepted'
    and v_job.status = 'in_progress' and coalesce(v_job.job_stage,'') in ('arrived','working')
    and v_job.preferred_provider_id = v_order.provider_id
    and not exists (select 1 from public.job_claims where request_id = v_job.id));
end $$;

create function public.confirm_change_order_payment(p_change_order_id uuid, p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_request_id uuid;
  v_job public.service_requests%rowtype;
  v_order public.change_orders%rowtype;
  v_meta jsonb := p_evidence -> 'metadata';
  v_pi text := p_evidence ->> 'payment_intent_id';
  v_session text := p_evidence ->> 'session_id';
  v_amount numeric;
  v_fee numeric;
  v_commission numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select request_id into v_request_id from public.change_orders where id = p_change_order_id;
  select * into v_job from public.service_requests where id = v_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  select * into v_order from public.change_orders where id = p_change_order_id for update;
  if not found or v_order.request_id is distinct from v_job.id then raise exception 'CHANGE_ORDER_NOT_FOUND'; end if;
  if v_pi is null or v_pi = '' or coalesce(p_evidence ->> 'charge_id','') = ''
    or p_evidence ->> 'status' is distinct from 'succeeded'
    or p_evidence ->> 'currency' is null or p_evidence ->> 'paid_at' is null
    or v_meta ->> 'change_order_id' is distinct from v_order.id::text
    or v_meta ->> 'request_id' is distinct from v_order.request_id::text
    or v_meta ->> 'customer_id' is distinct from v_order.customer_id::text
    or v_meta ->> 'provider_id' is distinct from v_order.provider_id::text
    or v_meta ->> 'payment_type' is distinct from 'change_order'
    or (v_meta ->> 'original_amount')::numeric is distinct from v_order.original_amount
    or (v_meta ->> 'additional_amount')::numeric is distinct from v_order.additional_amount
    or (v_meta ->> 'new_total_amount')::numeric is distinct from v_order.new_total_amount then
    raise exception 'PAYMENT_EVIDENCE_MISMATCH'; end if;
  v_amount := (v_meta ->> 'additional_amount')::numeric;
  v_fee := (v_meta ->> 'customer_fee_amount')::numeric;
  v_commission := (v_meta ->> 'provider_commission_amount')::numeric;
  if v_amount <= 0 or v_fee is null or v_fee < 0 or v_commission is null or v_commission < 0
    or (v_meta ->> 'customer_fee_percent')::numeric is null or (v_meta ->> 'customer_fee_percent')::numeric < 0
    or (v_meta ->> 'provider_commission_percent')::numeric is null
    or (v_meta ->> 'provider_commission_percent')::numeric not between 0 and 100
    or v_order.new_total_amount <> v_order.original_amount + v_amount
    or v_fee <> round(v_amount * (v_meta ->> 'customer_fee_percent')::numeric / 100,2)
    or v_commission <> round(v_amount * (v_meta ->> 'provider_commission_percent')::numeric / 100,2)
    or (v_meta ->> 'customer_total_amount')::numeric is distinct from v_amount + v_fee
    or (v_meta ->> 'provider_net_amount')::numeric is distinct from v_amount - v_commission
    or v_amount - v_commission <= 0
    or (v_meta ->> 'platform_revenue_amount')::numeric is distinct from v_fee + v_commission
    or (p_evidence ->> 'amount_received')::numeric is distinct from round((v_amount + v_fee)*100) then
    raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;
  if v_order.payment_reservation_id is not null and (
    p_evidence ->> 'reservation_id' is distinct from v_order.payment_reservation_id::text
    or p_evidence ->> 'currency' is distinct from v_order.payment_reservation_payload ->> 'currency'
    or v_meta is distinct from v_order.payment_reservation_payload -> 'metadata'
  ) then raise exception 'PAYMENT_RESERVATION_MISMATCH'; end if;
  if (v_order.stripe_payment_intent_id is not null and v_order.stripe_payment_intent_id <> v_pi)
    or (v_session is not null and v_order.stripe_checkout_session_id is not null and v_order.stripe_checkout_session_id <> v_session)
    or (v_order.stripe_payment_evidence is not null and v_order.stripe_payment_evidence ->> 'payment_intent_id' is distinct from v_pi) then
    raise exception 'STRIPE_REFERENCE_CONFLICT'; end if;
  -- A stale unpaid web Session alongside a historical mobile payment is preserved.
  if v_order.payment_status = 'paid' then
    if v_order.stripe_payment_intent_id is distinct from v_pi then raise exception 'STRIPE_REFERENCE_CONFLICT'; end if;
    return jsonb_build_object('outcome','paid','already_paid',true);
  end if;
  -- Evidence is distinct from local confirmation and from subsequent settlement.
  update public.change_orders set stripe_payment_verified_at = coalesce(stripe_payment_verified_at,clock_timestamp()),
    stripe_payment_evidence = coalesce(stripe_payment_evidence,p_evidence), stripe_payment_intent_id = v_pi,
    stripe_checkout_session_id = coalesce(v_session,stripe_checkout_session_id)
    where id = v_order.id;
  if v_order.status is distinct from 'accepted' or v_order.payment_status is distinct from 'unpaid'
    or v_job.customer_id is distinct from v_order.customer_id
    or v_job.preferred_provider_id is distinct from v_order.provider_id
    or coalesce(v_job.status,'') not in ('in_progress','completed')
    or exists (select 1 from public.job_claims where request_id = v_job.id) then
    return jsonb_build_object('outcome','reconciliation_required','already_paid',false);
  end if;
  update public.change_orders set payment_status = 'paid',
    additional_customer_fee_percent = (v_meta ->> 'customer_fee_percent')::numeric,
    additional_customer_fee_amount = v_fee, additional_customer_total_amount = v_amount + v_fee,
    additional_provider_commission_percent = (v_meta ->> 'provider_commission_percent')::numeric,
    additional_provider_commission_amount = v_commission, additional_provider_net_amount = v_amount - v_commission,
    additional_platform_revenue_amount = v_fee + v_commission,
    paid_at = (p_evidence ->> 'paid_at')::timestamptz, updated_at = clock_timestamp()
    where id = v_order.id;
  return jsonb_build_object('outcome','paid','already_paid',false);
end $$;

revoke all on function public.reserve_change_order_payment(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.attach_change_order_payment(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.confirm_change_order_payment(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_change_order_payment(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.attach_change_order_payment(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.confirm_change_order_payment(uuid,jsonb) to service_role;
commit;
