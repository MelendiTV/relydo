-- Explicit, operator-only reconciliation of two Sandbox incidents. No backfill.
-- No HTTP, Stripe mutations, scheduler changes, or general reconciliation API.
begin;

-- Refuse to replace/interpret unknown deployed guards. LF/CRLF is the only
-- normalization. Compare exported definitions if this fails; never bypass it.
do $preflight$
declare expected record; actual text;
begin
 for expected in select * from (values
 ('public.financial_receipt_matches(jsonb,jsonb)','a0976d040ef8c61d2be5b30871ebe9ba'),
 ('public.record_job_financial_step(uuid,text,jsonb)','9aa8d93c53f018b43041022a7c30ee46'),
 ('public.settle_job_financial_resolution(uuid,text)','1e4790d1fae456b50cf4371de02bec06'),
 ('public.reserve_job_financial_resolution(uuid,text,jsonb)','91b0d7ed143d2aaa789615bcbd9f643d'),
 ('public.reserve_job_financial_step(uuid,text,text,text,jsonb)','2011d9570fa554c81e44e15a6e04ce20'),
 ('public.co_guard_child_lifecycle()','c1c3360db4c7814a66df49301ec90537'),
 ('public.co_guard_refund_projection()','c0530a104224b7bd5cf6eb7ed103f626')
 ) as signatures(signature,body_md5) loop
   select md5(replace(p.prosrc,E'\r\n',E'\n')) into actual from pg_proc p
    where p.oid=to_regprocedure(expected.signature);
   if actual is distinct from expected.body_md5 then
     raise exception 'HISTORICAL_GUARD_DEFINITION_DRIFT: %',expected.signature;
   end if;
 end loop;
end $preflight$;

create table public.historical_release_reconciliations (
  request_id uuid primary key references public.job_financial_resolutions(request_id),
  outcome text not null check(outcome in ('adopted_existing_transfer','retired_invalid_plan')),
  evidence jsonb not null,
  before_state jsonb not null,
  after_state jsonb not null,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by text not null default session_user,
  check(request_id in ('d22970ec-9da5-4f11-b79b-e7acba81b28b','059532b3-2572-426a-a3d9-7c99a65193e9'))
);
alter table public.historical_release_reconciliations enable row level security;
revoke all on public.historical_release_reconciliations from public,anon,authenticated,service_role;

create function public.historical_release_snapshot(p_request_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'resolution',(select to_jsonb(r) from public.job_financial_resolutions r where request_id=p_request_id),
 'steps',(select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]') from public.job_financial_steps s where request_id=p_request_id),
 'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.payments p where request_id=p_request_id),
 'change_orders',(select coalesce(jsonb_agg(to_jsonb(c) order by id),'[]') from public.change_orders c where request_id=p_request_id));
$$;

-- Keep archived plans/steps in their original tables and forbid resurrection.
-- Exact no-op UPDATEs remain compatible with existing receipt/settle retries.
create function public.guard_historical_release_history() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='historical_release_reconciliations' then
   raise exception 'HISTORICAL_RECONCILIATION_IMMUTABLE';
 end if;
 if exists(select 1 from public.historical_release_reconciliations
   where request_id=case when tg_op='INSERT' then new.request_id else old.request_id end)
   or (tg_op='UPDATE' and exists(select 1 from public.historical_release_reconciliations where request_id=new.request_id)) then
   if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
   raise exception 'HISTORICAL_RECONCILIATION_IMMUTABLE';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger historical_release_audit_immutable before update or delete on public.historical_release_reconciliations
 for each row execute function public.guard_historical_release_history();
create trigger historical_release_resolution_immutable before insert or update or delete on public.job_financial_resolutions
 for each row execute function public.guard_historical_release_history();
create trigger historical_release_step_immutable before insert or update or delete on public.job_financial_steps
 for each row execute function public.guard_historical_release_history();

-- Exact plans exported in the incident, including original metadata/group.
create function public.historical_release_expected_plan(p_request_id uuid) returns jsonb
language sql immutable set search_path='' as $$
select case p_request_id when '059532b3-2572-426a-a3d9-7c99a65193e9'::uuid then '[{"key":"co:110b2353-d119-48db-9c43-820fe192cc8a:transfer","kind":"transfer","origin":"ch_3UC5VNIEn05DVPjv1l39jQYP","params":{"amount":4500,"currency":"usd","metadata":{"request_id":"059532b3-2572-426a-a3d9-7c99a65193e9","payment_type":"change_order","release_reason":"job_completed_after_protection_window","change_order_id":"110b2353-d119-48db-9c43-820fe192cc8a","professional_id":"36c86c6d-7428-46bf-a16a-635d23619354","provider_net_amount":"45.00"},"destination":"acct_1U8I9TIyP2FO3lKM","transfer_group":"relydo_request_059532b3-2572-426a-a3d9-7c99a65193e9","source_transaction":"ch_3UC5VNIEn05DVPjv1l39jQYP"},"source":{"paymentId":null,"changeOrderId":"110b2353-d119-48db-9c43-820fe192cc8a","fundingSourceId":null,"paymentIntentId":"pi_3UC5VNIEn05DVPjv1ROW8Eeq"},"chargeId":"ch_3UC5VNIEn05DVPjv1l39jQYP","currency":"usd","direction":"to_provider","destination":"acct_1U8I9TIyP2FO3lKM"},{"key":"payment:4843d36b-2828-4a83-b15f-01332ec9b86b:transfer","kind":"transfer","origin":"ch_3UC46SIEn05DVPjv07BFJ61z","params":{"amount":4500,"currency":"usd","metadata":{"offer_id":"46c79563-2704-421c-bf41-942a0fcb2ff0","payment_id":"4843d36b-2828-4a83-b15f-01332ec9b86b","request_id":"059532b3-2572-426a-a3d9-7c99a65193e9","payment_type":"original","release_reason":"job_completed_after_protection_window","professional_id":"36c86c6d-7428-46bf-a16a-635d23619354","provider_net_amount":"45.00"},"destination":"acct_1U8I9TIyP2FO3lKM","transfer_group":"relydo_request_059532b3-2572-426a-a3d9-7c99a65193e9","source_transaction":"ch_3UC46SIEn05DVPjv07BFJ61z"},"source":{"paymentId":"4843d36b-2828-4a83-b15f-01332ec9b86b","changeOrderId":null,"fundingSourceId":null,"paymentIntentId":"pi_3UC46SIEn05DVPjv002zuytV"},"chargeId":"ch_3UC46SIEn05DVPjv07BFJ61z","currency":"usd","direction":"to_provider","destination":"acct_1U8I9TIyP2FO3lKM"}]'::jsonb
when 'd22970ec-9da5-4f11-b79b-e7acba81b28b'::uuid then '[{"key":"payment:b7f6d787-0af2-4e63-8eeb-419e6140f45b:transfer","kind":"transfer","origin":"ch_3U4IGSIEn05DVPjv02H68io6","params":{"amount":54000,"currency":"usd","metadata":{"offer_id":"cf2b406e-5f6c-4e70-8ce5-be666ea40b56","payment_id":"b7f6d787-0af2-4e63-8eeb-419e6140f45b","request_id":"d22970ec-9da5-4f11-b79b-e7acba81b28b","payment_type":"original","release_reason":"job_completed_after_protection_window","professional_id":"5f092ad1-b678-4840-bb6b-cfb2e0df01a6","provider_net_amount":"540.00"},"destination":"acct_1U406yRAhnBdm5Ow","transfer_group":"relydo_request_d22970ec-9da5-4f11-b79b-e7acba81b28b","source_transaction":"ch_3U4IGSIEn05DVPjv02H68io6"},"source":{"paymentId":"b7f6d787-0af2-4e63-8eeb-419e6140f45b","changeOrderId":null,"fundingSourceId":null,"paymentIntentId":"pi_3U4IGSIEn05DVPjv0Gvj9xYJ"},"chargeId":"ch_3U4IGSIEn05DVPjv02H68io6","currency":"usd","direction":"to_provider","destination":"acct_1U406yRAhnBdm5Ow"}]'::jsonb else null end;
$$;

create function public.reconcile_historical_release_20260927(p_request_id uuid,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_before jsonb; v_after jsonb; v_plan jsonb; v_entry jsonb; v_payment jsonb; v_co jsonb;
 v_charge jsonb; v_transfer jsonb; v_refund jsonb; v_base jsonb; v_receipt jsonb;
 v_audit public.historical_release_reconciliations%rowtype;
 v_step uuid; v_time timestamptz:=clock_timestamp(); v_external_time timestamptz;
 v_is_transfer boolean; v_outcome text;
begin
 -- No grants to API roles, even service_role. Invoke only by migration owner.
 if p_request_id is null or p_request_id not in
 ('d22970ec-9da5-4f11-b79b-e7acba81b28b','059532b3-2572-426a-a3d9-7c99a65193e9')
 then raise exception 'HISTORICAL_CASE_NOT_ALLOWED'; end if;
 perform public.co_lock_job(p_request_id);
 perform 1 from public.job_financial_resolutions where request_id=p_request_id for update nowait;
 perform 1 from public.job_financial_steps where request_id=p_request_id order by id for update nowait;
 perform 1 from public.payments where request_id=p_request_id order by id for update nowait;
 perform 1 from public.change_orders where request_id=p_request_id order by id for update nowait;
 v_before:=public.historical_release_snapshot(p_request_id);
 select * into v_audit from public.historical_release_reconciliations where request_id=p_request_id;
 if found then
   if v_audit.evidence is distinct from p_evidence or v_audit.after_state is distinct from v_before
     then raise exception 'HISTORICAL_REPLAY_CONFLICT'; end if;
   return jsonb_build_object('reconciled',true,'already_applied',true,'outcome',v_audit.outcome);
 end if;
 v_is_transfer:=p_request_id='d22970ec-9da5-4f11-b79b-e7acba81b28b';
 v_step:=case when v_is_transfer then 'c6af51b1-b251-4b64-9819-5ba74e64cce3'::uuid else 'e0a1009c-728a-4d66-9694-91b6cecc8e57'::uuid end;
 v_plan:=public.historical_release_expected_plan(p_request_id);
 if v_before#>>'{resolution,owner}' is distinct from 'automatic_release'
 or v_before#>>'{resolution,state}' is distinct from 'executing'
 or v_before#>'{resolution,plan}' is distinct from v_plan
 or v_before#>'{resolution,decision}' is distinct from jsonb_build_object('plan',v_plan)
 or jsonb_array_length(v_before->'steps')<>1
 or v_before#>>'{steps,0,id}' is distinct from v_step::text
 or v_before#>>'{steps,0,kind}' is distinct from 'transfer'
 or v_before#>>'{steps,0,charge_id}' is distinct from v_plan#>>'{0,chargeId}'
 or v_before#>'{steps,0,params}' is distinct from v_plan#>'{0,params}'
 or v_before#>'{steps,0,receipt}' is distinct from 'null'::jsonb
 or v_before#>'{steps,0,confirmed_at}' is distinct from 'null'::jsonb
 or jsonb_array_length(v_before->'payments')<>1
 or jsonb_array_length(v_before->'change_orders')<>(case when v_is_transfer then 0 else 1 end)
 or not exists(select 1 from public.service_requests where id=p_request_id and status='completed')
 or public.co_has_unresolved_payment(p_request_id)
 or public.co_claim_blocks_finance(p_request_id)
 or exists(select 1 from public.payment_reassignments where request_id=p_request_id)
 then raise exception 'HISTORICAL_DATABASE_CONFLICT'; end if;
 v_payment:=v_before#>'{payments,0}'; v_entry:=v_plan->0; v_charge:=p_evidence->'charge';
 -- Evidence is a reviewed export from the platform Sandbox account, never a
 -- browser/client receipt. SQL checks consistency, not Stripe authenticity.
 if jsonb_typeof(p_evidence) is distinct from 'object'
 or p_evidence->>'reviewed_by' is null or length(btrim(p_evidence->>'reviewed_by'))<3
 or p_evidence->>'reference' is null or length(btrim(p_evidence->>'reference'))<3
 or coalesce(p_evidence->>'stripe_account_id','') !~ '^acct_[A-Za-z0-9]+$'
 or p_evidence->'livemode' is distinct from 'false'::jsonb
 or p_evidence->>'observed_at' is null
 or (p_evidence->>'observed_at')::timestamptz>v_time
 or (p_evidence->>'observed_at')::timestamptz<v_time-interval '24 hours'
 or v_charge->>'object' is distinct from 'charge'
 or v_charge->>'id' is distinct from v_entry->>'chargeId'
 or v_charge->>'payment_intent' is distinct from v_entry#>>'{source,paymentIntentId}'
 or v_charge->>'currency' is distinct from 'usd'
 or v_charge->'livemode' is distinct from 'false'::jsonb
 or v_charge->'paid' is distinct from 'true'::jsonb
 or v_charge->>'status' is distinct from 'succeeded'
 or v_charge->>'created' is null
 or to_timestamp((v_charge->>'created')::bigint)>(p_evidence->>'observed_at')::timestamptz
 or p_evidence#>>'{transfers,object}' is distinct from 'list'
 or p_evidence#>'{transfers,has_more}' is distinct from 'false'::jsonb
 or jsonb_typeof(p_evidence#>'{transfers,data}') is distinct from 'array'
 or p_evidence#>>'{transfers,source_transaction}' is distinct from v_entry->>'chargeId'
 then raise exception 'HISTORICAL_EXTERNAL_EVIDENCE_INVALID'; end if;
 if lower(v_payment->>'currency') is distinct from 'usd'
 or v_payment->>'provider_payment_id' is distinct from (case when v_is_transfer then v_entry else v_plan->1 end)#>>'{source,paymentIntentId}'
 or v_payment->>'id' is distinct from (case when v_is_transfer then v_entry else v_plan->1 end)#>>'{source,paymentId}'
 or (v_payment->>'provider_net_amount')::numeric is distinct from (case when v_is_transfer then 540 else 45 end)
 or (v_payment->>'refunded_amount')::numeric is distinct from 0::numeric
 or v_payment->>'paid_at' is null
 or v_payment->>'provider_id' is distinct from v_entry#>>'{params,metadata,professional_id}'
 then raise exception 'HISTORICAL_PAYMENT_CONFLICT'; end if;

 if v_is_transfer then
   v_transfer:=p_evidence#>'{transfers,data,0}';
   if jsonb_array_length(p_evidence#>'{transfers,data}')<>1
   or v_transfer->>'object' is distinct from 'transfer'
   or v_transfer->>'id' is distinct from 'tr_3U4IGSIEn05DVPjv00L0GaMI'
   or v_transfer->'amount' is distinct from '54000'::jsonb
   or v_transfer->>'currency' is distinct from 'usd'
   or v_transfer->>'source_transaction' is distinct from v_entry->>'chargeId'
   or v_transfer->>'destination' is distinct from 'acct_1U406yRAhnBdm5Ow'
   or v_transfer->'livemode' is distinct from 'false'::jsonb
   or v_transfer->'reversed' is distinct from 'false'::jsonb
   or v_transfer->'amount_reversed' is distinct from '0'::jsonb
   or v_charge->'refunded' is distinct from 'false'::jsonb
   or v_charge->'amount_refunded' is distinct from '0'::jsonb
   or (v_charge->>'amount')::numeric is distinct from (v_payment->>'customer_total_amount')::numeric*100
   or (v_charge->>'amount')::numeric<54000
   or v_payment->>'status' is distinct from 'ready_for_payout'
   or v_payment->>'stripe_transfer_id' is not null or v_payment->>'released_at' is not null
   then raise exception 'HISTORICAL_TRANSFER_CONFLICT'; end if;
   v_external_time:=to_timestamp((v_transfer->>'created')::bigint);
   if v_external_time is null or v_external_time<to_timestamp((v_charge->>'created')::bigint)
   or v_external_time>(p_evidence->>'observed_at')::timestamptz
   or v_external_time>=(v_before#>>'{steps,0,created_at}')::timestamptz
   then raise exception 'HISTORICAL_TRANSFER_TIME_CONFLICT'; end if;
   perform pg_advisory_xact_lock(hashtextextended(v_transfer->>'id',0));
   if exists(select 1 from public.job_financial_steps where receipt->>'id'=v_transfer->>'id')
   or exists(select 1 from public.payments where stripe_transfer_id=v_transfer->>'id')
   or exists(select 1 from public.change_orders where stripe_transfer_id=v_transfer->>'id')
   or exists(select 1 from public.payment_reassignment_funding_sources where stripe_transfer_id=v_transfer->>'id')
   then raise exception 'HISTORICAL_TRANSFER_ALREADY_USED'; end if;
   v_receipt:=jsonb_build_object('id',v_transfer->>'id','status','succeeded','amount',54000,'currency','usd',
     'kind','transfer','charge_id',v_entry->>'chargeId','direction','to_provider','origin',v_entry->>'origin',
     'destination',v_entry->'destination','source',v_entry->'source');
   if not public.financial_receipt_matches(v_entry,v_receipt) then raise exception 'HISTORICAL_RECEIPT_CONFLICT'; end if;
   update public.job_financial_steps set receipt=v_receipt,confirmed_at=v_external_time where id=v_step;
   update public.payments set status='paid_out',stripe_transfer_id=v_transfer->>'id',released_at=v_external_time,
     last_release_error=null,updated_at=v_time where id=(v_payment->>'id')::uuid;
   update public.job_financial_resolutions set state='settled' where request_id=p_request_id;
   v_after:=public.historical_release_snapshot(p_request_id);
   v_outcome:='adopted_existing_transfer';
 else
   v_co:=v_before#>'{change_orders,0}'; v_refund:=p_evidence->'refund'; v_base:=p_evidence->'base_transfer';
   if v_co->>'id' is distinct from '110b2353-d119-48db-9c43-820fe192cc8a'
   or v_co->>'payment_status' is distinct from 'paid' or v_co->>'paid_at' is null
   or v_co->>'stripe_payment_intent_id' is distinct from v_entry#>>'{source,paymentIntentId}'
   or (v_co->>'additional_customer_total_amount')::numeric is distinct from 52.5
   or (v_co->>'additional_amount')::numeric is distinct from 50::numeric
   or (v_co->>'additional_provider_net_amount')::numeric is distinct from 45::numeric
   or v_co->>'stripe_transfer_id' is not null or v_co->>'released_at' is not null
   or (v_co->>'refunded_amount')::numeric is distinct from 0::numeric
   or v_co->>'stripe_refund_id' is not null or v_co->>'refunded_at' is not null
   or jsonb_array_length(p_evidence#>'{transfers,data}')<>0
   or v_charge->'refunded' is distinct from 'true'::jsonb
   or v_charge->'amount' is distinct from '5250'::jsonb or v_charge->'amount_refunded' is distinct from '5250'::jsonb
   or v_refund->>'object' is distinct from 'refund'
   or v_refund->>'id' is distinct from 're_3UC5VNIEn05DVPjv1MUPgfdG'
   or v_refund->>'status' is distinct from 'succeeded' or v_refund->'amount' is distinct from '5250'::jsonb
   or v_refund->>'currency' is distinct from 'usd' or v_refund->>'charge' is distinct from v_entry->>'chargeId'
   or v_refund->>'payment_intent' is distinct from v_entry#>>'{source,paymentIntentId}'
   or v_payment->>'status' is distinct from 'paid_out'
   or v_payment->>'stripe_transfer_id' is distinct from 'tr_3UC46SIEn05DVPjv09Pndce0'
   or v_payment->>'released_at' is null
   or v_base->>'id' is distinct from v_payment->>'stripe_transfer_id' or v_base->>'object' is distinct from 'transfer'
   or v_base->'amount' is distinct from '4500'::jsonb or v_base->>'currency' is distinct from 'usd'
   or v_base->>'source_transaction' is distinct from v_plan#>>'{1,chargeId}'
   or v_base->>'destination' is distinct from v_plan#>>'{1,destination}'
   or v_base->'livemode' is distinct from 'false'::jsonb or v_base->'reversed' is distinct from 'false'::jsonb
   or v_base->'amount_reversed' is distinct from '0'::jsonb
   then raise exception 'HISTORICAL_REFUND_CONFLICT'; end if;
   v_external_time:=to_timestamp((v_refund->>'created')::bigint);
   -- The dashboard timezone must be supplied from the reviewed export/UI;
   -- never infer it from the workstation. Preserve Stripe's exact Unix seconds.
   if not exists(select 1 from pg_timezone_names where name=p_evidence->>'refund_display_timezone')
   then raise exception 'HISTORICAL_REFUND_TIMEZONE_REQUIRED'; end if;
   if v_external_time is null
   or date_trunc('minute',v_external_time at time zone (p_evidence->>'refund_display_timezone'))
      is distinct from timestamp '2026-09-04 22:22:00'
   or v_external_time<to_timestamp((v_charge->>'created')::bigint)
   or v_external_time>(p_evidence->>'observed_at')::timestamptz
   or v_external_time>=(v_before#>>'{steps,0,created_at}')::timestamptz
   then raise exception 'HISTORICAL_REFUND_TIME_CONFLICT'; end if;
   perform pg_advisory_xact_lock(hashtextextended(v_refund->>'id',0));
   if exists(select 1 from public.job_financial_steps where receipt->>'id'=v_refund->>'id')
   or exists(select 1 from public.change_orders where stripe_refund_id=v_refund->>'id')
   then raise exception 'HISTORICAL_REFUND_ALREADY_USED'; end if;
   -- Existing application paths reject reconciliation_required before recovery.
   -- Audit outcome means retired, not that the invalid transfer plan executed.
   update public.job_financial_resolutions set state='reconciliation_required' where request_id=p_request_id;
   v_after:=public.historical_release_snapshot(p_request_id);
   v_after:=jsonb_set(v_after,'{change_orders,0}',v_co||jsonb_build_object(
     'refunded_amount',52.50,'stripe_refund_id',v_refund->>'id','refunded_at',v_external_time,'updated_at',v_time));
   v_outcome:='retired_invalid_plan';
 end if;
 insert into public.historical_release_reconciliations(request_id,outcome,evidence,before_state,after_state)
 values(p_request_id,v_outcome,p_evidence,v_before,v_after);
 if not v_is_transfer then
   update public.change_orders set refunded_amount=52.50,stripe_refund_id=v_refund->>'id',
     refunded_at=v_external_time,updated_at=v_time where id='110b2353-d119-48db-9c43-820fe192cc8a';
 end if;
 if public.historical_release_snapshot(p_request_id) is distinct from v_after then
   raise exception 'HISTORICAL_PROJECTION_CONFLICT'; end if;
 return jsonb_build_object('reconciled',true,'already_applied',false,'outcome',v_outcome);
end $$;

create or replace function public.co_guard_refund_projection() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and
    (new.refunded_amount,new.stripe_refund_id,new.refunded_at) is not distinct from
    (old.refunded_amount,old.stripe_refund_id,old.refunded_at) then return new; end if;
  if tg_op='INSERT' and new.refunded_amount=0 and new.stripe_refund_id is null and new.refunded_at is null then return new; end if;
  if tg_op='UPDATE' and old.stripe_refund_id is not null then raise exception 'CHANGE_ORDER_REFUND_IMMUTABLE'; end if;
  -- Narrow additive exception: immutable operator reconciliation, exact old/new
  -- full row snapshots. No session flag, general bypass or synthetic plan step.
  if tg_op='UPDATE' and new.id='110b2353-d119-48db-9c43-820fe192cc8a'::uuid
    and new.request_id='059532b3-2572-426a-a3d9-7c99a65193e9'::uuid
    and exists(select 1 from public.historical_release_reconciliations a
      join public.job_financial_resolutions r on r.request_id=a.request_id
      where a.request_id=new.request_id and a.outcome='retired_invalid_plan'
        and r.state='reconciliation_required'
        and a.before_state#>'{change_orders,0}'=to_jsonb(old)
        and a.after_state#>'{change_orders,0}'=to_jsonb(new)) then return new; end if;
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


revoke all on function public.historical_release_snapshot(uuid),public.historical_release_expected_plan(uuid),
 public.guard_historical_release_history(),public.reconcile_historical_release_20260927(uuid,jsonb)
 from public,anon,authenticated,service_role;
commit;
