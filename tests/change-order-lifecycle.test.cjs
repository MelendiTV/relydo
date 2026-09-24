/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS Node test harness; VM dependencies are explicitly isolated. */
// Isolated PostgreSQL in memory. No credentials, network or Stripe operations.
const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.RELYDO_PGLITE_MODULE||'@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202609150002_change_order_lifecycle_guard.sql'),'utf8');
const rollback=fs.readFileSync(path.join(__dirname,'../supabase/rollback/202609150002_change_order_lifecycle_guard.sql'),'utf8');
const job='00000000-0000-4000-8000-000000000001',co='00000000-0000-4000-8000-000000000002',customer='00000000-0000-4000-8000-000000000003',provider='00000000-0000-4000-8000-000000000004',claim='00000000-0000-4000-8000-000000000005';
let pg;
const call=async(name,args)=> (await pg.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') r',args)).rows[0].r;
const reserve=(owner='automatic_release',decision={})=>call('reserve_job_financial_resolution',[job,owner,JSON.stringify(decision)]);
const params=(amount=1800)=>({amount,currency:'usd',destination:'acct_fake',source_transaction:'ch_fake',metadata:{request_id:job}});
const step=(owner='automatic_release',kind='transfer',p=params())=>call('reserve_job_financial_step',[job,owner,kind,'ch_fake',JSON.stringify(p)]);
const receipt=(id,owner='automatic_release')=>call('record_job_financial_step',[id,owner,JSON.stringify({id:'tr_fake',amount:1800,currency:'usd',status:'succeeded'})]);
const paid=(complete=true)=>pg.exec("update public.change_orders set payment_status='paid',stripe_payment_intent_id='pi_fake',paid_at=now(),additional_customer_total_amount=21,additional_provider_net_amount=18"+(complete?"; update public.service_requests set status='completed'":""));
const makeClaim=()=>pg.query("insert into public.job_claims(id,request_id,status) values($1,$2,'reviewing')",[claim,job]);
const vm=require('node:vm'),ts=require('typescript');
const compiled=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../app/lib/jobFinancialGuard.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const helperModule={exports:{}};
vm.runInNewContext(compiled,{exports:helperModule.exports,module:helperModule,require(name){throw Error('Unexpected runtime dependency: '+name);},Date,Number,Error});
const {financialStripe,reserveJobResolution}=helperModule.exports;
function fakeClient({saveFails=false,legacy=false,pendingRefund=false,listFails=false}={}) {
 const transfers=[],refunds=[];let creates=0;
 const stripe={
  paymentIntents:{retrieve:async()=>({latest_charge:'ch_fake'})},
  transfers:{list:async()=>{if(listFails)throw Error('offline');return {has_more:false,data:legacy?[{id:'tr_old',source_transaction:'ch_fake',metadata:{},amount:1800}]:transfers};},create:async(p)=>{creates++;const obj={...p,id:'tr_new',amount_reversed:0};transfers.push(obj);return obj;}},
  refunds:{list:async()=>({has_more:false,data:refunds}),create:async(p)=>{creates++;const obj={...p,id:'re_new',currency:'usd',status:pendingRefund?'pending':'succeeded'};refunds.push(obj);return obj;}}
 };
 const db={rpc:async(name,args)=>{if(name==='record_job_financial_step'&&saveFails)return {error:{message:'save failure'},data:null};try{return {data:await call(name,Object.values(args)),error:null};}catch(e){return {data:null,error:{message:e.message}};}}};
 return {run:financialStripe(stripe,db,'automatic_release'),db,stripe,get creates(){return creates;},transfers,refunds,setSaveFails(v){saveFails=v;}};
}
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
});
beforeEach(async()=>{
 await pg.exec("reset role;set request.jwt.claim.role='service_role';truncate public.job_financial_steps,public.job_financial_resolutions,public.change_orders,public.job_claims,public.payment_reassignments,public.service_requests cascade;");
 await pg.query("insert into public.service_requests(id,customer_id,preferred_provider_id,status,job_stage) values($1,$2,$3,'in_progress','working')",[job,customer,provider]);
 await pg.query("insert into public.change_orders(id,request_id,customer_id,provider_id,original_amount,additional_amount,new_total_amount,status) values($1,$2,$3,$4,50,20,70,'accepted')",[co,job,customer,provider]);
});
after(async()=>{await pg?.close();});

test('integration: rollback 001 refuses while 002 is installed',async()=>{
 const first=fs.readFileSync(path.join(__dirname,'../supabase/rollback/202609150001_change_order_payment_foundation.sql'),'utf8');
 await assert.rejects(pg.exec(first),/reverse stage 2 before stage 1/);
 await pg.exec('rollback');
 assert.ok((await pg.query("select to_regprocedure('public.confirm_change_order_payment(uuid,jsonb)') r")).rows[0].r);
});

test('integration: 002 then 001 rollback preserves legacy row and allows 001 then 002 installation',async()=>{
 const first=fs.readFileSync(path.join(__dirname,'../supabase/rollback/202609150001_change_order_payment_foundation.sql'),'utf8');
 await pg.exec(rollback);await pg.exec(first);
 assert.equal((await pg.query('select count(*)::int n from public.change_orders')).rows[0].n,1);
 assert.equal((await pg.query("select to_regprocedure('public.confirm_change_order_payment(uuid,jsonb)') r")).rows[0].r,null);
 await pg.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202609150001_change_order_payment_foundation.sql'),'utf8'));
 await pg.exec(migration);
});

test('integration: 002 rejects mixed-language overloads atomically',async()=>{
 await pg.exec(rollback);
 await pg.exec('create function public.cancel_job(text) returns text language sql as $$ select $1 $$');
 await assert.rejects(pg.exec(migration),/missing or overloaded RPC cancel_job/);
 await pg.exec('rollback');
 assert.equal((await pg.query("select to_regclass('public.job_financial_resolutions') r")).rows[0].r,null);
 await pg.exec('drop function public.cancel_job(text)');
 await pg.exec(migration);
});

for(const name of ['cancel_job','release_job_by_provider','complete_job','approve_job_completion','submit_job_for_completion_review','prepare_payment_reassignment']) {
 test(`SQL stage2: ${name} refuses accepted/unpaid CO`,async()=>{await assert.rejects(call(name,[job]),/CHANGE_ORDER_RECONCILIATION_REQUIRED/);});
}
for(const change of ["status='cancelled'","preferred_provider_id=null,status='open'","status='completed'","completion_review_status='pending'","job_stage=null"]) {
 test(`SQL stage2: direct lifecycle write ${change} also refuses uncertain CO`,async()=>{await assert.rejects(pg.exec('update public.service_requests set '+change),/CHANGE_ORDER_RECONCILIATION_REQUIRED/);});
}
test('SQL stage2: fully paid CO allows completion, but not release/reassignment/cancellation',async()=>{
 await paid();await call('complete_job',[job]);
 for(const name of ['cancel_job','release_job_by_provider','prepare_payment_reassignment']) await assert.rejects(call(name,[job]),/PAID_CHANGE_ORDER_REQUIRES_ADMIN/);
});
test('SQL stage2: unresolved reservation cannot be deleted by cleanup',async()=>{
 await pg.exec("update public.change_orders set payment_reservation_id=gen_random_uuid(),payment_reservation_flow='checkout',payment_reservation_created_at=now(),payment_reservation_payload='{}'");
 await assert.rejects(pg.exec('delete from public.change_orders'),/FINANCIAL_HISTORY_MUST_BE_PRESERVED/);
});
test('SQL stage2: prior accepted/unpaid CO blocks another CO',async()=>{
 await assert.rejects(pg.query("insert into public.change_orders(id,request_id,customer_id,provider_id,original_amount,additional_amount,new_total_amount,status) values(gen_random_uuid(),$1,$2,$3,50,20,70,'pending')",[job,customer,provider]),/CHANGE_ORDER_RECONCILIATION_REQUIRED/);
});
test('SQL stage2: funding references cannot be cleared or budgets changed',async()=>{
 await paid();
 await assert.rejects(pg.exec('update public.change_orders set stripe_payment_intent_id=null'),/FINANCIAL_HISTORY_MUST_BE_PRESERVED/);
 await assert.rejects(pg.exec('update public.change_orders set additional_amount=99'),/FUNDED_CHANGE_ORDER_IMMUTABLE/);
});
test('SQL stage2: reassignment row creation cannot bypass CO guard',async()=>{
 await paid();await assert.rejects(pg.query("insert into public.payment_reassignments(request_id,status) values($1,'available')",[job]),/CHANGE_ORDER_BLOCKS_REASSIGNMENT/);
});
test('SQL stage2: all financial resolutions refuse uncertain CO',async()=>{
 await assert.rejects(reserve(),/CHANGE_ORDER_RECONCILIATION_REQUIRED/);
 await assert.rejects(reserve('customer_cancel'),/CHANGE_ORDER_RECONCILIATION_REQUIRED/);
 await makeClaim();await assert.rejects(reserve('claim:'+claim),/CHANGE_ORDER_RECONCILIATION_REQUIRED/);
});
test('SQL stage2: historical paid CO with missing snapshot needs reconciliation',async()=>{
 await pg.exec("update public.change_orders set payment_status='paid',stripe_payment_intent_id='pi_fake'");await assert.rejects(reserve(),/CHANGE_ORDER_RECONCILIATION_REQUIRED/);
});
test('SQL stage2: half-recorded CO settlement blocks releasing even the base payment',async()=>{
 await paid();await pg.exec("update public.change_orders set stripe_transfer_id='tr_old'");
 await assert.rejects(reserve(),/CHANGE_ORDER_RECONCILIATION_REQUIRED/);
});
test('SQL stage2: historical paid CO assigned to another provider cannot be omitted from payout',async()=>{
 // Seed an inconsistent historical association before funding; do not change funded data.
 await pg.query('update public.change_orders set provider_id=$1',[customer]);
 await pg.exec("update public.change_orders set payment_status='paid',stripe_payment_intent_id='pi_old',paid_at=now(),additional_customer_total_amount=21,additional_provider_net_amount=18");
 await assert.rejects(reserve(),/CHANGE_ORDER_RECONCILIATION_REQUIRED/);
});
test('SQL stage2: resolved historical claim cannot trigger automatic payout or new admin effects',async()=>{
 await paid();await makeClaim();await pg.exec("update public.job_claims set status='resolved'");
 await assert.rejects(reserve(),/CLAIM_REQUIRES_ADMIN_RECONCILIATION/);
 await assert.rejects(reserve('claim:'+claim),/HISTORICAL_OR_INVALID_CLAIM_REQUIRES_RECONCILIATION/);
});
test('SQL stage2: historical provider transfer is preserved and blocks a fresh admin resolution',async()=>{
 await paid();await pg.exec("update public.change_orders set stripe_transfer_id='tr_old',released_at=now()");await makeClaim();
 await assert.rejects(reserve('claim:'+claim),/HISTORICAL_SETTLEMENT_REQUIRES_RECONCILIATION/);
});
test('SQL stage2: claim wins, automatic release cannot take over even after closure',async()=>{
 await paid();await makeClaim();await reserve('claim:'+claim,{action:'pay_provider'});
 const s=await step('claim:'+claim);await receipt(s.id,'claim:'+claim);
 await pg.exec("update public.job_claims set status='resolved'");
 await assert.rejects(reserve(),/FINANCIAL_OWNER_CONFLICT/);
 await assert.rejects(reserve('claim:'+claim,{action:'refund_customer'}),/FINANCIAL_OWNER_CONFLICT/);
});
test('SQL stage2: automatic release wins, concurrent new claim is rejected',async()=>{
 await paid();await reserve();await assert.rejects(makeClaim(),/FINANCIAL_RESOLUTION_OWNS_JOB/);
});
test('SQL stage2: two queued competing reservations select only one owner',async()=>{
 await pg.exec("delete from public.change_orders;update public.service_requests set status='completed'");
 const results=await Promise.allSettled([reserve(),reserve('customer_cancel')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('SQL stage2: repeat movement returns same instruction/receipt; changed amount refused',async()=>{
 await paid();await reserve();const a=await step();const b=await step();assert.equal(a.id,b.id);
 await receipt(a.id);assert.equal((await step()).receipt.id,'tr_fake');
 await assert.rejects(step('automatic_release','transfer',params(1700)),/FINANCIAL_STEP_CONFLICT/);
});
test('SQL stage2: partial resolution keeps transfer/refund as separate effects of same owner',async()=>{
 await paid();await makeClaim();await reserve('claim:'+claim,{action:'partial'});
 const t=await step('claim:'+claim),r=await step('claim:'+claim,'refund');assert.notEqual(t.id,r.id);
 await assert.rejects(step('automatic_release'),/FINANCIAL_OWNER_CONFLICT/);
});
test('SQL stage2: pending effect prevents claim closure and administrative job update',async()=>{
 await paid();await makeClaim();await reserve('claim:'+claim);await step('claim:'+claim);
 await assert.rejects(pg.exec("update public.job_claims set status='resolved'"),/FINANCIAL_RESOLUTION_INCOMPLETE/);
 await assert.rejects(call('apply_job_financial_update',[job,'claim:'+claim,'{"status":"cancelled"}']),/FINANCIAL_RESOLUTION_INCOMPLETE/);
});
test('SQL stage2: administrative completion uses guarded RPC after confirmed effect',async()=>{
 await paid(false);await makeClaim();await reserve('claim:'+claim);const s=await step('claim:'+claim);await receipt(s.id,'claim:'+claim);
 await assert.rejects(pg.exec("update public.service_requests set status='completed'"),/FINANCIAL_RESOLUTION_OWNS_JOB/);
 assert.equal((await call('apply_job_financial_update',[job,'claim:'+claim,'{"status":"completed","job_stage":"completed"}'])).updated,true);
 await assert.rejects(call('apply_job_financial_update',[job,'claim:'+claim,'{"customer_id":null}']),/INVALID_JOB_PATCH/);
});
test('SQL stage2: customer cancellation without CO retains normal lifecycle',async()=>{
 await pg.exec('delete from public.change_orders');await reserve('customer_cancel');await call('cancel_job',[job]);
 assert.equal((await pg.query('select status from public.service_requests')).rows[0].status,'cancelled');
});
test('SQL stage2: late CO insertion after a financial reservation is refused',async()=>{
 await paid();await reserve();await assert.rejects(pg.query("insert into public.change_orders(id,request_id,customer_id,provider_id,original_amount,additional_amount,new_total_amount,status) values(gen_random_uuid(),$1,$2,$3,70,20,90,'pending')",[job,customer,provider]),/CHANGE_ORDER_RECONCILIATION_REQUIRED/);
});
test('SQL stage2: application save failure rolls back receipt but leaves reserved instruction',async()=>{
 await paid();await reserve();const s=await step();
 await pg.exec("alter table public.job_financial_steps add constraint simulated_disk_failure check(receipt is null)");
 await assert.rejects(receipt(s.id),/simulated_disk_failure/);assert.equal((await step()).receipt,null);
 await pg.exec('alter table public.job_financial_steps drop constraint simulated_disk_failure');
});
test('SQL stage2: unprivileged roles cannot inspect ledger or call financial RPCs',async()=>{
 for(const role of ['anon','authenticated']) {await pg.exec('set role '+role);await assert.rejects(pg.exec('select * from public.job_financial_steps'),/permission denied/);await assert.rejects(reserve(),/permission denied/);await pg.exec('reset role');}
});
test('SQL stage2: rollback refuses to erase resolution ownership',async()=>{
 await paid();await reserve();await assert.rejects(pg.exec(rollback),/ROLLBACK_BLOCKED/);await pg.exec('rollback');
 assert.equal((await step()).receipt,null);
});
test('SQL stage2: unused rollback restores exact saved definitions and preserves historical rows',async()=>{
 await paid();const before=(await pg.query('select * from public.change_orders')).rows;
 const original=(await pg.query("select definition from public.co_stage2_function_backup where name='cancel_job'")).rows[0].definition;
 await pg.exec(rollback);
 assert.deepEqual((await pg.query('select * from public.change_orders')).rows,before);
 assert.equal((await pg.query("select pg_get_functiondef('public.cancel_job(uuid)'::regprocedure) d")).rows[0].d,original);
 await pg.exec(migration);
});

test('Application stage2: repeated transfer returns persisted receipt without another Stripe call',async()=>{
 await paid();await reserve();const fake=fakeClient();await fake.run.transfer(params());await fake.run.transfer(params());assert.equal(fake.creates,1);
});
test('Application stage2: database save failure recovers Stripe result without another movement',async()=>{
 await paid();await reserve();const fake=fakeClient({saveFails:true});await assert.rejects(fake.run.transfer(params()));assert.equal(fake.creates,1);
 fake.setSaveFails(false);await fake.run.transfer(params());assert.equal(fake.creates,1);
});
test('Application stage2: old transfer with absent local id blocks new key',async()=>{
 await paid();await reserve();const fake=fakeClient({legacy:true});await assert.rejects(fake.run.transfer(params()));assert.equal(fake.creates,0);
});
test('Application stage2: list/read failure never falls through to transfer creation',async()=>{
 await paid();await reserve();const fake=fakeClient({listFails:true});await assert.rejects(fake.run.transfer(params()));assert.equal(fake.creates,0);
});
test('Application stage2: pending refund is not recorded as financially resolved',async()=>{
 await paid();await reserve();const fake=fakeClient({pendingRefund:true});const p={amount:1800,payment_intent:'pi_fake',metadata:{request_id:job}};
 await assert.rejects(fake.run.refund(p));assert.equal(fake.creates,1);await assert.rejects(fake.run.refund(p));assert.equal(fake.creates,1);
 assert.equal((await pg.query('select receipt from public.job_financial_steps')).rows[0].receipt,null);
});
test('Application stage2: reservation older than 20h with no evidence creates nothing',async()=>{
 await paid();await reserve();await step();await pg.exec("update public.job_financial_steps set created_at=now()-interval '21 hours'");
 const fake=fakeClient();await assert.rejects(fake.run.transfer(params()));assert.equal(fake.creates,0);
});
test('Application stage2: migrated recovery after 20h uses observed receipt, never posts another movement',async()=>{
 await paid();await reserve();const fake=fakeClient({saveFails:true});await assert.rejects(fake.run.transfer(params()));
 await pg.exec("update public.job_financial_steps set created_at=now()-interval '21 hours'");fake.setSaveFails(false);await fake.run.transfer(params());assert.equal(fake.creates,1);
});
test('Application stage2: missing resolution prevents any simulated financial creation',async()=>{
 await paid();const fake=fakeClient();await assert.rejects(fake.run.transfer(params()));assert.equal(fake.creates,0);
});

test('SQL stage2: pay_provider without money releases its reservation, permits later completion/release',async()=>{
 await paid(false);await makeClaim();await reserve('claim:'+claim,{action:'continue_work'});
 await assert.rejects(step('claim:'+claim),/NON_FINANCIAL_RESOLUTION/);
 await pg.exec("update public.job_claims set status='resolved',resolution_type='pay_provider',provider_award_amount=0,customer_refund_amount=0,co_no_settlement_resolution=true");
 assert.equal((await pg.query('select * from public.job_financial_resolutions')).rows.length,0);
 await call('complete_job',[job]);await reserve();await step();
});
test('SQL stage2: non-financial closure with unpaid CO does not authorize release or completion',async()=>{
 await makeClaim();await reserve('claim:'+claim,{action:'continue_work'});
 await pg.exec("update public.job_claims set status='resolved',resolution_type='pay_provider',provider_award_amount=0,customer_refund_amount=0,co_no_settlement_resolution=true");
 await assert.rejects(reserve(),/CHANGE_ORDER_RECONCILIATION_REQUIRED/);
 await assert.rejects(call('complete_job',[job]),/CHANGE_ORDER_RECONCILIATION_REQUIRED/);
 assert.equal((await pg.query('select * from public.job_financial_steps')).rows.length,0);
 assert.equal((await call('reserve_change_order_payment',[co,customer,'checkout',null])).outcome,'needs_payload');
});
test('SQL stage2: non-financial marker cannot disguise money, nor be forged by a customer',async()=>{
 await paid(false);await makeClaim();await reserve('claim:'+claim,{action:'continue_work'});
 await assert.rejects(pg.exec("update public.job_claims set status='resolved',resolution_type='pay_provider',provider_award_amount=18,customer_refund_amount=0,co_no_settlement_resolution=true"),/INVALID_NON_FINANCIAL_CLOSURE/);
 await pg.exec("set request.jwt.claim.role='authenticated'");
 await assert.rejects(pg.exec("update public.job_claims set status='resolved',resolution_type='pay_provider',provider_award_amount=0,customer_refund_amount=0,co_no_settlement_resolution=true"),/INVALID_NON_FINANCIAL_CLOSURE/);
});
test('SQL stage2: inserting a pre-attested claim is rejected',async()=>{
 await assert.rejects(pg.query("insert into public.job_claims(id,request_id,status,co_no_settlement_resolution) values($1,$2,'resolved',true)",[claim,job]),/INVALID_NON_FINANCIAL_CLOSURE/);
});

test('Application stage2: preflight recovers receipt before route can skip the existing transfer',async()=>{
 await paid();await reserve();const fake=fakeClient({saveFails:true});await assert.rejects(fake.run.transfer(params()));fake.setSaveFails(false);
 await reserveJobResolution(fake.db,job,'automatic_release',{},fake.stripe);
 assert.equal((await step()).receipt.id,'tr_new');assert.equal(fake.creates,1);
});
test('Application stage2: preflight with no observed effect performs reads only',async()=>{
 await paid();await reserve();await step();const fake=fakeClient();await reserveJobResolution(fake.db,job,'automatic_release',{},fake.stripe);
 assert.equal(fake.creates,0);assert.equal((await step()).receipt,null);
});
test('SQL stage2: readonly reassignment preflight blocks paid or uncertain CO before refunds',async()=>{
 await assert.rejects(call('guard_job_reassignment',[job]),/CHANGE_ORDER_RECONCILIATION_REQUIRED/);
 await paid();await assert.rejects(call('guard_job_reassignment',[job]),/PAID_CHANGE_ORDER_REQUIRES_ADMIN/);
});
test('SQL stage2: reversal does not overwrite an independently modified RPC',async()=>{
 const saved=(await pg.query("select installed_definition from public.co_stage2_function_backup where name='cancel_job'")).rows[0].installed_definition;
 await pg.exec('create or replace function public.cancel_job(p_request_id uuid) returns void language plpgsql security definer as $$ begin raise exception \'later change\'; end $$');
 await assert.rejects(pg.exec(rollback),/an RPC changed/);await pg.exec('rollback');await pg.exec(saved);
});
test('SQL stage2: a claim racing Stripe confirmation preserves evidence and blocks completion',async()=>{
 const metadata={payment_type:'change_order',payment_flow:'payment_sheet',change_order_id:co,request_id:job,customer_id:customer,provider_id:provider,
 original_amount:'50.00',additional_amount:'20.00',new_total_amount:'70.00',customer_fee_percent:'5.00',customer_fee_amount:'1.00',customer_total_amount:'21.00',provider_commission_percent:'10.00',provider_commission_amount:'2.00',provider_net_amount:'18.00',platform_revenue_amount:'3.00'};
 const r=await call('reserve_change_order_payment',[co,customer,'payment_sheet',JSON.stringify({metadata,currency:'usd',params:{amount:2100},amounts:{customerTotalAmount:21}})]);
 await makeClaim();
 const result=await call('confirm_change_order_payment',[co,JSON.stringify({metadata,payment_intent_id:'pi_fake',session_id:null,reservation_id:r.reservation.id,charge_id:'ch_fake',status:'succeeded',currency:'usd',amount_received:2100,paid_at:new Date().toISOString()})]);
 assert.equal(result.outcome,'reconciliation_required');
 const row=(await pg.query('select * from public.change_orders')).rows[0];assert.equal(row.payment_status,'unpaid');assert.equal(row.stripe_payment_evidence.charge_id,'ch_fake');
 await assert.rejects(call('complete_job',[job]),/CHANGE_ORDER_RECONCILIATION_REQUIRED/);
 await reserve('claim:'+claim,{action:'continue_work'});
 await pg.exec("update public.job_claims set status='resolved',resolution_type='pay_provider',provider_award_amount=0,customer_refund_amount=0,co_no_settlement_resolution=true");
 const confirmed=await call('confirm_change_order_payment',[co,JSON.stringify({metadata,payment_intent_id:'pi_fake',session_id:null,reservation_id:r.reservation.id,charge_id:'ch_fake',status:'succeeded',currency:'usd',amount_received:2100,paid_at:new Date().toISOString()})]);
 assert.equal(confirmed.outcome,'paid');
});
