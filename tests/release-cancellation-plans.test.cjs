/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS Node test harness; VM dependencies are explicitly isolated. */
// Isolated PostgreSQL in memory. No credentials, network or Stripe operations.
const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.RELYDO_PGLITE_MODULE||'@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202609150002_change_order_lifecycle_guard.sql'),'utf8');
const job='00000000-0000-4000-8000-000000000001',co='00000000-0000-4000-8000-000000000002',customer='00000000-0000-4000-8000-000000000003',provider='00000000-0000-4000-8000-000000000004';
let pg;
const call=async(name,args)=> (await pg.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') r',args)).rows[0].r;
const reserve=(owner='automatic_release',decision={})=>call('reserve_job_financial_resolution',[job,owner,JSON.stringify(decision)]);
const paid=(complete=true)=>pg.exec("update public.change_orders set payment_status='paid',stripe_payment_intent_id='pi_fake',paid_at=now(),additional_customer_total_amount=21,additional_provider_net_amount=18"+(complete?"; update public.service_requests set status='completed'":""));
const vm=require('node:vm'),ts=require('typescript');
const compiled=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../app/lib/jobFinancialGuard.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const helperModule={exports:{}};
vm.runInNewContext(compiled,{exports:helperModule.exports,module:helperModule,require(name){throw Error('Unexpected runtime dependency: '+name);},Date,Number,Error});
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
  await pg.exec('create function public.'+name+'(p_request_id uuid'+(name==='cancel_job'?',p_reason text':'')+') returns void language plpgsql security definer as $$ begin '+action+' end $$');
 }
 for(const name of ['cleanup_failed_change_order','respond_to_change_order']) await pg.exec('create function public.'+name+'(p_change_order_id uuid) returns void language plpgsql security definer as $$ begin null; end $$');
 await pg.exec('create function public.finalize_payment_reassignment(p_reassignment_id uuid) returns void language plpgsql security definer as $$ begin null; end $$');
 await pg.exec(migration);
 await pg.exec("alter table public.payment_reassignments add column original_payment_id uuid, add column replacement_payment_id uuid, add column available_credit numeric, add column created_at timestamptz default now(), add column updated_at timestamptz;");
});
beforeEach(async()=>{
 await pg.exec("reset role;set request.jwt.claim.role='service_role';truncate public.job_financial_steps,public.job_financial_resolutions,public.change_orders,public.job_claims,public.payment_reassignments,public.service_requests cascade;");
 await pg.query("insert into public.service_requests(id,customer_id,preferred_provider_id,status,job_stage) values($1,$2,$3,'in_progress','working')",[job,customer,provider]);
 await pg.query("insert into public.change_orders(id,request_id,customer_id,provider_id,original_amount,additional_amount,new_total_amount,status) values($1,$2,$3,$4,50,20,70,'accepted')",[co,job,customer,provider]);
});
after(async()=>{await pg?.close();});

// Complete POST handlers and the real helper/001/002 SQL. Only the external
// SDK transport, notifications and non-financial payment tables are simulated.
// cancel_job's minimal legacy body changes lifecycle; its 002 wrapper is real.
const paymentId='00000000-0000-4000-8000-000000000010';
const reassignmentId='00000000-0000-4000-8000-000000000011';
const fundingId='00000000-0000-4000-8000-000000000012';
const sqlTables=new Set(['service_requests','change_orders','job_claims','payment_reassignments','job_financial_resolutions','job_financial_steps']);
const resolution=async()=>(await pg.query('select * from public.job_financial_resolutions where request_id=$1',[job])).rows[0];
const steps=async()=>(await pg.query('select * from public.job_financial_steps where request_id=$1 order by kind,charge_id',[job])).rows;
async function setupJob(status='completed',stage=null) {
 await pg.exec('delete from public.change_orders');
 await pg.query('update public.service_requests set status=$1,job_stage=$2 where id=$3',[status,stage,job]);
}
function endpoint(kind='release') {
 const state={transfers:[],refunds:[],calls:[],writes:[],intentReads:[],failReceipt:false,failCancel:false,failPaymentSave:false,failLedger:false,
  rows:{payments:[{id:paymentId,request_id:job,customer_id:customer,provider_id:provider,provider_net_amount:90,
   job_amount:100,customer_total_amount:110,customer_fee_amount:10,refunded_amount:0,currency:'usd',status:'paid',
   payment_provider:'stripe',provider_payment_id:'pi_base',release_due_at:'2020-01-01T00:00:00Z',created_at:'2020-01-01',updated_at:'2020-01-01'}],
   provider_profiles:[{user_id:provider,stripe_account_id:'acct_fake'}],provider_active_sessions:[{user_id:provider,session_id:'session'}],
   payment_settings:[{id:'settings',active:true,currency:'usd'}],payment_reassignment_funding_sources:[],payment_reassignment_source_refunds:[]}};
 const stripe={accounts:{retrieve:async()=>({capabilities:{transfers:'active'}})},
  paymentIntents:{retrieve:async id=>{state.intentReads.push(id);assert.ok(id);return {id,status:state.invalidIntent===id?'processing':'succeeded',currency:'usd',latest_charge:id.replace('pi_','ch_')};}},
  transfers:{list:async()=>({data:state.transfers,has_more:false}),create:async params=>{const item={...structuredClone(params),id:'tr_'+(state.transfers.length+1),amount_reversed:0};state.transfers.push(item);return item;}},
  refunds:{list:async({charge})=>({data:state.refunds.filter(r=>r.charge===charge),has_more:false}),create:async params=>{const item={...structuredClone(params),id:'re_'+(state.refunds.length+1),charge:params.payment_intent.replace('pi_','ch_'),currency:'usd',status:'succeeded'};state.refunds.push(item);return item;}}};
 const db={auth:{getUser:async()=>({data:{user:{id:kind==='release'?provider:customer}}})},
  rpc:async(name,args)=>{
   state.calls.push([name,structuredClone(args)]);
   if((name==='record_job_financial_step'&&state.failReceipt)||(name==='cancel_job'&&state.failCancel))return {data:null,error:{message:'simulated failure'}};
   try{await pg.exec('set role service_role');return {data:await call(name,Object.values(args)),error:null};}
   catch(e){return {data:null,error:{message:e.message}};}
   finally{await pg.exec('reset role');}
  },
  from(table){
   const predicates=[];let single=false,limit=Infinity,order=null,mutation=null;
   const q={select(){return q;},eq(k,v){predicates.push(r=>r[k]===v);return q;},in(k,v){predicates.push(r=>v.includes(r[k]));return q;},
    is(k,v){predicates.push(r=>(r[k]??null)===v);return q;},order(k,{ascending}){order=[k,ascending];return q;},limit(n){limit=n;return q;},
    maybeSingle(){single=true;return q;},update(p){mutation=['update',p];return q;},upsert(p){mutation=['upsert',p];return q;},
    async then(resolve,reject){try{
     let rows=sqlTables.has(table)?(await pg.query('select * from public.'+table)).rows:state.rows[table];
     assert.ok(rows,'unexpected table '+table);
     rows=rows.filter(r=>predicates.every(p=>p(r)));
     if(order)rows.sort((a,b)=>String(a[order[0]]).localeCompare(String(b[order[0]]))*(order[1]?1:-1));
     rows=rows.slice(0,limit);
     if(mutation){
      state.writes.push([table,structuredClone(mutation[1])]);
      if((table==='payments'&&state.failPaymentSave&&mutation[1].released_at)||(table==='payment_reassignment_source_refunds'&&state.failLedger))return resolve({data:null,error:{message:'save failure'}});
      if(sqlTables.has(table)){
       assert.equal(mutation[0],'update');
       const entries=Object.entries(mutation[1]);
       for(const row of rows)await pg.query('update public.'+table+' set '+entries.map(([k],i)=>k+'=$'+(i+1)).join(',')+' where id=$'+(entries.length+1),[...entries.map(([,v])=>v),row.id]);
      }else if(mutation[0]==='upsert'){
       const item=state.rows[table].find(r=>r.stripe_refund_id===mutation[1].stripe_refund_id);
       if(item)Object.assign(item,mutation[1]);else state.rows[table].push(structuredClone(mutation[1]));
      }else for(const row of rows)Object.assign(row,mutation[1]);
     }
     resolve({data:structuredClone(single?(rows[0]||null):rows),error:null});
    }catch(e){reject(e);}}
   };return q;
  }};
 const file=kind==='release'?'payments/release':'customer/cancel-job';
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../app/api',file,'route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const routeModule={exports:{}};
 vm.runInNewContext(code,{module:routeModule,exports:routeModule.exports,Buffer,Date,Number,Error,console:{log(){},warn(){},error(){}},
  process:{env:{STRIPE_SECRET_KEY:'fake',NEXT_PUBLIC_SUPABASE_URL:'https://invalid.example',SUPABASE_SECRET_KEY:'fake',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fake'}},
  require(name){
   if(name==='stripe')return function(){return stripe;};
   if(name==='@supabase/supabase-js')return {createClient:()=>db};
   if(name==='next/server')return {NextResponse:{json:(body,options)=>({body,status:options?.status||200})}};
   if(name.endsWith('/jobFinancialGuard'))return helperModule.exports;
   if(name.endsWith('/serverNotifications'))return {sendRelydoNotification:async()=>{}};
   throw Error('Unexpected dependency '+name);
  }});
 const token='x.'+Buffer.from(JSON.stringify({session_id:'session'})).toString('base64url')+'.x';
 return {state,db,stripe,run:()=>routeModule.exports.POST({headers:{get:()=>`Bearer ${token}`},json:async()=>({requestId:job,reason:'test cancellation'})})};
}

test('caller release -> helper -> SQL reserves full base plan and creates exactly one simulated transfer',async()=>{
 await setupJob();const f=endpoint();const result=await f.run();assert.equal(result.status,200,JSON.stringify(result));
 const r=await resolution();assert.equal(r.owner,'automatic_release');assert.equal(r.plan.length,1);
 const e=r.plan[0];assert.equal(e.kind,'transfer');assert.equal(e.direction,'to_provider');assert.equal(e.origin,'ch_base');
 assert.equal(e.destination,'acct_fake');assert.equal(e.currency,'usd');assert.equal(e.params.amount,9000);assert.equal(e.source.paymentId,paymentId);assert.equal(e.source.paymentIntentId,'pi_base');
 assert.equal(f.state.transfers.length,1);assert.equal((await steps()).length,1);
 assert.deepEqual(f.state.calls.find(([n])=>n==='reserve_job_financial_step')[1].p_params,e.params);
});
test('caller release exact retry keeps complete plan after local payment save and does not duplicate',async()=>{
 await setupJob();const f=endpoint();assert.equal((await f.run()).status,200);const decision=(await resolution()).decision;
 assert.equal((await f.run()).status,200);assert.deepEqual((await resolution()).decision,decision);assert.equal(f.state.transfers.length,1);
});
test('caller release recovers missing receipt before repeating the exact planned effect',async()=>{
 await setupJob();const f=endpoint();f.state.failReceipt=true;assert.equal((await f.run()).status,409);assert.equal(f.state.transfers.length,1);
 f.state.failReceipt=false;assert.equal((await f.run()).status,200);assert.equal(f.state.transfers.length,1);assert.ok((await steps())[0].receipt);
});
test('caller release includes a paid CO with its own PI and charge; retry retains released CO',async()=>{
 await paid();const f=endpoint();assert.equal((await f.run()).status,200);
 const p=(await resolution()).plan;assert.equal(p.length,2);const e=p.find(e=>e.source.changeOrderId===co);
 assert.equal(e.source.paymentIntentId,'pi_fake');assert.equal(e.chargeId,'ch_fake');assert.equal(e.params.amount,1800);
 assert.equal((await f.run()).status,200);assert.equal(f.state.transfers.length,2);assert.equal((await steps()).length,2);
});
test('caller release includes reassignment funding identities and exact allocations',async()=>{
 await setupJob();await pg.query("insert into public.payment_reassignments(id,request_id,status,replacement_payment_id) values($1,$2,'applied',$3)",[reassignmentId,job,paymentId]);
 const f=endpoint();f.state.rows.payment_reassignment_funding_sources.push({id:fundingId,reassignment_id:reassignmentId,source_type:'base',stripe_payment_intent_id:'pi_funding',allocated_customer_amount:110,allocated_provider_amount:90});
 assert.equal((await f.run()).status,200);const e=(await resolution()).plan[0];assert.equal(e.source.fundingSourceId,fundingId);assert.equal(e.source.paymentIntentId,'pi_funding');assert.equal(e.params.amount,9000);
 assert.equal((await f.run()).status,200);assert.equal(f.state.transfers.length,1);
});
test('caller release divergent retry is rejected without an extra step or movement',async()=>{
 await setupJob();const f=endpoint();assert.equal((await f.run()).status,200);f.state.rows.payments[0].provider_net_amount=91;
 assert.equal((await f.run()).status,409);assert.equal(f.state.transfers.length,1);assert.equal((await steps()).length,1);
});
test('caller release genuinely zero financial amount reserves explicit empty plan',async()=>{
 await setupJob();const f=endpoint();f.state.rows.payments[0].provider_net_amount=0;
 assert.equal((await f.run()).status,200);assert.deepEqual((await resolution()).plan,[]);assert.equal(f.state.transfers.length,0);
});
test('caller customer_cancel open with no payment explicitly reserves [] and continues SQL lifecycle',async()=>{
 await setupJob('open');const f=endpoint('cancel');f.state.rows.payments=[];
 assert.equal((await f.run()).status,200);assert.deepEqual((await resolution()).plan,[]);
 assert.equal((await pg.query('select status from public.service_requests')).rows[0].status,'cancelled');assert.equal(f.state.refunds.length,0);
 assert.equal((await f.run()).status,200); // alreadyCancelled recovery uses the existing empty decision.
});
test('caller customer_cancel contracted declares refund, executes it once and closes lifecycle',async()=>{
 await setupJob('in_progress');const f=endpoint('cancel');const result=await f.run();assert.equal(result.status,200,JSON.stringify(result));
 const e=(await resolution()).plan[0];assert.equal(e.kind,'refund');assert.equal(e.direction,'to_customer');assert.equal(e.params.amount,9500);assert.equal(e.source.paymentIntentId,'pi_base');assert.equal(e.source.paymentId,paymentId);assert.equal(e.origin,'ch_base');assert.equal(e.destination,null);assert.equal(e.currency,'usd');
 assert.equal(f.state.refunds.length,1);assert.equal((await f.run()).status,200);assert.equal(f.state.refunds.length,1);
});
test('caller customer_cancel arrived declares both compensation and refund before any movement',async()=>{
 await setupJob('in_progress','arrived');const f=endpoint('cancel');assert.equal((await f.run()).status,200);
 const p=(await resolution()).plan;assert.equal(p.length,2);assert.equal(p.find(e=>e.kind==='transfer').params.amount,1200);assert.equal(p.find(e=>e.kind==='refund').params.amount,7650);
 const reservation=f.state.calls.find(([n])=>n==='reserve_job_financial_resolution');assert.equal(reservation[1].p_decision.plan.length,2);
 assert.equal(f.state.transfers.length,1);assert.equal(f.state.refunds.length,1);
});
test('caller customer_cancel working remains rejected by H1 without reserving',async()=>{
 await setupJob('in_progress','working');const f=endpoint('cancel');assert.equal((await f.run()).status,409);
 assert.equal(await resolution(),undefined);assert.equal(f.state.calls.length,0);assert.equal(f.state.refunds.length,0);
});
for(const kind of ['release','cancel'])test(`caller ${kind} preserves legacy NULL plan, owner and blocked state`,async()=>{
 await setupJob(kind==='release'?'completed':'open');const owner=kind==='release'?'automatic_release':'customer_cancel';
 await reserve(owner,{});const f=endpoint(kind);if(kind==='cancel')f.state.rows.payments=[];
 assert.equal((await f.run()).status,409);const r=await resolution();assert.equal(r.plan,null);assert.equal(r.state,'reconciliation_required');assert.equal(r.owner,owner);assert.deepEqual(r.decision,{});
 assert.equal((await steps()).length,0);assert.equal(f.state.transfers.length+f.state.refunds.length,0);
 assert.equal(f.state.intentReads.length,0); // Legacy state is detected before trying to rebuild sources.
});
test('caller cancellation retry after receipt failure recovers then rejects divergent plan',async()=>{
 await setupJob('in_progress');const f=endpoint('cancel');f.state.failReceipt=true;assert.equal((await f.run()).status,409);assert.equal(f.state.refunds.length,1);
 f.state.failReceipt=false;f.state.rows.payments[0].job_amount=90;assert.equal((await f.run()).status,409);assert.equal(f.state.refunds.length,1);
 f.state.rows.payments[0].job_amount=100;assert.equal((await f.run()).status,200);assert.equal(f.state.refunds.length,1);
});
test('caller open credit retry after payment projection and failed lifecycle retains its original refund plan',async()=>{
 await setupJob('open');await pg.query("insert into public.payment_reassignments(id,request_id,status,original_payment_id) values($1,$2,'available',$3)",[reassignmentId,job,paymentId]);
 const f=endpoint('cancel');f.state.failCancel=true;assert.equal((await f.run()).status,500);assert.equal(f.state.refunds.length,1);assert.equal(f.state.rows.payments[0].refunded_amount,100);
 const decision=(await resolution()).decision;f.state.failCancel=false;assert.equal((await f.run()).status,200);
 assert.deepEqual((await resolution()).decision,decision);assert.equal(f.state.refunds.length,1);
});
test('caller reassigned cancellation retry excludes only its own confirmed refund ledger projections',async()=>{
 await setupJob('in_progress','arrived');await pg.query("insert into public.payment_reassignments(id,request_id,status,replacement_payment_id) values($1,$2,'applied',$3)",[reassignmentId,job,paymentId]);
 const f=endpoint('cancel');f.state.rows.payment_reassignment_funding_sources.push({id:fundingId,payment_id:paymentId,source_type:'base',stripe_payment_intent_id:'pi_funding',allocated_customer_amount:110,allocated_provider_amount:90,transferred_at:null});
 f.state.failCancel=true;assert.equal((await f.run()).status,500);assert.equal(f.state.refunds.length,1);assert.equal(f.state.transfers.length,1);assert.equal(f.state.rows.payment_reassignment_source_refunds.length,1);
 const decision=(await resolution()).decision;f.state.failCancel=false;assert.equal((await f.run()).status,200);assert.deepEqual((await resolution()).decision,decision);assert.equal(f.state.refunds.length,1);assert.equal(f.state.transfers.length,1);
});

test('caller release validates the entire CO plan before moving even the base payment',async()=>{
 await paid();const f=endpoint();f.state.invalidIntent='pi_fake';assert.equal((await f.run()).status,409);
 assert.equal(await resolution(),undefined);assert.equal(f.state.transfers.length,0);
});
test('caller release retry after local payment save failure uses durable receipt, not a new transfer',async()=>{
 await setupJob();const f=endpoint();f.state.failPaymentSave=true;assert.equal((await f.run()).status,500);assert.equal(f.state.transfers.length,1);
 f.state.failPaymentSave=false;assert.equal((await f.run()).status,200);assert.equal(f.state.transfers.length,1);
});
test('caller cancellation allocates refunds newest first and awards only from retained oldest funds',async()=>{
 await setupJob('in_progress','arrived');await pg.query("insert into public.payment_reassignments(id,request_id,status,replacement_payment_id) values($1,$2,'applied',$3)",[reassignmentId,job,paymentId]);
 const f=endpoint('cancel');
 f.state.rows.payment_reassignment_funding_sources.push(
  {id:fundingId,payment_id:paymentId,source_type:'base',stripe_payment_intent_id:'pi_old',allocated_customer_amount:60,allocated_provider_amount:45,transferred_at:null,created_at:'2020-01-01'},
  {id:fundingId.replace(/12$/,'13'),payment_id:paymentId,source_type:'base',stripe_payment_intent_id:'pi_new',allocated_customer_amount:50,allocated_provider_amount:45,transferred_at:null,created_at:'2020-01-02'});
 f.state.failCancel=true;assert.equal((await f.run()).status,500);
 const p=(await resolution()).plan;assert.equal(p.length,3);
 assert.equal(p.find(e=>e.kind==='transfer').source.paymentIntentId,'pi_old');assert.equal(p.find(e=>e.kind==='transfer').params.amount,1200);
 assert.equal(p.find(e=>e.kind==='refund'&&e.source.paymentIntentId==='pi_new').params.amount,5000);
 assert.equal(p.find(e=>e.kind==='refund'&&e.source.paymentIntentId==='pi_old').params.amount,2650);
 f.state.failCancel=false;assert.equal((await f.run()).status,200);assert.equal(f.state.transfers.length,1);assert.equal(f.state.refunds.length,2);
});
test('caller open job with unexplained payment refuses an empty financial plan',async()=>{
 await setupJob('open');const f=endpoint('cancel');assert.equal((await f.run()).status,409);
 assert.equal(await resolution(),undefined);assert.equal(f.state.refunds.length,0);
});
test('caller customer_cancel with paid CO remains blocked for admin reconciliation',async()=>{
 await pg.exec("delete from public.change_orders; update public.service_requests set job_stage='arrived'");
 await pg.query("insert into public.change_orders(id,request_id,customer_id,provider_id,original_amount,additional_amount,new_total_amount,status) values($1,$2,$3,$4,50,20,70,'accepted')",[co,job,customer,provider]);await paid(false);
 const f=endpoint('cancel');assert.equal((await f.run()).status,409);assert.equal(await resolution(),undefined);assert.equal(f.state.transfers.length+f.state.refunds.length,0);
});
test('caller cancellation missing refund ledger save recovers without another refund',async()=>{
 await setupJob('open');await pg.query("insert into public.payment_reassignments(id,request_id,status,original_payment_id) values($1,$2,'available',$3)",[reassignmentId,job,paymentId]);
 const f=endpoint('cancel');f.state.rows.payment_reassignment_funding_sources.push({id:fundingId,payment_id:paymentId,source_type:'base',stripe_payment_intent_id:'pi_funding',allocated_customer_amount:110,allocated_provider_amount:90,transferred_at:null});
 f.state.failLedger=true;assert.equal((await f.run()).status,409);assert.equal(f.state.refunds.length,1);
 f.state.failLedger=false;assert.equal((await f.run()).status,200);assert.equal(f.state.refunds.length,1);assert.equal(f.state.rows.payment_reassignment_source_refunds.length,1);
});
test('caller cancellation does not trust a mismatched projection even with a matching receipt id',async()=>{
 await setupJob('open');await pg.query("insert into public.payment_reassignments(id,request_id,status,original_payment_id) values($1,$2,'available',$3)",[reassignmentId,job,paymentId]);
 const f=endpoint('cancel');f.state.rows.payment_reassignment_funding_sources.push({id:fundingId,payment_id:paymentId,source_type:'base',stripe_payment_intent_id:'pi_funding',allocated_customer_amount:110,allocated_provider_amount:90,transferred_at:null});
 f.state.failCancel=true;assert.equal((await f.run()).status,500);f.state.rows.payment_reassignment_source_refunds[0].refunded_amount=1;
 f.state.failCancel=false;assert.equal((await f.run()).status,409);assert.equal(f.state.refunds.length,1);
});
test('caller legacy reservation with historical receipt keeps receipt and ownership untouched',async()=>{
 await setupJob('open');await reserve('customer_cancel',{});
 await pg.query("insert into public.job_financial_steps(request_id,kind,charge_id,params,receipt,confirmed_at) values($1,'refund','ch_historical','{}',$2,now())",[job,JSON.stringify({id:'re_historical',amount:100})]);
 const before=await steps();const f=endpoint('cancel');f.state.rows.payments=[];
 assert.equal((await f.run()).status,409);assert.deepEqual(await steps(),before);assert.equal((await resolution()).owner,'customer_cancel');assert.equal(f.state.refunds.length,0);
});

test('read-only recovery RPC enforces service role and owner, never exposes direct table access or creates a reservation',async()=>{
 await setupJob('open');
 for(const role of ['anon','authenticated']){
  await pg.exec('set role '+role);
  await assert.rejects(call('read_job_financial_resolution',[job,'customer_cancel']),/permission denied/);
  await pg.exec('reset role');
 }
 await pg.exec('set role service_role');
 await assert.rejects(pg.query('select * from public.job_financial_resolutions'),/permission denied/);
 await assert.rejects(pg.query('select * from public.job_financial_steps'),/permission denied/);
 assert.deepEqual(await call('read_job_financial_resolution',[job,'customer_cancel']),{found:false});
 await pg.exec('reset role');assert.equal(await resolution(),undefined);
 await reserve('customer_cancel',{plan:[]});
 const before=await resolution();const f=endpoint('cancel');
 assert.ok((await f.db.rpc('read_job_financial_resolution',{p_request_id:job,p_owner:'automatic_release'})).error);
 assert.ok((await f.db.rpc('read_job_financial_resolution',{p_request_id:job,p_owner:'customer_cancel'})).data.found);
 assert.deepEqual(await resolution(),before);
});

test('caller release cannot disguise an unknown amount as a zero-money plan',async()=>{
 await setupJob();const f=endpoint();f.state.rows.payments[0].provider_net_amount=null;
 assert.equal((await f.run()).status,400);assert.equal(await resolution(),undefined);assert.equal(f.state.transfers.length,0);
});
