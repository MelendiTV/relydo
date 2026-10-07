/* eslint-disable @typescript-eslint/no-require-imports -- Isolated local PostgreSQL harness. */
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const setup = require('./fixtures/historical-reconciliation-setup.cjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let pg;
const query = (sql,args=[]) => pg.query(sql,args);
const count = async () => (await query('select count(*)::int n from referral_credit_ledger')).rows[0].n;
function receipt(job=10) {
 return {id:`tr_${job}`,amount:9000,currency:'usd',kind:'transfer',charge_id:`ch_${job}`,
  direction:'to_provider',origin:`ch_${job}`,destination:'acct_pro',status:'succeeded',
  source:{paymentId:id(job+100),paymentIntentId:`pi_${job}`,changeOrderId:null,fundingSourceId:null}};
}
function evidence(job=10) {
 return [{transfer_id:`tr_${job}`,charge_id:`ch_${job}`,payment_intent_id:`pi_${job}`,
 destination:'acct_pro',amount:9000,currency:'usd',paid:true,disputed:false,refunded:false,
 amount_refunded:0,has_refunds:false,reversed:false,amount_reversed:0,observed_at:new Date().toISOString()}];
}
const award = async (job=10,e=evidence(job)) => (await query('select award_customer_referral($1,$2) result',[id(job),e===null?null:JSON.stringify(e)])).rows[0].result.outcome;
async function job(n=10) {
 await query("insert into service_requests(id,customer_id,preferred_provider_id,status,job_stage) values($1,$2,$3,'completed','working')",[id(n),id(2),id(3)]);
 await query(`insert into payments(id,request_id,provider_id,provider_payment_id,currency,status,provider_net_amount,customer_total_amount,refunded_amount,paid_at,stripe_transfer_id,released_at)
 values($1,$2,$3,$4,'USD','paid_out',90,105,0,clock_timestamp(),$5,clock_timestamp())`,[id(n+100),id(n),id(3),`pi_${n}`,`tr_${n}`]);
 const r=receipt(n),params={amount:9000,currency:'usd',destination:'acct_pro',source_transaction:r.charge_id};
 const plan=[{kind:r.kind,chargeId:r.charge_id,currency:r.currency,direction:r.direction,origin:r.origin,destination:r.destination,source:r.source,params}];
 await query("insert into job_financial_resolutions(request_id,owner,decision,plan,state) values($1,'automatic_release',$2,$3,'executing')",[id(n),JSON.stringify({plan}),JSON.stringify(plan)]);
 await query("insert into job_financial_steps(request_id,kind,charge_id,params,receipt,confirmed_at) values($1,'transfer',$2,$3,$4,now())",[id(n),r.charge_id,JSON.stringify(params),JSON.stringify(r)]);
}
before(async()=>{
 pg=new PGlite(); await setup(pg,fs,path,false);
 await pg.exec('alter table service_requests add column created_at timestamptz not null default clock_timestamp()');
 await pg.exec('create table auth.users(id uuid primary key,raw_user_meta_data jsonb); create table profiles(id uuid primary key,role text not null);');
 await pg.exec(fs.readFileSync('supabase/migrations/202610060003_customer_referrals_foundation.sql','utf8'));
 await pg.exec(fs.readFileSync('supabase/migrations/202610070001_customer_referral_awards.sql','utf8'));
 await pg.exec(fs.readFileSync('supabase/migrations/202610070002_customer_referral_first_job.sql','utf8'));
});
beforeEach(async()=>{
 await pg.exec("reset role;set request.jwt.claim.role='service_role';truncate customer_referral_award_pending,referral_credit_ledger,customer_referrals,customer_referral_codes,profiles,auth.users,job_financial_steps,job_financial_resolutions,payments,change_orders,job_claims,payment_reassignments,payment_reassignment_funding_sources,service_requests cascade");
 await query("insert into auth.users values($1,'{}')",[id(1)]);
 await query("insert into profiles values($1,'customer')",[id(1)]);
 const code=(await query('select code from customer_referral_codes where customer_id=$1',[id(1)])).rows[0].code;
 await query('insert into auth.users values($1,$2)',[id(2),JSON.stringify({referral_code:code})]);
 await query("insert into profiles values($1,'customer'),($2,'provider')",[id(2),id(3)]);
 await job();
});
after(async()=>pg?.close());

test('both $15 awards are atomic, source-linked and idempotent across retries/jobs',async()=>{
 assert.equal(await award(10,null),'needs_evidence'); assert.equal(await count(),0);
 assert.equal(await award(),'awarded');
 const rows=(await query('select beneficiary_id,amount_cents,qualifying_request_id from referral_credit_ledger order by beneficiary_id')).rows;
 assert.deepEqual(rows,[{beneficiary_id:id(1),amount_cents:1500,qualifying_request_id:id(10)},{beneficiary_id:id(2),amount_cents:1500,qualifying_request_id:id(10)}]);
 assert.equal(await award(),'already_awarded'); await job(11);
 const results=await Promise.all([award(10),award(11),award(11)]);
 assert.deepEqual(results,['already_awarded','already_awarded','already_awarded']); assert.equal(await count(),2);
});
test('second insert failure rolls back first award and settlement, then retry succeeds',async()=>{
 await pg.exec("create function fail_second_award() returns trigger language plpgsql as $$ begin if new.award_kind='referred' then raise exception 'INJECTED'; end if; return new; end $$;create trigger injected before insert on referral_credit_ledger for each row execute function fail_second_award()");
 try { await assert.rejects(award(),/INJECTED/);assert.equal(await count(),0);
 assert.equal((await query('select state from job_financial_resolutions')).rows[0].state,'executing');
 assert.equal((await query('select finished_at from customer_referral_award_pending')).rows[0].finished_at,null);
 } finally { await pg.exec('drop trigger injected on referral_credit_ledger;drop function fail_second_award()'); }
 assert.equal(await award(),'awarded');
});
test('release queues durable retry; reading pending work never moves money',async()=>{
 assert.equal((await query('select pending_customer_referral_awards() id')).rows[0].id,id(10));
 assert.equal(await count(),0);assert.equal(await award(),'awarded');
 assert.equal((await query('select pending_customer_referral_awards()')).rows.length,0);
});
for(const [name,sql] of [
 ['not completed',"update service_requests set status='in_progress'"],
 ['same customer and Pro',`update service_requests set preferred_provider_id='${id(2)}'`],
 ['referrer as Pro',`update service_requests set preferred_provider_id='${id(1)}'`],
 ['unreleased',"update payments set released_at=null"],
 ['unpaid',"update payments set status='paid'"],
 ['zero value',"update payments set customer_total_amount=0"],
 ['zero Pro transfer',"update payments set provider_net_amount=0"],
 ['refund',"update payments set refunded_amount=1"],
 ['dispute',"update payments set status='disputed'"],
 ['before referral',"update payments set paid_at='2020-01-01'"],
 ['wrong currency',"update payments set currency='EUR'"],
 ['missing transfer',"update payments set stripe_transfer_id=null"],
 ['claim',`insert into job_claims(request_id,status) values('${id(10)}','open')`],
 ['wrong resolution owner',"update job_financial_resolutions set owner='customer_cancel'"],
])test(`ineligible: ${name} gives no credits`,async()=>{
 // Inject historical/inconsistent states in the isolated fixture, even when
 // the existing lifecycle guards already prevent creating them through APIs.
 await pg.exec('set session_replication_role=replica');
 try { await pg.exec(sql); } finally { await pg.exec('set session_replication_role=origin'); }
 assert.equal(await award(),'ineligible');assert.equal(await count(),0);
});
for(const [name,change] of [
 ['refunded',e=>{e.refunded=true;}],['partial refund',e=>{e.amount_refunded=1;}],
 ['pending refund',e=>{e.has_refunds=true;}],['disputed',e=>{e.disputed=true;}],
 ['reversed',e=>{e.amount_reversed=1;}],['unpaid',e=>{e.paid=false;}],
 ['wrong charge',e=>{e.charge_id='ch_wrong';}],['wrong PI',e=>{e.payment_intent_id='pi_wrong';}],
 ['wrong beneficiary',e=>{e.destination='acct_wrong';}],['wrong amount',e=>{e.amount=1;}],
 ['wrong transfer',e=>{e.transfer_id='tr_wrong';}],['stale',e=>{e.observed_at='2020-01-01';}],
 ['missing observed time',e=>{delete e.observed_at;}],
])test(`reject Stripe evidence: ${name}`,async()=>{const e=evidence();change(e[0]);await assert.rejects(award(10,e),/REFERRAL_EVIDENCE_MISMATCH/);assert.equal(await count(),0);});
test('incomplete plan and missing receipts cannot award',async()=>{
 await pg.exec("update job_financial_steps set receipt=null,confirmed_at=null");
 await assert.rejects(award(),/REFERRAL_EVIDENCE_MISMATCH/);assert.equal(await count(),0);
});
test('final settlement rejects a receipt whose source differs from the immutable plan',async()=>{
 await pg.exec("update job_financial_resolutions set plan=jsonb_set(plan,'{0,source,paymentIntentId}','\"pi_other\"')");
 await assert.rejects(award(),/FINANCIAL_RESOLUTION_INCOMPLETE/);assert.equal(await count(),0);
});
test('partial historical ledger requires reconciliation, never fills one side',async()=>{
 await query("insert into referral_credit_ledger(referral_id,beneficiary_id,award_kind,amount_cents) values($1,$2,'referrer',1500)",[id(2),id(1)]);
 await assert.rejects(award(),/REFERRAL_PARTIAL_LEDGER/);assert.equal(await count(),1);
});
test('SDK roles cannot mint credits or access retry work directly',async()=>{
 for(const role of ['anon','authenticated','service_role']) {
 await pg.exec(`set role ${role}`);
 if(role!=='service_role')await assert.rejects(award(),/permission denied/);
 await assert.rejects(query("insert into referral_credit_ledger(referral_id,beneficiary_id,award_kind,amount_cents) values($1,$2,'referrer',1500)",[id(2),id(1)]),/permission denied/);
 await assert.rejects(query('select * from customer_referral_award_pending'),/permission denied/);
 await pg.exec('reset role');
 }
 await pg.exec("set request.jwt.claim.role='authenticated'");
 await assert.rejects(award(),/SERVICE_ROLE_REQUIRED/);
});

for(const [name,sql] of [
 ['refund',"update payments set refunded_amount=1 where request_id=$1"],
 ['dispute',"update payments set status='disputed' where request_id=$1"],
 ['ineligible',"update service_requests set status='cancelled' where id=$1"],
])test('first job '+name+' never transfers eligibility to second job',async()=>{
 await pg.exec('set session_replication_role=replica');
 try { await query(sql,[id(10)]); } finally { await pg.exec('set session_replication_role=origin'); }
 await job(11);
 assert.equal(await award(),'ineligible');
 assert.equal(await award(11),'ineligible');
 assert.equal(await award(11),'ineligible');assert.equal(await count(),0);
});
for(const incident of ['refunded','disputed','reversed'])test('first job Stripe '+incident+' blocks second even when second releases first',async()=>{
 await job(11);
 assert.equal(await award(11),'ineligible');
 const e=evidence();e[0][incident]=true;
 await assert.rejects(award(10,e),/REFERRAL_EVIDENCE_MISMATCH/);
 assert.equal(await award(11),'ineligible');assert.equal(await count(),0);
});
test('a pre-referral request blocks later jobs even without payments',async()=>{
 await query("insert into service_requests(id,customer_id,status,created_at) values($1,$2,'cancelled','2020-01-01')",[id(9),id(2)]);
 assert.equal(await award(),'ineligible');await job(11);
 assert.equal(await award(11),'ineligible');assert.equal(await count(),0);
});
test('a request created before referral cannot qualify with a later payment',async()=>{
 await query("update service_requests set created_at='2020-01-01' where id=$1",[id(10)]);
 assert.equal(await award(),'ineligible');assert.equal(await count(),0);
});
test('equal creation timestamps use request id for stable first-job order',async()=>{
 await job(11);
 await query('update service_requests set created_at=(select created_at from service_requests where id=$1)',[id(10)]);
 assert.equal(await award(11),'ineligible');assert.equal(await award(),'awarded');
});
test('multiple paid change orders still belong to one first request',async()=>{
 const allEvidence=evidence();
 const plan=(await query('select plan from job_financial_resolutions where request_id=$1',[id(10)])).rows[0].plan;
 // Seed historical children; lifecycle guards forbid adding them after completion.
 await pg.exec('set session_replication_role=replica');
 try {
  for(const n of [200,201]) {
   await query("insert into change_orders(id,request_id,customer_id,provider_id,original_amount,additional_amount,new_total_amount,status,payment_status,stripe_payment_intent_id,paid_at,additional_customer_total_amount,additional_provider_net_amount,stripe_transfer_id,released_at) values($1,$2,$3,$4,90,90,180,'accepted','paid',$5,now(),105,90,$6,now())",[id(n),id(10),id(2),id(3),'pi_'+n,'tr_'+n]);
   const r=receipt(n);r.source.paymentId=null;r.source.changeOrderId=id(n);
   const params={amount:9000,currency:'usd',destination:'acct_pro',source_transaction:r.charge_id};
   plan.push({kind:r.kind,chargeId:r.charge_id,currency:r.currency,direction:r.direction,origin:r.origin,destination:r.destination,source:r.source,params});
   await query("insert into job_financial_steps(request_id,kind,charge_id,params,receipt,confirmed_at) values($1,'transfer',$2,$3,$4,now())",[id(10),r.charge_id,JSON.stringify(params),JSON.stringify(r)]);
   allEvidence.push(...evidence(n));
  }
  await query('update job_financial_resolutions set plan=$2,decision=$3 where request_id=$1',[id(10),JSON.stringify(plan),JSON.stringify({plan})]);
 } finally { await pg.exec('set session_replication_role=origin'); }
 await job(11);
 assert.equal(await award(11),'ineligible');assert.equal(await award(10,allEvidence),'awarded');
 assert.equal(await award(10,allEvidence),'already_awarded');assert.equal(await count(),2);
 assert.deepEqual((await query('select distinct qualifying_request_id from referral_credit_ledger')).rows,[{qualifying_request_id:id(10)}]);
});
