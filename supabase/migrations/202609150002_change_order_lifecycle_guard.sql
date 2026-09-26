-- LOCAL PROPOSAL ONLY. Requires 202609150001. No historical backfill.
-- New writers must be activated together. Stop old financial writers first.
-- Callers without decision.plan (including release/cancel legacy writers) fail closed.
-- No automatic conversion of historical decisions/sources into an attested plan.
begin;

-- NULL for every historical claim. Only a new, verified zero-money closure may
-- set this marker; a historical resolution is never inferred from its label.
alter table public.job_claims add column co_no_settlement_resolution boolean;

create table public.job_financial_resolutions (
  request_id uuid primary key references public.service_requests(id),
  owner text not null,
  decision jsonb not null,
  plan jsonb, -- NULL is legacy/unplanned: never infer completion.
  state text not null default 'reconciliation_required' check (state in ('reserved','executing','settled','reconciliation_required')),
  created_at timestamptz not null default clock_timestamp()
);
create table public.job_financial_steps (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.job_financial_resolutions(request_id),
  kind text not null check (kind in ('transfer','refund')),
  charge_id text not null check (charge_id <> ''),
  params jsonb not null,
  receipt jsonb,
  created_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz,
  unique(charge_id,kind),
  check ((receipt is null) = (confirmed_at is null))
);
alter table public.job_financial_resolutions enable row level security;
alter table public.job_financial_steps enable row level security;
revoke all on public.job_financial_resolutions,public.job_financial_steps from public,anon,authenticated,service_role;

-- All new paths acquire the parent before reading children. Child triggers use
-- NOWAIT because legacy RPCs can already hold a child row: fail/retry rather
-- than wait in the opposite lock order. No network calls inside SQL transactions.
create function public.co_lock_job(p_request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.service_requests where id=p_request_id for update nowait;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
end $$;

create function public.co_has_unresolved_payment(p_request_id uuid) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from public.change_orders c where c.request_id=p_request_id and (
    (c.payment_status is distinct from 'paid' and (c.status in ('pending','accepted')
      or c.payment_reservation_id is not null or c.stripe_payment_intent_id is not null
      or c.stripe_checkout_session_id is not null or c.stripe_payment_evidence is not null
      or c.paid_at is not null or c.stripe_transfer_id is not null or c.released_at is not null))
    or (c.payment_status='paid' and (c.stripe_payment_intent_id is null or c.paid_at is null
      or c.additional_customer_total_amount is null or c.additional_provider_net_amount is null
      or exists(select 1 from public.service_requests j where j.id=p_request_id and
        (j.customer_id is distinct from c.customer_id or j.preferred_provider_id is distinct from c.provider_id))))
    or ((c.stripe_transfer_id is null) <> (c.released_at is null))
  ));
$$;

create function public.co_claim_blocks_finance(p_request_id uuid) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from public.job_claims where request_id=p_request_id and
    not(coalesce(co_no_settlement_resolution,false) and status='resolved'));
$$;


-- LOCAL PROPOSAL ONLY: immutable expected set, including zero-money decisions.
create function public.financial_receipt_matches(p_instruction jsonb,p_receipt jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(p_receipt->>'id'<>'' and p_receipt->>'status'='succeeded'
   and p_receipt->>'kind'=p_instruction->>'kind'
   and p_receipt->>'charge_id'=p_instruction->>'chargeId'
   and p_receipt->'amount'=p_instruction#>'{params,amount}'
   and p_receipt->'currency'=p_instruction->'currency'
   and p_receipt->'direction'=p_instruction->'direction'
   and p_receipt->'origin'=p_instruction->'origin'
   and p_receipt->'destination'=p_instruction->'destination'
   and p_receipt->'source'=p_instruction->'source',false);
$$;

create function public.settle_job_financial_resolution(p_request_id uuid,p_owner text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.job_financial_resolutions%rowtype; v_step record; v_order public.change_orders%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 perform public.co_lock_job(p_request_id);
 select * into r from public.job_financial_resolutions where request_id=p_request_id;
 if not found or r.owner is distinct from p_owner then raise exception 'FINANCIAL_OWNER_CONFLICT'; end if;
 if r.plan is null or r.state='reconciliation_required' then
   update public.job_financial_resolutions set state='reconciliation_required' where request_id=p_request_id;
   return jsonb_build_object('settled',false,'state','reconciliation_required');
 end if;
 if public.co_has_unresolved_payment(p_request_id) and r.decision->>'action' is distinct from 'continue_work' then raise exception 'FINANCIAL_RESOLUTION_INCOMPLETE'; end if;
 if exists(select 1 from jsonb_array_elements(r.plan) e where not exists(
   select 1 from public.job_financial_steps s where s.request_id=p_request_id
    and s.kind=e->>'kind' and s.charge_id=e->>'chargeId' and s.params=e->'params'
    and public.financial_receipt_matches(e,s.receipt)))
 or exists(select 1 from public.job_financial_steps s where s.request_id=p_request_id and not exists(
   select 1 from jsonb_array_elements(r.plan) e where s.kind=e->>'kind' and s.charge_id=e->>'chargeId' and s.params=e->'params'))
 then raise exception 'FINANCIAL_RESOLUTION_INCOMPLETE'; end if;
 -- H9 / LOCAL PROPOSAL ONLY: project provider settlement in this transaction.
 -- payment_status/paid_at remain evidence of customer funding, even for refunds.
 -- In a partial decision stripe_transfer_id/released_at attest only the provider
 -- transfer in the plan; its receipt amount is authoritative, not the CO net.
 if p_owner like 'claim:%' then
   begin
     for v_step in
       select e as instruction,s.receipt,s.confirmed_at
       from jsonb_array_elements(r.plan) e
       join public.job_financial_steps s on s.request_id=p_request_id
         and s.kind=e->>'kind' and s.charge_id=e->>'chargeId' and s.params=e->'params'
       where e->>'kind'='transfer' and e->>'direction'='to_provider'
         and e#>>'{source,changeOrderId}' is not null
       order by e#>>'{source,changeOrderId}'
     loop
       select * into v_order from public.change_orders
         where id::text=v_step.instruction#>>'{source,changeOrderId}'
           and request_id=p_request_id for update nowait;
       if not found or v_order.payment_status is distinct from 'paid'
         or v_order.stripe_payment_intent_id is distinct from v_step.instruction#>>'{source,paymentIntentId}'
         or v_step.confirmed_at is null
         or not public.financial_receipt_matches(v_step.instruction,v_step.receipt)
         or (v_order.stripe_transfer_id is not null and v_order.stripe_transfer_id is distinct from v_step.receipt->>'id')
       then raise exception 'CHANGE_ORDER_SETTLEMENT_CONFLICT'; end if;
       -- Exact retries preserve the transfer identity and first release time.
       if v_order.stripe_transfer_id is null or v_order.released_at is null then
         update public.change_orders set stripe_transfer_id=v_step.receipt->>'id',
           released_at=coalesce(released_at,v_step.confirmed_at),
           updated_at=clock_timestamp() where id=v_order.id;
         if not found then raise exception 'CHANGE_ORDER_SETTLEMENT_NOT_PROJECTED'; end if;
       end if;
     end loop;
   exception when others then
     -- Abort finalization, including all CO projections. Durable receipts from
     -- earlier calls survive; retry can reconcile without new money movements.
     raise exception 'CHANGE_ORDER_SETTLEMENT_RECONCILIATION_REQUIRED' using detail=SQLERRM;
   end;
 end if;
 -- Exact set equality and per-step amounts also prove all per-currency/direction totals.
 update public.job_financial_resolutions set state='settled' where request_id=p_request_id;
 return jsonb_build_object('settled',true,'state','settled');
end $$;

create function public.reserve_job_financial_resolution(p_request_id uuid,p_owner text,p_decision jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_existing public.job_financial_resolutions%rowtype; v_claim public.job_claims%rowtype; e jsonb; v_plan jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  perform public.co_lock_job(p_request_id);
  if p_owner is null or (p_owner not in ('automatic_release','customer_cancel') and p_owner !~ '^claim:[0-9a-f-]{36}$')
    or jsonb_typeof(p_decision) is distinct from 'object' then raise exception 'INVALID_RESOLUTION'; end if;
  select * into v_existing from public.job_financial_resolutions where request_id=p_request_id;
  if found and v_existing.owner is distinct from p_owner then raise exception 'FINANCIAL_OWNER_CONFLICT'; end if;
  if found and v_existing.plan is null then
    update public.job_financial_resolutions set state='reconciliation_required' where request_id=p_request_id;
    return jsonb_build_object('reserved',false,'state','reconciliation_required');
  end if;
  if found then
    if v_existing.owner<>p_owner or v_existing.decision<>p_decision then raise exception 'FINANCIAL_OWNER_CONFLICT'; end if;
    return jsonb_build_object('reserved',true,'state',v_existing.state,'pending_steps',(select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'params',params)),'[]'::jsonb)
      from public.job_financial_steps where request_id=p_request_id and receipt is null));
  end if;
  if public.co_has_unresolved_payment(p_request_id) and p_decision->>'action' is distinct from 'continue_work' then raise exception 'CHANGE_ORDER_RECONCILIATION_REQUIRED'; end if;
  if p_owner='automatic_release' and not exists(select 1 from public.service_requests where id=p_request_id and status='completed') then raise exception 'JOB_NOT_COMPLETED'; end if;
  if p_owner='customer_cancel' then

  if not exists(
    select 1
    from public.service_requests
    where id=p_request_id
      and (
        status='open'
        or (
          status='in_progress'
          and coalesce(job_stage,'') <> 'working'
        )
      )
  ) then
    raise exception 'JOB_NOT_CANCELLABLE_BY_CUSTOMER';
  end if;

  if exists(
    select 1
    from public.change_orders
    where request_id=p_request_id
      and payment_status='paid'
  ) then
    raise exception 'PAID_CHANGE_ORDER_REQUIRES_ADMIN';
  end if;

end if;
  if p_owner like 'claim:%' then
    select * into v_claim from public.job_claims where request_id=p_request_id and id=substring(p_owner from 7)::uuid for update nowait;
    if found and v_claim.status='resolved' and v_claim.co_no_settlement_resolution=true and p_decision->>'action'='continue_work' then
      return jsonb_build_object('reserved',true);
    end if;
    if not found or v_claim.status<>'reviewing' then raise exception 'HISTORICAL_OR_INVALID_CLAIM_REQUIRES_RECONCILIATION';
     end if;
    if p_decision->>'action'='refund_customer'
  and exists(
    select 1
    from public.service_requests
    where id=p_request_id
      and status='cancelled'
  )
then
  raise exception 'CANCELLED_JOB_REQUIRES_EXISTING_RESOLUTION';
end if;
    if exists(
      select 1
       from public.change_orders
        where request_id=p_request_id
         and (
          stripe_transfer_id is not null
           or released_at is not null
           )
           ) then
      raise exception 'HISTORICAL_SETTLEMENT_REQUIRES_RECONCILIATION';
    end if;
  elsif public.co_claim_blocks_finance(p_request_id) then
    -- Resolved claims can already have moved money without marking COs released.
    raise exception 'CLAIM_REQUIRES_ADMIN_RECONCILIATION';
  end if;
  v_plan:=p_decision->'plan';
  if v_plan is not null then
    if jsonb_typeof(v_plan) is distinct from 'array' then raise exception 'INVALID_FINANCIAL_PLAN'; end if;
    if p_owner like 'claim:%' and coalesce(p_decision->>'action','') not in ('continue_work','partial','pay_provider','refund_customer') then raise exception 'INVALID_FINANCIAL_PLAN'; end if;
    if (p_decision->>'action'='continue_work' and jsonb_array_length(v_plan)<>0)
      or (p_decision->>'action' in ('partial','pay_provider','refund_customer') and jsonb_array_length(v_plan)=0)
      then raise exception 'INVALID_FINANCIAL_PLAN'; end if;
    if p_decision->>'action' in ('partial','pay_provider','refund_customer') and (
      jsonb_typeof(p_decision->'providerAwardAmount') is distinct from 'number'
      or jsonb_typeof(p_decision->'customerRefundAmount') is distinct from 'number'
      or (p_decision->>'providerAwardAmount')::numeric*100 is distinct from
        (select coalesce(sum((item#>>'{params,amount}')::numeric),0) from jsonb_array_elements(v_plan) item where item->>'kind'='transfer')
      or (p_decision->>'customerRefundAmount')::numeric*100 is distinct from
        (select coalesce(sum((item#>>'{params,amount}')::numeric),0) from jsonb_array_elements(v_plan) item where item->>'kind'='refund')
      or (select count(distinct item->>'currency') from jsonb_array_elements(v_plan) item)<>1
    ) then raise exception 'FINANCIAL_PLAN_TOTAL_MISMATCH'; end if;
    for e in select value from jsonb_array_elements(v_plan) loop
      if jsonb_typeof(e) is distinct from 'object' or coalesce(e->>'key','')='' or coalesce(e->>'chargeId','')=''
        or coalesce(e->>'kind','') not in ('transfer','refund')
        or e->>'direction' is distinct from (case when e->>'kind'='transfer' then 'to_provider' else 'to_customer' end)
        or e->>'origin' is distinct from e->>'chargeId'
        or coalesce(e->>'currency','') !~ '^[a-z]{3}$'
        or jsonb_typeof(e->'source') is distinct from 'object' or coalesce(e#>>'{source,paymentIntentId}','')=''
        or jsonb_typeof(e#>'{params,amount}') is distinct from 'number'
        or coalesce(e#>>'{params,amount}','') !~ '^[1-9][0-9]*$'
        or (e#>>'{params,amount}')::numeric>9007199254740991
        or e#>>'{params,metadata,request_id}' is distinct from p_request_id::text
        or e#>>'{source,paymentId}' is distinct from e#>>'{params,metadata,payment_id}'
        or e#>>'{source,changeOrderId}' is distinct from e#>>'{params,metadata,change_order_id}'
        or e#>>'{source,fundingSourceId}' is distinct from e#>>'{params,metadata,funding_source_id}'
        or (e->>'kind'='transfer' and (coalesce(e->>'destination','')='' or e->>'destination' is distinct from e#>>'{params,destination}'
          or e->>'currency' is distinct from e#>>'{params,currency}' or e->>'chargeId' is distinct from e#>>'{params,source_transaction}'))
        or (e->>'kind'='refund' and (e->'destination' is distinct from 'null'::jsonb or e#>>'{source,paymentIntentId}' is distinct from e#>>'{params,payment_intent}'))
        then raise exception 'INVALID_FINANCIAL_PLAN'; end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(v_plan) item group by item->>'key' having count(*)>1)
      or exists(select 1 from jsonb_array_elements(v_plan) item group by item->>'chargeId',item->>'kind' having count(*)>1)
      then raise exception 'INVALID_FINANCIAL_PLAN'; end if;
  end if;
  insert into public.job_financial_resolutions(request_id,owner,decision,plan,state)
    values(p_request_id,p_owner,p_decision,v_plan,case when v_plan is null then 'reconciliation_required' else 'reserved' end);
  return jsonb_build_object('reserved',v_plan is not null,'state',case when v_plan is null then 'reconciliation_required' else 'reserved' end);
end $$;

create function public.reserve_job_financial_step(p_request_id uuid,p_owner text,p_kind text,p_charge_id text,p_params jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_step public.job_financial_steps%rowtype; r public.job_financial_resolutions%rowtype; e jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  perform public.co_lock_job(p_request_id);
  if not exists(select 1 from public.job_financial_resolutions where request_id=p_request_id and owner=p_owner) then raise exception 'FINANCIAL_OWNER_CONFLICT'; end if;
  select * into r from public.job_financial_resolutions where request_id=p_request_id;
  if r.plan is null or r.state='reconciliation_required' then raise exception 'FINANCIAL_PLAN_RECONCILIATION_REQUIRED'; end if;
  select value into e from jsonb_array_elements(r.plan) where value->>'kind'=p_kind and value->>'chargeId'=p_charge_id;
  if e is null or e->'params' is distinct from p_params then raise exception 'UNDECLARED_OR_DIVERGENT_FINANCIAL_STEP'; end if;
  if exists(select 1 from public.job_financial_resolutions where request_id=p_request_id and decision->>'action'='continue_work') then raise exception 'NON_FINANCIAL_RESOLUTION'; end if;
  if public.co_has_unresolved_payment(p_request_id) then raise exception 'CHANGE_ORDER_RECONCILIATION_REQUIRED'; end if;
  if p_kind is null or p_kind not in ('transfer','refund') or coalesce(p_charge_id,'')='' or jsonb_typeof(p_params) is distinct from 'object'
    or p_params#>>'{metadata,request_id}' is distinct from p_request_id::text
    or coalesce((p_params->>'amount')::numeric,0)<=0 then raise exception 'INVALID_FINANCIAL_STEP'; end if;
  select * into v_step from public.job_financial_steps where charge_id=p_charge_id and kind=p_kind for update nowait;
  if found then
    if v_step.request_id<>p_request_id or v_step.params<>p_params then raise exception 'FINANCIAL_STEP_CONFLICT'; end if;
  else
    if r.state='settled' then raise exception 'FINANCIAL_RESOLUTION_SETTLED'; end if;
    update public.job_financial_resolutions set state='executing' where request_id=p_request_id;
    insert into public.job_financial_steps(request_id,kind,charge_id,params) values(p_request_id,p_kind,p_charge_id,p_params) returning * into v_step;
  end if;
  return jsonb_build_object('id',v_step.id,'instruction',e,'params',v_step.params,'receipt',v_step.receipt,'created_at',v_step.created_at);
end $$;

create function public.record_job_financial_step(p_step_id uuid,p_owner text,p_receipt jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_step public.job_financial_steps%rowtype; v_request_id uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select request_id into v_request_id from public.job_financial_steps where id=p_step_id;
  perform public.co_lock_job(v_request_id);
  select * into v_step from public.job_financial_steps where id=p_step_id for update;
  if not exists(select 1 from public.job_financial_resolutions where request_id=v_request_id and owner=p_owner) then raise exception 'FINANCIAL_OWNER_CONFLICT'; end if;
  if not exists(select 1 from public.job_financial_resolutions r, lateral jsonb_array_elements(r.plan) e
    where r.request_id=v_request_id and r.state in ('reserved','executing','settled') and e->>'kind'=v_step.kind
    and e->>'chargeId'=v_step.charge_id and e->'params'=v_step.params and public.financial_receipt_matches(e,p_receipt))
    then raise exception 'INVALID_FINANCIAL_RECEIPT'; end if;
  if coalesce(p_receipt->>'id','')='' or p_receipt->>'status' is distinct from 'succeeded'
    or (p_receipt->>'amount')::numeric is distinct from (v_step.params->>'amount')::numeric then raise exception 'INVALID_FINANCIAL_RECEIPT'; end if;
  if exists(select 1 from public.job_financial_steps where id<>p_step_id and receipt->>'id'=p_receipt->>'id') then raise exception 'FINANCIAL_RECEIPT_REUSED'; end if;
  if v_step.receipt is not null and v_step.receipt<>p_receipt then raise exception 'FINANCIAL_RECEIPT_CONFLICT'; end if;
  update public.job_financial_steps set receipt=p_receipt,confirmed_at=coalesce(confirmed_at,clock_timestamp()) where id=p_step_id;
  return jsonb_build_object('recorded',true);
end $$;

create function public.co_guard_job_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_risky boolean; v_resolution public.job_financial_resolutions%rowtype; v_admin boolean;
begin
  if tg_op='UPDATE' and (to_jsonb(new)-array['updated_at','job_stage_updated_at'])=(to_jsonb(old)-array['updated_at','job_stage_updated_at']) then return new; end if;
  select * into v_resolution from public.job_financial_resolutions where request_id=old.id;
  v_admin := coalesce(auth.role(),'')='service_role' and
    current_setting('relydo.financial_job',true)=old.id::text and v_resolution.owner like 'claim:%';
  if tg_op='DELETE' then
    if v_resolution.request_id is not null or exists(select 1 from public.change_orders where request_id=old.id and
      (payment_status='paid' or payment_reservation_id is not null or stripe_payment_intent_id is not null or stripe_checkout_session_id is not null)) then
      raise exception 'FINANCIAL_HISTORY_MUST_BE_PRESERVED';
    end if;
    return old;
  end if;
  if new.customer_id is distinct from old.customer_id or new.preferred_provider_id is distinct from old.preferred_provider_id
    or new.status is distinct from old.status or new.job_stage is distinct from old.job_stage
    or to_jsonb(new)->'completion_review_status' is distinct from to_jsonb(old)->'completion_review_status' then
    if v_resolution.request_id is not null and not coalesce(v_admin,false) then
      -- Customer cancellation with no CO retains its existing financial rules.
      if not (v_resolution.owner='customer_cancel' and new.status='cancelled' and not exists(select 1 from public.change_orders where request_id=old.id and (status in ('pending','accepted') or payment_status='paid'))) then
        raise exception 'FINANCIAL_RESOLUTION_OWNS_JOB';
      end if;
    end if;
    v_risky:=public.co_has_unresolved_payment(old.id);
    if v_risky then raise exception 'CHANGE_ORDER_RECONCILIATION_REQUIRED'; end if;
    if not coalesce(v_admin,false) and (new.status='completed' or to_jsonb(new)->>'completion_review_status' in ('pending','approved'))
      and public.co_claim_blocks_finance(old.id) then raise exception 'CLAIM_REQUIRES_ADMIN_RECONCILIATION'; end if;
    -- Completing a fully paid job is permitted; releasing/cancelling/reassigning
    -- it is not an implicit refund/transfer decision.
    if not coalesce(v_admin,false) and (new.customer_id is distinct from old.customer_id
      or new.preferred_provider_id is distinct from old.preferred_provider_id or (new.status is distinct from old.status and new.status<>'completed')
      or (new.job_stage is distinct from old.job_stage and coalesce(new.job_stage,'') not in ('working','completed'))) and
      exists(select 1 from public.change_orders where request_id=old.id and payment_status='paid') then
      raise exception 'PAID_CHANGE_ORDER_REQUIRES_ADMIN';
    end if;
  end if;
  return new;
end $$;
create trigger co_guard_job_lifecycle before update or delete on public.service_requests
for each row execute function public.co_guard_job_lifecycle();

create function public.co_guard_child_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_old jsonb; v_new jsonb; v_resolution public.job_financial_resolutions%rowtype;
begin
  if tg_op<>'INSERT' then v_old:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then v_new:=to_jsonb(new); end if;
  v_id:=coalesce((v_old->>'request_id')::uuid,(v_new->>'request_id')::uuid);
  perform public.co_lock_job(v_id);
  if tg_op='UPDATE' and v_old->>'request_id' is distinct from v_new->>'request_id' then raise exception 'REQUEST_ID_IMMUTABLE'; end if;
  select * into v_resolution from public.job_financial_resolutions where request_id=v_id;
  if tg_table_name='change_orders' then
    if tg_op='DELETE' and (old.payment_status='paid' or old.payment_reservation_id is not null or old.stripe_payment_intent_id is not null
      or old.stripe_checkout_session_id is not null or old.stripe_payment_evidence is not null) then raise exception 'FINANCIAL_HISTORY_MUST_BE_PRESERVED'; end if;
    if tg_op='INSERT' then
      if v_resolution.request_id is not null or public.co_has_unresolved_payment(v_id)
        or exists(select 1 from public.payment_reassignments where request_id=v_id and status in ('available','pending_replacement'))
        or public.co_claim_blocks_finance(v_id) then raise exception 'CHANGE_ORDER_RECONCILIATION_REQUIRED'; end if;
    elsif tg_op='UPDATE' then
      if (old.payment_status='paid' or old.payment_reservation_id is not null or old.stripe_payment_intent_id is not null or old.stripe_checkout_session_id is not null) and
        (v_old->'original_amount' is distinct from v_new->'original_amount' or v_old->'additional_amount' is distinct from v_new->'additional_amount'
        or v_old->'new_total_amount' is distinct from v_new->'new_total_amount' or v_old->'provider_id' is distinct from v_new->'provider_id'
        or v_old->'customer_id' is distinct from v_new->'customer_id' or v_old->'status' is distinct from v_new->'status'
        or (old.payment_status='paid' and new.payment_status<>'paid')) then raise exception 'FUNDED_CHANGE_ORDER_IMMUTABLE'; end if;
      if (old.payment_reservation_id is not null and old.payment_reservation_id is distinct from new.payment_reservation_id)
        or (old.stripe_payment_intent_id is not null and old.stripe_payment_intent_id is distinct from new.stripe_payment_intent_id)
        or (old.stripe_checkout_session_id is not null and old.stripe_checkout_session_id is distinct from new.stripe_checkout_session_id)
        or (old.stripe_payment_evidence is not null and old.stripe_payment_evidence is distinct from new.stripe_payment_evidence) then raise exception 'FINANCIAL_HISTORY_MUST_BE_PRESERVED'; end if;
      if v_resolution.request_id is not null and ((old.payment_reservation_id is null and new.payment_reservation_id is not null)
        or (old.payment_status<>'paid' and new.payment_status='paid') or (old.status is distinct from new.status and new.status in ('pending','accepted'))) then raise exception 'FINANCIAL_RESOLUTION_OWNS_JOB'; end if;
    end if;
  elsif tg_table_name='job_claims' then
    if tg_op='UPDATE' and new.status='resolved' and old.status is distinct from 'resolved' and v_resolution.request_id is null then raise exception 'FINANCIAL_RESOLUTION_INCOMPLETE'; end if;
    if tg_op='INSERT' and new.co_no_settlement_resolution is not null then raise exception 'INVALID_NON_FINANCIAL_CLOSURE'; end if;
    if tg_op='UPDATE' and coalesce(old.co_no_settlement_resolution,false) and v_old is distinct from v_new then
      if new.status is distinct from old.status or to_jsonb(new)->'resolution_type' is distinct from to_jsonb(old)->'resolution_type'
        or to_jsonb(new)->'provider_award_amount' is distinct from to_jsonb(old)->'provider_award_amount'
        or to_jsonb(new)->'customer_refund_amount' is distinct from to_jsonb(old)->'customer_refund_amount'
        or new.co_no_settlement_resolution is distinct from true then raise exception 'NON_FINANCIAL_CLOSURE_IMMUTABLE'; end if;
    end if;
    if tg_op='UPDATE' and new.co_no_settlement_resolution=true and old.co_no_settlement_resolution is distinct from true then
      if coalesce(auth.role(),'')<>'service_role' or v_resolution.owner is distinct from 'claim:'||old.id::text
        or v_resolution.decision->>'action' is distinct from 'continue_work' or v_resolution.plan is distinct from '[]'::jsonb or new.status<>'resolved'
        or coalesce((v_new->>'provider_award_amount')::numeric,-1)<>0 or coalesce((v_new->>'customer_refund_amount')::numeric,-1)<>0
        or v_new->>'resolution_type' is distinct from 'pay_provider'
        or exists(select 1 from public.job_financial_steps where request_id=v_id)
        or not exists(select 1 from public.service_requests where id=v_id and status='in_progress' and job_stage='working') then raise exception 'INVALID_NON_FINANCIAL_CLOSURE'; end if;
      delete from public.job_financial_resolutions where request_id=v_id;
    end if;
    if v_resolution.request_id is not null then
      if tg_op='DELETE' or tg_op='INSERT' or v_resolution.owner is distinct from 'claim:'||(v_old->>'id') then raise exception 'FINANCIAL_RESOLUTION_OWNS_JOB'; end if;
      if v_new->>'status' is distinct from v_old->>'status' and v_new->>'status'<>'resolved' then raise exception 'FINANCIAL_RESOLUTION_OWNS_JOB'; end if;
      if v_new->>'status'='resolved' and new.co_no_settlement_resolution is distinct from true then
        if (public.settle_job_financial_resolution(v_id,v_resolution.owner)->>'settled')::boolean is distinct from true then raise exception 'FINANCIAL_RESOLUTION_INCOMPLETE'; end if;
      end if;
      if v_new->>'status'='resolved' and ((public.co_has_unresolved_payment(v_id) and new.co_no_settlement_resolution is distinct from true) or
        exists(select 1 from public.job_financial_steps where request_id=v_id and receipt is null)) then raise exception 'FINANCIAL_RESOLUTION_INCOMPLETE'; end if;
    end if;
    elsif tg_table_name='payment_reassignments' then

  if (
    tg_op='UPDATE'
    and v_resolution.request_id is not null
    and v_resolution.owner='customer_cancel'
    and v_old->>'status' in ('available','pending_replacement','applied')
    and v_new->>'status'='cancelled'
    and (v_new - array['status','updated_at'])
        =
        (v_old - array['status','updated_at'])
    and exists(
      select 1
      from public.service_requests
      where id=v_id
        and status='cancelled'
    )
    and not public.co_has_unresolved_payment(v_id)
    and not exists(
      select 1
      from public.change_orders
      where request_id=v_id
        and payment_status='paid'
    )
    and not exists(
      select 1
      from public.job_financial_steps
      where request_id=v_id
        and receipt is null
    )
  ) then
    null;

  elsif (
    v_resolution.request_id is not null
    or public.co_has_unresolved_payment(v_id)
    or exists(
      select 1
      from public.change_orders
      where request_id=v_id
        and payment_status='paid'
    )
  ) then
    raise exception 'CHANGE_ORDER_BLOCKS_REASSIGNMENT';
  end if;

end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger co_guard_change_order before insert or update or delete on public.change_orders for each row execute function public.co_guard_child_lifecycle();
create trigger co_guard_claim before insert or update or delete on public.job_claims for each row execute function public.co_guard_child_lifecycle();
create trigger co_guard_reassignment before insert or update or delete on public.payment_reassignments for each row execute function public.co_guard_child_lifecycle();

create function public.apply_job_financial_update(p_request_id uuid,p_owner text,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_columns text; v_previous text;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  perform public.co_lock_job(p_request_id);
  if p_owner not like 'claim:%' or not exists(select 1 from public.job_financial_resolutions where request_id=p_request_id and owner=p_owner)
    or public.co_has_unresolved_payment(p_request_id)
    or exists(select 1 from public.job_financial_steps where request_id=p_request_id and receipt is null) then raise exception 'FINANCIAL_RESOLUTION_INCOMPLETE'; end if;
  if (public.settle_job_financial_resolution(p_request_id,p_owner)->>'settled')::boolean is distinct from true then raise exception 'FINANCIAL_RESOLUTION_INCOMPLETE'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or p_patch='{}'::jsonb or exists(select 1 from jsonb_object_keys(p_patch) k where k not in
    ('status','job_stage','completion_review_status','completion_approved_at','completed_at','cancellation_reason','cancelled_at')) then raise exception 'INVALID_JOB_PATCH'; end if;
  select string_agg(format('%1$I = r.%1$I',k),',') into v_columns from jsonb_object_keys(p_patch) k;
  v_previous:=current_setting('relydo.financial_job',true);
  perform set_config('relydo.financial_job',p_request_id::text,true);
  execute format('update public.service_requests s set %s from jsonb_populate_record(null::public.service_requests,$1) r where s.id=$2',v_columns) using p_patch,p_request_id;
  perform set_config('relydo.financial_job',coalesce(v_previous,''),true);
  return jsonb_build_object('updated',true);
end $$;

-- Preserve the installed bodies/signatures/grants, adding only a parent lock
-- and a guard before their existing logic. Refuse missing/overloaded RPCs.
create table public.co_stage2_function_backup(name text primary key, definition text not null, installed_definition text);
alter table public.co_stage2_function_backup enable row level security;
revoke all on public.co_stage2_function_backup from public,anon,authenticated,service_role;

create function public.co_assert_job_operation(p_request_id uuid,p_operation text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.co_lock_job(p_request_id);
  if public.co_has_unresolved_payment(p_request_id) or
    exists(select 1 from public.job_financial_resolutions where request_id=p_request_id and not(p_operation='cancel' and owner='customer_cancel')) then raise exception 'CHANGE_ORDER_RECONCILIATION_REQUIRED'; end if;
  if p_operation in ('cancel','release','reassign') and exists(select 1 from public.change_orders where request_id=p_request_id and payment_status='paid') then
    raise exception 'PAID_CHANGE_ORDER_REQUIRES_ADMIN';
  end if;
  if p_operation='complete' and public.co_claim_blocks_finance(p_request_id) then raise exception 'CLAIM_REQUIRES_ADMIN_RECONCILIATION'; end if;
end $$;

-- Stage-1 confirmation/reservation must recognize the explicitly recorded
-- non-financial closure, while still blocking all unclassified historical claims.
do $$ declare v_name text; v_def text; begin
  foreach v_name in array array['reserve_change_order_payment','attach_change_order_payment','confirm_change_order_payment'] loop
    select pg_get_functiondef(p.oid) into strict v_def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v_name;
    insert into public.co_stage2_function_backup(name,definition) values(v_name,v_def);
    if position('from public.job_claims where request_id = v_job.id' in v_def)=0 then raise exception 'REVIEW_REQUIRED: changed foundation RPC %',v_name; end if;
    execute replace(v_def,'from public.job_claims where request_id = v_job.id','from public.job_claims where request_id = v_job.id and not (coalesce(co_no_settlement_resolution,false) and status=''resolved'')');
  end loop;
end $$;

create function public.guard_job_reassignment(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  perform public.co_assert_job_operation(p_request_id,'reassign');
  return jsonb_build_object('allowed',true);
end $$;

do $$
declare v_name text; v_def text; v_prefix text; v_job text; v_operation text; v_count integer;
begin
  foreach v_name in array array['cancel_job','release_job_by_provider','cleanup_failed_change_order',
    'complete_job','approve_job_completion','submit_job_for_completion_review','prepare_payment_reassignment',
    'finalize_payment_reassignment','update_job_stage','respond_to_change_order','create_customer_claim_secure'] loop
    select count(*) into v_count from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=v_name;
    if v_count<>1 then raise exception 'REVIEW_REQUIRED: missing or overloaded RPC %',v_name; end if;
    if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      join pg_language l on l.oid=p.prolang where n.nspname='public' and p.proname=v_name
      and l.lanname='plpgsql' and p.prokind='f' and p.prosecdef) then
      raise exception 'REVIEW_REQUIRED: RPC must be a PL/pgSQL security definer function %',v_name;
    end if;
    select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v_name;
    insert into public.co_stage2_function_backup(name,definition) values(v_name,v_def);
    v_job:=case when v_name in ('cleanup_failed_change_order','respond_to_change_order') then '(select request_id from public.change_orders where id=p_change_order_id)'
      when v_name='finalize_payment_reassignment' then '(select request_id from public.payment_reassignments where id=p_reassignment_id)'
      else 'p_request_id' end;
    v_operation:=case when v_name='cancel_job' then 'cancel' when v_name='release_job_by_provider' then 'release'
      when v_name in ('prepare_payment_reassignment','finalize_payment_reassignment') then 'reassign'
      when v_name in ('complete_job','approve_job_completion','submit_job_for_completion_review') then 'complete' else null end;
    v_prefix:=E'begin\n  if auth.uid() is null and coalesce(auth.role(),'''')<>''service_role'' then raise exception ''AUTH_REQUIRED''; end if;\n';
    if v_name in ('cleanup_failed_change_order','respond_to_change_order') then
      v_prefix:=v_prefix||format(E'  if %1$s is not null then perform public.co_lock_job(%1$s); end if;\n',v_job);
    else
      v_prefix:=v_prefix||format(E'  perform public.co_lock_job(%s);\n',v_job);
    end if;
    if v_operation is not null then v_prefix:=v_prefix||format(E'  perform public.co_assert_job_operation(%s,%L);\n',v_job,v_operation); end if;
    if v_def !~* '\mbegin\M' then raise exception 'REVIEW_REQUIRED: unexpected function body %',v_name; end if;
    execute regexp_replace(v_def,'\mbegin\M',v_prefix,'i');
  end loop;
end $$;

update public.co_stage2_function_backup b set installed_definition=pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=b.name;

revoke all on function public.financial_receipt_matches(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.settle_job_financial_resolution(uuid,text) from public,anon,authenticated;
grant execute on function public.settle_job_financial_resolution(uuid,text) to service_role;
-- Helpers/triggers are not public RPCs. Only five backend entry points are granted.
revoke all on function public.co_lock_job(uuid),public.co_has_unresolved_payment(uuid),public.co_guard_job_lifecycle(),public.co_guard_child_lifecycle() from public,anon,authenticated,service_role;
revoke all on function public.co_assert_job_operation(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.co_claim_blocks_finance(uuid) from public,anon,authenticated,service_role;
revoke all on function public.reserve_job_financial_resolution(uuid,text,jsonb),public.reserve_job_financial_step(uuid,text,text,text,jsonb),public.record_job_financial_step(uuid,text,jsonb),public.apply_job_financial_update(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_job_financial_resolution(uuid,text,jsonb),public.reserve_job_financial_step(uuid,text,text,text,jsonb),public.record_job_financial_step(uuid,text,jsonb),public.apply_job_financial_update(uuid,text,jsonb) to service_role;
revoke all on function public.guard_job_reassignment(uuid) from public,anon,authenticated;
grant execute on function public.guard_job_reassignment(uuid) to service_role;
commit;
