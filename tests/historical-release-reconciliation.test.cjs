/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic object fields with pinned incident IDs; never actual Stripe exports. No network, credentials or production calls.
const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.RELYDO_PGLITE_MODULE||'@electric-sql/pglite');
const setup=require('./fixtures/historical-reconciliation-setup.cjs');
const plans=require('./fixtures/historical-reconciliation-plans.json');
const A='d22970ec-9da5-4f11-b79b-e7acba81b28b',B='059532b3-2572-426a-a3d9-7c99a65193e9';
const steps={ [A]:'c6af51b1-b251-4b64-9819-5ba74e64cce3',[B]:'e0a1009c-728a-4d66-9694-91b6cecc8e57'};
const customer='00000000-0000-4000-8000-000000000003';
let pg;
const query=(sql,args=[])=>pg.query(sql,args);
const snapshot=async id=>(await query('select public.historical_release_snapshot($1) s',[id])).rows[0].s;
const call=async(id,e)=>(await query('select public.reconcile_historical_release_20260927($1,$2) r',[id,JSON.stringify(e)])).rows[0].r;
const transfer=(entry,id)=>({object:'transfer',id,amount:entry.params.amount,currency:'usd',source_transaction:entry.chargeId,destination:entry.destination,livemode:false,reversed:false,amount_reversed:0,created:1788537600});
function evidence(id){
 const entry=plans[id][0];
 return {reviewed_by:'LOCAL TEST FIXTURE',reference:'synthetic-only',stripe_account_id:'acct_TestPlatform',livemode:false,observed_at:new Date().toISOString(),
 charge:{created:1788307200,object:'charge',id:entry.chargeId,payment_intent:entry.source.paymentIntentId,currency:'usd',livemode:false,paid:true,status:'succeeded',amount:id===A?63000:5250,refunded:id===B,amount_refunded:id===A?0:5250},
 transfers:{object:'list',source_transaction:entry.chargeId,has_more:false,data:id===A?[transfer(entry,'tr_3U4IGSIEn05DVPjv00L0GaMI')]:[]},
 ...(id===B?{refund_display_timezone:'America/Los_Angeles',refund:{object:'refund',id:'re_3UC5VNIEn05DVPjv1MUPgfdG',status:'succeeded',amount:5250,currency:'usd',charge:entry.chargeId,payment_intent:entry.source.paymentIntentId,created:Date.parse('2026-09-04T22:22:37-07:00')/1000},base_transfer:transfer(plans[B][1],'tr_3UC46SIEn05DVPjv09Pndce0')}: {})};
}
before(async()=>{pg=new PGlite();await setup(pg,fs,path);});
beforeEach(async()=>{
 await pg.exec("reset role;set request.jwt.claim.role='service_role';truncate public.historical_release_reconciliations,public.job_financial_steps,public.job_financial_resolutions,public.change_orders,public.payments,public.job_claims,public.payment_reassignments,public.payment_reassignment_funding_sources,public.service_requests cascade;");
 for(const id of [A,B]){
  const p=plans[id],entry=p[0],pay=id===A?entry:p[1];
  await query("insert into public.service_requests(id,customer_id,preferred_provider_id,status,job_stage) values($1,$2,$3,'completed','working')",[id,customer,entry.params.metadata.professional_id]);
  if(id===B)await query(`insert into public.change_orders(id,request_id,customer_id,provider_id,original_amount,additional_amount,new_total_amount,status,payment_status,stripe_payment_intent_id,paid_at,additional_customer_total_amount,additional_provider_net_amount) values($1,$2,$3,$4,50,50,100,'accepted','paid',$5,'2026-09-01',52.5,45)`,[entry.source.changeOrderId,id,customer,entry.params.metadata.professional_id,entry.source.paymentIntentId]);
  await query(`insert into public.payments values($1,$2,$3,$4,'USD',$5,$6,$7,0,'2026-09-01',$8,$9,1215,'historical error','2026-09-27')`,[pay.source.paymentId,id,entry.params.metadata.professional_id,pay.source.paymentIntentId,id===A?'ready_for_payout':'paid_out',id===A?540:45,id===A?630:52.5,id===A?null:'tr_3UC46SIEn05DVPjv09Pndce0',id===A?null:'2026-09-24T15:40:16.470Z']);
  await query("insert into public.job_financial_resolutions(request_id,owner,decision,plan,state,created_at) values($1,'automatic_release',$2,$3,'executing','2026-09-27T12:15:00Z')",[id,JSON.stringify({plan:p}),JSON.stringify(p)]);
  await query("insert into public.job_financial_steps(id,request_id,kind,charge_id,params,created_at) values($1,$2,'transfer',$3,$4,'2026-09-27T12:16:00Z')",[steps[id],id,entry.chargeId,JSON.stringify(entry.params)]);
 }
});
after(async()=>pg?.close());

test('adopt exact historical transfer atomically and replay without further changes',async()=>{
 const old=await snapshot(A),e=evidence(A);assert.equal((await call(A,e)).outcome,'adopted_existing_transfer');
 const now=await snapshot(A);assert.equal(now.payments[0].status,'paid_out');assert.equal(now.payments[0].stripe_transfer_id,e.transfers.data[0].id);
 assert.equal(now.payments[0].release_attempts,old.payments[0].release_attempts);assert.deepEqual(now.resolution.plan,old.resolution.plan);
 assert.equal(now.resolution.state,'settled');assert.equal(now.steps[0].receipt.id,e.transfers.data[0].id);
 assert.equal((await call(A,e)).already_applied,true);assert.deepEqual(await snapshot(A),now);
 await assert.rejects(call(A,{...e,reference:'changed'}),/REPLAY_CONFLICT/);
});
test('retire invalid plan, retain funding and base payment; no transfer receipt',async()=>{
 const old=await snapshot(B),e=evidence(B);assert.equal((await call(B,e)).outcome,'retired_invalid_plan');
 const now=await snapshot(B);assert.equal(now.resolution.state,'reconciliation_required');
 assert.deepEqual(now.resolution.plan,old.resolution.plan);assert.deepEqual(now.resolution.decision,old.resolution.decision);
 assert.deepEqual(now.steps,old.steps);assert.deepEqual(now.payments,old.payments);
 assert.equal(now.change_orders[0].payment_status,'paid');assert.equal(now.change_orders[0].paid_at,old.change_orders[0].paid_at);
 assert.equal(Number(now.change_orders[0].refunded_amount),52.5);assert.equal(now.change_orders[0].stripe_refund_id,e.refund.id);
 assert.equal(now.change_orders[0].stripe_transfer_id,null);assert.equal((await call(B,e)).already_applied,true);
 const reserve=await query("select public.reserve_job_financial_resolution($1,'automatic_release',$2) r",[B,JSON.stringify(old.resolution.decision)]);
 assert.equal(reserve.rows[0].r.state,'reconciliation_required');
 await assert.rejects(query("select public.reserve_job_financial_step($1,'automatic_release','transfer',$2,$3)",[B,plans[B][0].chargeId,JSON.stringify(plans[B][0].params)]),/RECONCILIATION_REQUIRED/);
 await assert.rejects(query("select public.record_job_financial_step($1,'automatic_release','{}')",[steps[B]]),/INVALID_FINANCIAL_RECEIPT/);
 assert.equal((await query("select public.settle_job_financial_resolution($1,'automatic_release') r",[B])).rows[0].r.settled,false);
 await assert.rejects(query("update public.job_financial_resolutions set state='executing' where request_id=$1",[B]),/IMMUTABLE/);
 await assert.rejects(query('delete from public.job_financial_steps where request_id=$1',[B]),/IMMUTABLE/);
 await assert.rejects(query("update public.historical_release_reconciliations set evidence='{}' where request_id=$1",[B]),/IMMUTABLE/);
 await assert.rejects(query('delete from public.historical_release_reconciliations where request_id=$1',[B]),/IMMUTABLE/);
 await assert.rejects(query('update public.change_orders set refunded_amount=0,stripe_refund_id=null,refunded_at=null'),/IMMUTABLE/);
});

const badEvidence=[
 ['different transfer ID despite matching fields',A,e=>{e.transfers.data[0].id='tr_other';}],
 ['different refund ID despite matching fields',B,e=>{e.refund.id='re_other';}],
 ['missing dashboard timezone',B,e=>{delete e.refund_display_timezone;}],
 ['unknown dashboard timezone',B,e=>{e.refund_display_timezone='Unknown/Zone';}],
 ['wrong dashboard minute',B,e=>{e.refund.created+=60;}],
 ['timezone mismatch',B,e=>{e.refund_display_timezone='UTC';}],
 ['missing evidence',A,e=>{delete e.charge;}],['live mode',A,e=>{e.charge.livemode=true;}],
 ['wrong source',A,e=>{e.transfers.data[0].source_transaction='ch_other';}],['wrong amount',A,e=>{e.transfers.data[0].amount=54001;}],
 ['wrong destination',A,e=>{e.transfers.data[0].destination='acct_other';}],['wrong currency',A,e=>{e.transfers.data[0].currency='eur';}],
 ['reversed transfer',A,e=>{e.transfers.data[0].amount_reversed=1;}],['pending pagination',A,e=>{e.transfers.has_more=true;}],
 ['duplicate transfer',A,e=>{e.transfers.data.push(e.transfers.data[0]);}],['missing transfer',A,e=>{e.transfers.data=[];}],
 ['missing timestamp',A,e=>{delete e.transfers.data[0].created;}],['fresh rather than historical transfer',A,e=>{e.transfers.data[0].created=2000000000;}],
 ['stale evidence',A,e=>{e.observed_at='2026-09-01';}],['pending refund',B,e=>{e.refund.status='pending';}],
 ['wrong refund PI',B,e=>{e.refund.payment_intent='pi_other';}],['partial refund',B,e=>{e.refund.amount=4500;}],
 ['wrong refund charge',B,e=>{e.refund.charge='ch_other';}],['CO already transferred externally',B,e=>{e.transfers.data=[transfer(plans[B][0],'tr_other')];}],
 ['base transfer mismatch',B,e=>{e.base_transfer.id='tr_other';}],['wrong refund date',B,e=>{e.refund.created=1788451200;}]
];
for(const [name,id,mutate] of badEvidence)test('reject '+name+' without writes',async()=>{
 const old=await snapshot(id),e=evidence(id);mutate(e);await assert.rejects(call(id,e),/HISTORICAL_/);assert.deepEqual(await snapshot(id),old);
 assert.equal((await query('select count(*) n from public.historical_release_reconciliations')).rows[0].n,0);
});
for(const [name,id,sql] of [
 ['owner drift',A,"update public.job_financial_resolutions set owner='customer_cancel' where request_id=$1"],
 ['plan drift',A,"update public.job_financial_resolutions set plan='[]' where request_id=$1"],
 ['wrong payment status',A,"update public.payments set status='paid' where request_id=$1"],
 ['missing base transfer',B,"update public.payments set stripe_transfer_id=null where request_id=$1"]
])test('reject '+name,async()=>{await query(sql,[id]);const old=await snapshot(id);await assert.rejects(call(id,evidence(id)),/HISTORICAL_/);assert.deepEqual(await snapshot(id),old);});

test('historical claim predating the resolution blocks reconciliation',async()=>{
 await query('delete from public.job_financial_steps where request_id=$1',[A]);
 await query('delete from public.job_financial_resolutions where request_id=$1',[A]);
 await query("insert into public.job_claims(request_id,status) values($1,'reviewing')",[A]);
 await query("insert into public.job_financial_resolutions(request_id,owner,decision,plan,state) values($1,'automatic_release',$2,$3,'executing')",[A,JSON.stringify({plan:plans[A]}),JSON.stringify(plans[A])]);
 await query("insert into public.job_financial_steps(id,request_id,kind,charge_id,params,created_at) values($1,$2,'transfer',$3,$4,'2026-09-27T12:16:00Z')",[steps[A],A,plans[A][0].chargeId,JSON.stringify(plans[A][0].params)]);
 const old=await snapshot(A);await assert.rejects(call(A,evidence(A)),/DATABASE_CONFLICT/);assert.deepEqual(await snapshot(A),old);
});

test('existing transfer ID cannot be adopted from another payment',async()=>{
 const e=evidence(A);await query('update public.payments set stripe_transfer_id=$1 where request_id=$2',[e.transfers.data[0].id,B]);
 const old=await snapshot(A);await assert.rejects(call(A,e),/ALREADY_USED/);assert.deepEqual(await snapshot(A),old);
});

test('post-reconciliation drift fails replay instead of overwriting',async()=>{
 const e=evidence(A);await call(A,e);await query("update public.payments set status='ready_for_payout' where request_id=$1",[A]);
 await assert.rejects(call(A,e),/REPLAY_CONFLICT/);
});

test('explicit UTC dashboard timezone works without assuming workstation timezone',async()=>{
 const e=evidence(B);e.refund_display_timezone='UTC';e.refund.created=Date.parse('2026-09-04T22:22:18Z')/1000;
 await call(B,e);const s=await snapshot(B);
 assert.equal(Date.parse(s.change_orders[0].refunded_at),e.refund.created*1000);
});

test('both cases roll back together if the second evidence fails',async()=>{
 const a=await snapshot(A),b=await snapshot(B),e=evidence(B);e.refund.id='re_other';
 await pg.exec('begin');
 try{await call(A,evidence(A));await assert.rejects(call(B,e),/REFUND_CONFLICT/);}
 finally{await pg.exec('rollback');}
 assert.deepEqual(await snapshot(A),a);assert.deepEqual(await snapshot(B),b);
 assert.equal((await query('select count(*) n from public.historical_release_reconciliations')).rows[0].n,0);
});

test('projection failure rolls back archive and evidence, retry succeeds',async()=>{
 const old=await snapshot(B),e=evidence(B);
 await pg.exec("create function public.fail_historical_projection() returns trigger language plpgsql as $$ begin raise exception 'TEST_FAIL'; end $$;create trigger z_fail before update on public.change_orders for each row execute function public.fail_historical_projection()");
 try{await assert.rejects(call(B,e),/TEST_FAIL/);assert.deepEqual(await snapshot(B),old);assert.equal((await query('select count(*) n from public.historical_release_reconciliations')).rows[0].n,0);}
 finally{await pg.exec('drop trigger z_fail on public.change_orders;drop function public.fail_historical_projection()');}
 assert.equal((await call(B,e)).reconciled,true);
});
test('operator only; no generic target or forged direct projection',async()=>{
 await assert.rejects(call(customer,evidence(A)),/CASE_NOT_ALLOWED/);
 await assert.rejects(pg.exec("update public.change_orders set refunded_amount=52.5,stripe_refund_id='re_forged',refunded_at=now()"),/RECEIPT_REQUIRED/);
 for(const role of ['anon','authenticated','service_role']){
  await pg.exec('set role '+role);
  await assert.rejects(call(A,evidence(A)),/permission denied/);
  await assert.rejects(query("insert into public.historical_release_reconciliations(request_id,outcome,evidence,before_state,after_state) values($1,'retired_invalid_plan','{}','{}','{}')",[B]),/permission denied/);
  await pg.exec('reset role');
 }
});

test('migration refuses a changed existing receipt guard',async()=>{
 const other=new PGlite();
 try{
  await setup(other,fs,path,false);
  await other.exec("create or replace function public.financial_receipt_matches(p_instruction jsonb,p_receipt jsonb) returns boolean language sql as 'select true'");
  await assert.rejects(other.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202609270002_historical_release_reconciliation.sql'),'utf8')),/GUARD_DEFINITION_DRIFT/);
  await other.exec('rollback');
  assert.equal((await other.query("select to_regclass('public.historical_release_reconciliations') t")).rows[0].t,null);
 }finally{await other.close();}
});

test('offline renderer defaults to rollback, escapes notes and refuses test IDs',()=>{
 const vm=require('node:vm'),script=fs.readFileSync(path.join(__dirname,'../scripts/render-historical-reconciliation.cjs'),'utf8');
 let written;
 const a=evidence(A),b=evidence(B);a.reference="Operator's reviewed export";
 const inputs={a:Buffer.from(JSON.stringify(a)),b:Buffer.from(JSON.stringify(b))};
 const run=(mode)=>vm.runInNewContext(script,{require:name=>name==='node:fs'?{
  readFileSync:file=>inputs[file],writeFileSync:(file,content,opts)=>{assert.equal(opts.flag,'wx');written=content;}
 }:require(name),process:{argv:['node','renderer','a','b','out.sql',...(mode?[mode]:[])]},console:{log(){}}});
 run();assert.match(written,/rollback;\n$/);assert.match(written,/Operator''s reviewed export/);
 assert.equal((written.match(/select public.reconcile_historical_release_20260927/g)||[]).length,2);
 run('--commit');assert.match(written,/commit;\n$/);
 a.transfers.data[0].id='tr_TestFixture';inputs.a=Buffer.from(JSON.stringify(a));
 assert.throws(()=>run(),/Synthetic or incomplete/);
});
