-- LOCAL PROPOSAL ONLY. Do not run against operational Supabase.
-- Reverse stage 2 BEFORE stage 1. Stop all payment/lifecycle writers first.
begin;
lock table public.service_requests in access exclusive mode;
lock table public.job_financial_resolutions,public.job_financial_steps,public.change_orders in access exclusive mode;
lock table public.job_claims,public.payment_reassignments in access exclusive mode;
do $$ declare v_original record; begin
  if exists(select 1 from public.job_financial_resolutions) or exists(select 1 from public.job_financial_steps)
    or exists(select 1 from public.change_orders where payment_reservation_id is not null or stripe_payment_evidence is not null or stripe_payment_verified_at is not null)
    or exists(select 1 from public.job_claims where co_no_settlement_resolution is not null) then
    raise exception 'ROLLBACK_BLOCKED: preserve financial reservations/evidence; reviewed forward migration required';
  end if;
  if exists(select 1 from public.co_stage2_function_backup b where b.installed_definition is distinct from
    (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=b.name)) then
    raise exception 'ROLLBACK_BLOCKED: an RPC changed after stage 2; review before restoring it';
  end if;
  for v_original in select definition from public.co_stage2_function_backup order by name loop
    execute v_original.definition;
  end loop;
end $$;
drop trigger co_guard_job_lifecycle on public.service_requests;
drop trigger co_guard_change_order on public.change_orders;
drop trigger co_guard_claim on public.job_claims;
drop trigger co_guard_reassignment on public.payment_reassignments;
drop function public.apply_job_financial_update(uuid,text,jsonb);
drop function public.record_job_financial_step(uuid,text,jsonb);
drop function public.reserve_job_financial_step(uuid,text,text,text,jsonb);
drop function public.reserve_job_financial_resolution(uuid,text,jsonb);
drop function if exists public.read_job_financial_resolution(uuid,text);
drop function public.co_guard_job_lifecycle();
drop function public.co_guard_child_lifecycle();
drop function public.guard_job_reassignment(uuid);
drop function public.co_assert_job_operation(uuid,text);
drop function public.co_claim_blocks_finance(uuid);
drop function public.co_has_unresolved_payment(uuid);
drop function public.settle_job_financial_resolution(uuid,text);
drop function public.financial_receipt_matches(jsonb,jsonb);
drop function public.co_lock_job(uuid);
drop table public.job_financial_steps;
drop table public.job_financial_resolutions;
drop table public.co_stage2_function_backup;
alter table public.job_claims drop column co_no_settlement_resolution;
commit;
