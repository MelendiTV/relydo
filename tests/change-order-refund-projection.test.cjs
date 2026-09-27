/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS Node test harness; VM dependencies are explicitly isolated. */
// Isolated PostgreSQL in memory. No credentials, network or Stripe operations.
const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.RELYDO_PGLITE_MODULE||'@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202609150002_change_order_lifecycle_guard.sql'),'utf8');
const job='00000000-0000-4000-8000-000000000001',co='00000000-0000-4000-8000-000000000002',customer='00000000-0000-4000-8000-000000000003',provider='00000000-0000-4000-8000-000000000004',claim='00000000-0000-4000-8000-000000000005';
let pg;
const call=async(name,args)=> (await pg.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') r',args)).rows[0].r;
const reserve=(owner='automatic_release',decision={})=>call('reserve_job_financial_resolution',[job,owner,JSON.stringify(decision)]);
const params=(amount=1800)=>({amount,currency:'usd',destination:'acct_fake',source_transaction:'ch_fake',metadata:{request_id:job}});
const makeClaim=()=>pg.query("insert into public.job_claims(id,request_id,status) values($1,$2,'reviewing')",[claim,job]);
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
 await pg.exec(`create function auth.uid() returns uuid language sql as 'select null::uuid';
 alter table public.service_requests add column completion_review_status text,add column completion_approved_at timestamptz,add column completed_at timestamptz,add column cancelled_at timestamptz,add column cancellation_reason text;
 alter table public.job_claims add column resolution_type text,add column provider_award_amount numeric,add column customer_refund_amount numeric;
 create table public.payment_reassignments(id uuid primary key default gen_random_uuid(),request_id uuid,status text);`);
 await pg.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202609150001_change_order_payment_foundation.sql'),'utf8'));
 // Minimal legacy bodies exercise wrapper signatures and original behavior.
 // Full Supabase RPC bodies/other triggers still need integration testing.
 for(const name of ['cancel_job','release_job_by_provider','complete_job','approve_job_completion','submit_job_for_completion_review','prepare_payment_reassignment','update_job_stage','create_customer_claim_secure']) {
  const action=name==='cancel_job'?"update public.service_requests set status='cancelled' where id=p_request_id;":name==='release_job_by_provider'?"update public.service_requests set preferred_provider_id=null,status='open' where id=p_request_id;":['complete_job','approve_job_completion','submit_job_for_completion_review'].includes(name)?"update public.service_requests set status='completed' where id=p_request_id;":'null;';
  await pg.exec('create function public.'+name+'(p_request_id uuid) returns void language plpgsql security definer as $$ begin '+action+' end $$');
 }
 for(const name of ['cleanup_failed_change_order','respond_to_change_order']) await pg.exec('create function public.'+name+'(p_change_order_id uuid) returns void language plpgsql security definer as $$ begin null; end $$');
 await pg.exec('create function public.finalize_payment_reassignment(p_reassignment_id uuid) returns void language plpgsql security definer as $$ begin null; end $$');
 await pg.exec(migration);
 await pg.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202609270001_change_order_refund_projection.sql'),'utf8'));
 // Ordinary refund paths must still work with the historical-only exception installed.
 await pg.exec(`create table public.payments(id uuid primary key,request_id uuid);
   create table public.payment_reassignment_funding_sources(id uuid primary key,request_id uuid,stripe_transfer_id text);`);
 await pg.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202609270002_historical_release_reconciliation.sql'),'utf8'));
});
beforeEach(async()=>{
 await pg.exec("reset role;set request.jwt.claim.role='service_role';truncate public.job_financial_steps,public.job_financial_resolutions,public.change_orders,public.job_claims,public.payment_reassignments,public.service_requests cascade;");
 await pg.query("insert into public.service_requests(id,customer_id,preferred_provider_id,status,job_stage) values($1,$2,$3,'in_progress','working')",[job,customer,provider]);
 await pg.query("insert into public.change_orders(id,request_id,customer_id,provider_id,original_amount,additional_amount,new_total_amount,status) values($1,$2,$3,$4,50,20,70,'accepted')",[co,job,customer,provider]);
});
after(async()=>{await pg?.close();});


const plan = () => ['a','b'].map((key,i)=>({key,kind:'transfer',direction:'to_provider',chargeId:'ch_'+key,origin:'ch_'+key,currency:'usd',destination:'acct_fake',source:{paymentIntentId:'pi_'+key,paymentId:null,changeOrderId:null,fundingSourceId:null},params:{...params(1000+i),source_transaction:'ch_'+key}}));
const allocate = e=>call('reserve_job_financial_step',[job,'claim:'+claim,e.kind,e.chargeId,JSON.stringify(e.params)]);
const finalReceipt=e=>({id:'tr_'+e.key,status:'succeeded',amount:e.params.amount,currency:e.currency,kind:e.kind,charge_id:e.chargeId,direction:e.direction,origin:e.origin,destination:e.destination,source:e.source});
const confirm=async(e)=>{const s=await allocate(e);await call('record_job_financial_step',[s.id,'claim:'+claim,JSON.stringify(finalReceipt(e))]);return s;};
const settle=()=>call('settle_job_financial_resolution',[job,'claim:'+claim]);
const co2='00000000-0000-4000-8000-000000000006';
function coInstruction(id=co,kind='transfer') {
 const e=plan()[0]; e.key=id+':'+kind;e.source.changeOrderId=id;e.source.paymentIntentId='pi_'+id;
 e.chargeId='ch_'+id;e.origin=e.chargeId;e.params.source_transaction=e.chargeId;
 e.params.metadata.change_order_id=id;
 if(kind==='refund') {
  e.kind='refund';e.direction='to_customer';e.destination=null;
  e.params={amount:1000,payment_intent:e.source.paymentIntentId,metadata:{request_id:job,change_order_id:id}};
 }
 return e;
}
async function openCoPlan(p=[coInstruction()],action='pay_provider') {
 const fund=()=>pg.exec("update public.change_orders set payment_status='paid',stripe_payment_intent_id='pi_'||id::text,paid_at=now(),additional_customer_total_amount=21,additional_provider_net_amount=18 where payment_status='unpaid'");
 await fund();
 if(p.some(e=>e.source.changeOrderId===co2))await pg.query("insert into public.change_orders(id,request_id,customer_id,provider_id,original_amount,additional_amount,new_total_amount,status) values($1,$2,$3,$4,50,20,70,'accepted')",[co2,job,customer,provider]);
 await fund();await pg.exec("update public.service_requests set status='completed'");await makeClaim();
 await reserve('claim:'+claim,{action,providerAwardAmount:p.filter(e=>e.kind==='transfer').reduce((n,e)=>n+e.params.amount,0)/100,customerRefundAmount:p.filter(e=>e.kind==='refund').reduce((n,e)=>n+e.params.amount,0)/100,plan:p});return p;
}
const coRow=async(id=co)=>(await pg.query('select * from public.change_orders where id=$1',[id])).rows[0];

for(const cents of [1000,2100])test(`CO refund ${cents}: atomic projection, funding history and exact retry`,async()=>{
 const e=coInstruction(co,'refund');e.params.amount=cents;
 await openCoPlan([e],'refund_customer');const before=await coRow();
 const s=await confirm(e);const row=await coRow();
 assert.equal(Number(row.refunded_amount),cents/100);assert.equal(row.stripe_refund_id,finalReceipt(e).id);
 assert.deepEqual(row.refunded_at,(await pg.query('select confirmed_at from public.job_financial_steps where id=$1',[s.id])).rows[0].confirmed_at);
 assert.equal(row.payment_status,'paid');assert.deepEqual(row.paid_at,before.paid_at);
 assert.equal(row.stripe_payment_intent_id,before.stripe_payment_intent_id);
 assert.equal(row.stripe_transfer_id,null);assert.equal(row.released_at,null);
 await confirm(e);await settle();assert.deepEqual(await coRow(),row);
 await assert.rejects(pg.exec('update public.change_orders set refunded_amount=0,stripe_refund_id=null,refunded_at=null'),/IMMUTABLE/);
});

test('partial split preserves both receipts and projects refund before final closure',async()=>{
 const p=await openCoPlan([coInstruction(),coInstruction(co,'refund')],'partial');
 await confirm(p[1]);assert.equal(Number((await coRow()).refunded_amount),10);
 await assert.rejects(settle(),/INCOMPLETE/);
 await confirm(p[0]);await settle();const row=await coRow();
 assert.equal(row.stripe_transfer_id,finalReceipt(p[0]).id);assert.equal(row.stripe_refund_id,finalReceipt(p[1]).id);
});

test('projection failure rolls back receipt; exact retry repairs without changing plan',async()=>{
 const [e]=await openCoPlan([coInstruction(co,'refund')],'refund_customer');const s=await allocate(e);
 await pg.exec("create function public.fail_refund_projection() returns trigger language plpgsql as $$ begin raise exception 'projection unavailable'; end $$;create trigger fail_refund_projection before update on public.change_orders for each row execute function public.fail_refund_projection()");
 try {
  await assert.rejects(confirm(e),/projection unavailable/);
  assert.equal((await pg.query('select receipt from public.job_financial_steps where id=$1',[s.id])).rows[0].receipt,null);
  assert.equal(Number((await coRow()).refunded_amount),0);await assert.rejects(settle(),/INCOMPLETE/);
 } finally { await pg.exec('drop trigger fail_refund_projection on public.change_orders;drop function public.fail_refund_projection()'); }
 await confirm(e);await settle();assert.equal((await coRow()).stripe_refund_id,finalReceipt(e).id);
});

test('unconfirmed or forged refund cannot change CO refund state',async()=>{
 const [e]=await openCoPlan([coInstruction(co,'refund')],'refund_customer');const s=await allocate(e);
 await assert.rejects(call('record_job_financial_step',[s.id,'claim:'+claim,JSON.stringify({...finalReceipt(e),status:'pending'})]),/INVALID_FINANCIAL_RECEIPT/);
 await assert.rejects(pg.exec("update public.change_orders set refunded_amount=10,stripe_refund_id='fake',refunded_at=now()"),/RECEIPT_REQUIRED/);
 assert.equal(Number((await coRow()).refunded_amount),0);
});
