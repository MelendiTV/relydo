// Real PostgreSQL (PGlite) in memory. No .env, network or financial APIs.
// Install PGlite separately, then set RELYDO_PGLITE_MODULE to its module path.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS Node harness running PostgreSQL in memory. */
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.RELYDO_PGLITE_MODULE || '@electric-sql/pglite');
const migration = fs.readFileSync(path.join(__dirname,'../supabase/migrations/202609150001_change_order_payment_foundation.sql'),'utf8');
const rollback = fs.readFileSync(path.join(__dirname,'../supabase/rollback/202609150001_change_order_payment_foundation.sql'),'utf8');
const job='00000000-0000-4000-8000-000000000001', co='00000000-0000-4000-8000-000000000002';
const customer='00000000-0000-4000-8000-000000000003', provider='00000000-0000-4000-8000-000000000004';
const metadata={payment_type:'change_order',payment_flow:'payment_sheet',change_order_id:co,request_id:job,customer_id:customer,provider_id:provider,
  original_amount:'50.00',additional_amount:'20.00',new_total_amount:'70.00',customer_fee_percent:'5.00',customer_fee_amount:'1.00',
  customer_total_amount:'21.00',provider_commission_percent:'10.00',provider_commission_amount:'2.00',provider_net_amount:'18.00',platform_revenue_amount:'3.00'};
const payload={metadata,currency:'usd',params:{amount:2100,currency:'usd',metadata},amounts:{customerTotalAmount:21}};
const evidence=()=>({metadata:{...metadata},payment_intent_id:'pi_test',session_id:null,reservation_id:null,charge_id:'ch_test',status:'succeeded',currency:'usd',amount_received:2100,paid_at:'2026-09-15T00:00:00Z'});
let pg;
async function row(){return (await pg.query('select * from public.change_orders where id=$1',[co])).rows[0];}
async function reserve(flow='payment_sheet',data=payload){return (await pg.query('select public.reserve_change_order_payment($1,$2,$3,$4::jsonb) as r',[co,customer,flow,data==null?null:JSON.stringify(data)])).rows[0].r;}
async function confirm(e=evidence()){return (await pg.query('select public.confirm_change_order_payment($1,$2::jsonb) as r',[co,JSON.stringify(e)])).rows[0].r;}
async function attach(id,session=null,pi='pi_test'){return (await pg.query('select public.attach_change_order_payment($1,$2,$3,$4,$5) as r',[co,customer,id,session,pi])).rows[0].r;}
before(async()=>{
  pg=new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.role() returns text language sql as 'select current_setting(''request.jwt.claim.role'',true)';
    grant usage on schema public,auth to anon,authenticated,service_role;
    create table public.service_requests(id uuid primary key,customer_id uuid,preferred_provider_id uuid,status text,job_stage text);
    create table public.job_claims(id uuid primary key default gen_random_uuid(),request_id uuid,status text);
    create table public.change_orders(
      id uuid primary key,request_id uuid not null references public.service_requests(id) on delete cascade,
      customer_id uuid not null,provider_id uuid not null,original_amount numeric not null,additional_amount numeric not null,new_total_amount numeric not null,
      status text not null,payment_status text not null default 'unpaid',stripe_checkout_session_id text,stripe_payment_intent_id text,
      updated_at timestamptz not null default now(),paid_at timestamptz,
      additional_customer_fee_percent numeric(10,2),additional_customer_fee_amount numeric(12,2),additional_customer_total_amount numeric(12,2),
      additional_provider_commission_percent numeric(10,2),additional_provider_commission_amount numeric(12,2),
      additional_provider_net_amount numeric(12,2),additional_platform_revenue_amount numeric(12,2),stripe_transfer_id text,released_at timestamptz);
    create unique index change_orders_stripe_checkout_session_unique on public.change_orders(stripe_checkout_session_id) where stripe_checkout_session_id is not null;
  `);
  await pg.exec(migration);
});
beforeEach(async()=>{
  await pg.exec("reset role; set request.jwt.claim.role='service_role'; truncate public.change_orders,public.job_claims,public.service_requests cascade;");
  await pg.query('insert into public.service_requests values($1,$2,$3,$4,$5)',[job,customer,provider,'in_progress','working']);
  await pg.query('insert into public.change_orders(id,request_id,customer_id,provider_id,original_amount,additional_amount,new_total_amount,status) values($1,$2,$3,$4,50,20,70,$5)',[co,job,customer,provider,'accepted']);
});
after(async()=>{await pg?.close();});

test('SQL: reservation is persistent and repeated requests return the same id/payload',async()=>{
  const first=await reserve();const second=await reserve('payment_sheet',{...payload,currency:'eur'});
  assert.deepEqual(second.reservation,first.reservation);assert.equal((await row()).payment_status,'unpaid');assert.equal((await row()).paid_at,null);
});
test('SQL: web and mobile cannot reserve separate channels',async()=>{await reserve();await assert.rejects(reserve('checkout'),/PAYMENT_CHANNEL_RESERVED/);});
test('SQL: null payload probes without creating a reservation',async()=>{assert.equal((await reserve('checkout',null)).outcome,'needs_payload');assert.equal((await row()).payment_reservation_id,null);});
test('SQL: malformed reservation shape cannot bypass CHECK through SQL NULL',async()=>{
  await assert.rejects(pg.exec(`update public.change_orders set payment_reservation_id=gen_random_uuid(),payment_reservation_created_at=now(),payment_reservation_payload='{}'`),/co_payment_reservation_complete/);
});
test('SQL: immutable budget is checked when reserving',async()=>{await assert.rejects(reserve('payment_sheet',{...payload,metadata:{...metadata,additional_amount:'99'}}),/PAYMENT_SNAPSHOT_MISMATCH/);});
test('SQL: legacy identifiers block fresh creation even when their state is unknown',async()=>{
  await pg.exec("update public.change_orders set stripe_checkout_session_id='cs_old'");assert.equal((await reserve()).outcome,'legacy');assert.equal((await row()).payment_reservation_id,null);
});
test('SQL: attach saves one reference and refuses a different one',async()=>{
  const r=await reserve();assert.deepEqual(await attach(r.reservation.id),{attached:true,allowed:true});await assert.rejects(attach(r.reservation.id,null,'pi_other'),/STRIPE_REFERENCE_CONFLICT/);
});
test('SQL: attach retains reference but refuses payment exposure after cancellation',async()=>{
  const r=await reserve();await pg.exec("update public.service_requests set status='cancelled'");assert.equal((await attach(r.reservation.id)).allowed,false);assert.equal((await row()).stripe_payment_intent_id,'pi_test');
});
test('SQL: only the reservation owner/channel can attach',async()=>{
  const r=await reserve();await assert.rejects(attach(job),/PAYMENT_RESERVATION_MISMATCH/);await assert.rejects(attach(r.reservation.id,'cs_wrong',null),/INVALID_STRIPE_REFERENCE/);
});
test('SQL: confirmation atomically persists evidence, snapshot and paid status',async()=>{
  const r=await reserve();const e={...evidence(),reservation_id:r.reservation.id};assert.equal((await confirm(e)).outcome,'paid');
  const saved=await row();assert.equal(saved.payment_status,'paid');assert.equal(Number(saved.additional_provider_net_amount),18);assert.equal(saved.stripe_payment_evidence.charge_id,'ch_test');assert.ok(saved.stripe_payment_verified_at);assert.equal(saved.stripe_transfer_id,null);assert.equal(saved.released_at,null);
});
test('SQL: repeated successful confirmation does not rewrite historical paid_at/updated_at',async()=>{
  await confirm();const saved=await row();assert.equal((await confirm()).already_paid,true);assert.deepEqual(await row(),saved);
});
test('SQL: incorrect reservation or currency never confirms',async()=>{
  const r=await reserve();await assert.rejects(confirm(),/PAYMENT_RESERVATION_MISMATCH/);await assert.rejects(confirm({...evidence(),reservation_id:r.reservation.id,currency:'eur'}),/PAYMENT_RESERVATION_MISMATCH/);
});
test('SQL: existing historical paid mobile with expired web id is unchanged, even on cancelled job',async()=>{
  await pg.exec("update public.change_orders set payment_status='paid',stripe_payment_intent_id='pi_test',stripe_checkout_session_id='cs_expired',stripe_transfer_id='tr_historical',released_at=now(); update public.service_requests set status='cancelled';");
  const before=await row();assert.equal((await confirm()).already_paid,true);assert.deepEqual(await row(),before);
});
for(const kind of ['cancelled','provider','claim','rejected'])test(`SQL: ${kind} conflict keeps evidence but not local paid status`,async()=>{
  if(kind==='cancelled')await pg.exec("update public.service_requests set status='cancelled'");
  if(kind==='provider')await pg.exec('update public.service_requests set preferred_provider_id=null');
  if(kind==='claim')await pg.query("insert into public.job_claims(request_id,status) values($1,'resolved')",[job]);
  if(kind==='rejected')await pg.exec("update public.change_orders set status='rejected'");
  assert.equal((await confirm()).outcome,'reconciliation_required');const saved=await row();assert.equal(saved.payment_status,'unpaid');assert.ok(saved.stripe_payment_evidence);assert.equal(saved.paid_at,null);
});
test('SQL: completed job with no claim permits late confirmation',async()=>{await pg.exec("update public.service_requests set status='completed'");assert.equal((await confirm()).outcome,'paid');});
test('SQL: changed budget after application read is rejected inside the transaction',async()=>{
  await pg.exec('update public.change_orders set additional_amount=30,new_total_amount=80');await assert.rejects(confirm(),/PAYMENT_EVIDENCE_MISMATCH/);assert.equal((await row()).stripe_payment_evidence,null);
});
test('SQL: malformed financial evidence cannot mark paid',async()=>{
  const e=evidence();delete e.metadata.provider_net_amount;await assert.rejects(confirm(e),/PAYMENT_AMOUNT_MISMATCH/);assert.equal((await row()).stripe_payment_evidence,null);
});
test('SQL: duplicate PaymentIntent on another row aborts without partial evidence',async()=>{
  await pg.query("insert into public.change_orders(id,request_id,customer_id,provider_id,original_amount,additional_amount,new_total_amount,status,stripe_payment_intent_id) values($1,$2,$3,$4,50,20,70,'accepted','pi_test')",['00000000-0000-4000-8000-000000000099',job,customer,provider]);
  await assert.rejects(confirm(),/co_payment_intent_unique/);assert.equal((await row()).stripe_payment_evidence,null);assert.equal((await row()).payment_status,'unpaid');
});
test('SQL: a failure in final UPDATE rolls back the evidence UPDATE too',async()=>{
  await pg.exec("alter table public.change_orders add constraint test_reject_paid check(payment_status <> 'paid')");
  try{await assert.rejects(confirm(),/test_reject_paid/);assert.equal((await row()).stripe_payment_evidence,null);assert.equal((await row()).stripe_payment_intent_id,null);}finally{await pg.exec('alter table public.change_orders drop constraint test_reject_paid');}
});
test('SQL: anon/authenticated lack EXECUTE even when claiming service role',async()=>{
  for(const role of ['anon','authenticated']){
    await pg.exec(`set role ${role}`);await assert.rejects(reserve(),/permission denied/);await assert.rejects(confirm(),/permission denied/);await pg.exec('reset role');
  }
});
test('SQL: service_role can execute; definer still rejects missing auth role',async()=>{
  await pg.exec('set role service_role');assert.equal((await reserve()).outcome,'reserved');await pg.exec("reset role; set request.jwt.claim.role='authenticated'");await assert.rejects(confirm(),/SERVICE_ROLE_REQUIRED/);
});
test('SQL: rollback refuses to discard a used reservation',async()=>{
  await reserve();await assert.rejects(pg.exec(rollback),/ROLLBACK_BLOCKED/);await pg.exec('rollback');assert.ok((await row()).payment_reservation_id);
});
test('SQL: unused migration rolls back without changing preexisting rows; can reapply',async()=>{
  const original=await row();await pg.exec(rollback);const saved=await row();for(const k of Object.keys(saved))assert.deepEqual(saved[k],original[k]);await pg.exec(migration);
});
