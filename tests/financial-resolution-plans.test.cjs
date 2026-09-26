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
  paymentIntents:{retrieve:async()=>({latest_charge:'ch_fake',status:'succeeded',currency:'usd'})},
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


const plan = () => ['a','b'].map((key,i)=>({key,kind:'transfer',direction:'to_provider',chargeId:'ch_'+key,origin:'ch_'+key,currency:'usd',destination:'acct_fake',source:{paymentIntentId:'pi_'+key,paymentId:null,changeOrderId:null,fundingSourceId:null},params:{...params(1000+i),source_transaction:'ch_'+key}}));
const openPlan = async(p=plan())=>{await paid();await makeClaim();await reserve('claim:'+claim,{action:'pay_provider',providerAwardAmount:20.01,customerRefundAmount:0,plan:p});return p;};
const allocate = e=>call('reserve_job_financial_step',[job,'claim:'+claim,e.kind,e.chargeId,JSON.stringify(e.params)]);
const finalReceipt=e=>({id:'tr_'+e.key,status:'succeeded',amount:e.params.amount,currency:e.currency,kind:e.kind,charge_id:e.chargeId,direction:e.direction,origin:e.origin,destination:e.destination,source:e.source});
const confirm=async(e)=>{const s=await allocate(e);await call('record_job_financial_step',[s.id,'claim:'+claim,JSON.stringify(finalReceipt(e))]);return s;};
const settle=()=>call('settle_job_financial_resolution',[job,'claim:'+claim]);
test('H8: 1/2 receipts rejects settle and job/claim closure; 2/2 exact receipts permits it',async()=>{
 const p=await openPlan();await confirm(p[0]);await assert.rejects(settle(),/INCOMPLETE/);
 await assert.rejects(call('apply_job_financial_update',[job,'claim:'+claim,JSON.stringify({status:'completed'})]),/INCOMPLETE/);
 await assert.rejects(pg.exec("update public.job_claims set status='resolved'"),/INCOMPLETE/);
 await confirm(p[1]);assert.equal((await settle()).settled,true);
 await pg.exec("update public.job_claims set status='resolved'");
});
test('H8: zero steps with nonempty plan rejects settle',async()=>{await openPlan();await assert.rejects(settle(),/INCOMPLETE/);});
test('H8: undeclared and divergent instructions rejected',async()=>{const p=await openPlan();await assert.rejects(allocate({...p[0],chargeId:'extra'}),/UNDECLARED/);for(const patch of [{amount:1},{currency:'eur'},{destination:'wrong'},{source_transaction:'wrong'}])await assert.rejects(allocate({...p[0],params:{...p[0].params,...patch}}),/DIVERGENT/);});
test('H8: settled blocks extra steps and exact retry is idempotent',async()=>{const p=await openPlan();const first=await confirm(p[0]);await confirm(p[1]);await settle();assert.equal((await allocate(p[0])).id,first.id);assert.equal((await settle()).settled,true);await assert.rejects(allocate({...p[0],chargeId:'extra'}),/UNDECLARED|SETTLED/);assert.equal((await pg.query('select count(*)::int n from public.job_financial_steps')).rows[0].n,2);});
test('H8: legacy without plan stays reconciliation_required',async()=>{await paid();await makeClaim();await reserve('claim:'+claim,{action:'pay_provider'});assert.deepEqual(await settle(),{settled:false,state:'reconciliation_required'});await assert.rejects(allocate(plan()[0]),/RECONCILIATION_REQUIRED/);await assert.rejects(pg.exec("update public.job_claims set status='resolved'"),/INCOMPLETE/);});
for(const field of ['kind','charge_id','amount','currency','direction','origin','destination','source','status'])test('H8: receipt mismatch '+field,async()=>{const p=await openPlan(),s=await allocate(p[0]),r=finalReceipt(p[0]);r[field]=field==='amount'?999:'wrong';await assert.rejects(call('record_job_financial_step',[s.id,'claim:'+claim,JSON.stringify(r)]),/INVALID_FINANCIAL_RECEIPT/);await assert.rejects(settle(),/INCOMPLETE/);});
test('H8: immutable decision and owner exclusion',async()=>{const p=await openPlan();await assert.rejects(reserve('automatic_release',{plan:p}),/OWNER_CONFLICT/);p[0].params.amount++;await assert.rejects(reserve('claim:'+claim,{action:'pay_provider',plan:p}),/OWNER_CONFLICT/);});
test('H8: extra persisted step prevents settle',async()=>{const p=await openPlan();await confirm(p[0]);await confirm(p[1]);await pg.query("insert into public.job_financial_steps(request_id,kind,charge_id,params) values($1,'refund','extra','{}')",[job]);await assert.rejects(settle(),/INCOMPLETE/);});

test('H8: decision totals cannot omit part of the plan',async()=>{await paid();await makeClaim();await assert.rejects(reserve('claim:'+claim,{action:'pay_provider',providerAwardAmount:10,customerRefundAmount:0,plan:plan()}),/TOTAL_MISMATCH/);});
test('H8: new step after settled is rejected even if declared but row is missing',async()=>{const p=await openPlan();await confirm(p[0]);await confirm(p[1]);await settle();await pg.query('delete from public.job_financial_steps where charge_id=$1',[p[1].chargeId]);await assert.rejects(allocate(p[1]),/SETTLED/);});

test('H8: receipt identity cannot be reused for another step',async()=>{const p=await openPlan();await confirm(p[0]);const s=await allocate(p[1]);await assert.rejects(call('record_job_financial_step',[s.id,'claim:'+claim,JSON.stringify({...finalReceipt(p[1]),id:'tr_a'})]),/RECEIPT_REUSED/);});
test('H8: claim cannot close with no resolution reservation',async()=>{await paid();await makeClaim();await assert.rejects(pg.exec("update public.job_claims set status='resolved'"),/INCOMPLETE/);});
test('H8: unused local proposal rollback and reinstall remain valid',async()=>{await pg.exec(rollback);await pg.exec(migration);});
test('H8: actual TypeScript guard, SQL plan, receipt recovery and exact retry',async()=>{
 await paid();const f=fakeClient({saveFails:true});
 const p=await helperModule.exports.financialPlan(f.stripe,[{key:'base',paymentIntentId:'pi_fake',transfer:params()}]);
 await reserveJobResolution(f.db,job,'automatic_release',{plan:p},f.stripe);
 await assert.rejects(f.run.transfer(params()));assert.equal(f.creates,1);
 await assert.rejects(call('settle_job_financial_resolution',[job,'automatic_release']),/INCOMPLETE/);
 f.setSaveFails(false);await reserveJobResolution(f.db,job,'automatic_release',{plan:p},f.stripe);
 assert.equal((await call('settle_job_financial_resolution',[job,'automatic_release'])).settled,true);
 await f.run.transfer(params());assert.equal(f.creates,1);
});
