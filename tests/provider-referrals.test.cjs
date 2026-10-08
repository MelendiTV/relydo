/* eslint-disable @typescript-eslint/no-require-imports -- Offline PostgreSQL harness. */
const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const setup=require('./fixtures/historical-reconciliation-setup.cjs');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
let pg;const q=(s,a=[])=>pg.query(s,a);const scalar=async(s,a=[])=>Object.values((await q(s,a)).rows[0])[0];
const read=p=>fs.readFileSync(p,'utf8');
async function signup(n,role='provider',code){
 await q('insert into auth.users values($1,$2)',[id(n),JSON.stringify(code?{[role==='provider'?'provider_referral_code':'referral_code']:code}:{})]);
 await q('insert into profiles values($1,$2)',[id(n),role]);
 if(role==='provider')await q("insert into provider_profiles values($1,true,'verified',$2)",[id(n),'acct_pro'+n]);
}
function receipt(n=10,pro=2){return {id:'tr_'+n,amount:9000,currency:'usd',kind:'transfer',charge_id:'ch_'+n,
 direction:'to_provider',origin:'ch_'+n,destination:'acct_pro'+pro,status:'succeeded',
 source:{paymentId:id(n+100),paymentIntentId:'pi_'+n,changeOrderId:null,fundingSourceId:null}};}
function evidence(n=10,pro=2){const r=receipt(n,pro);return [{transfer_id:r.id,charge_id:r.charge_id,payment_intent_id:r.source.paymentIntentId,
 destination:r.destination,amount:9000,currency:'usd',paid:true,disputed:false,refunded:false,amount_refunded:0,
 has_refunds:false,reversed:false,amount_reversed:0,observed_at:new Date().toISOString()}];}
async function job(n=10,pro=2){
 await q("insert into service_requests(id,customer_id,preferred_provider_id,status,job_stage) values($1,$2,$3,'completed','working')",[id(n),id(3),id(pro)]);
 await q("insert into payments(id,request_id,provider_id,provider_payment_id,currency,status,provider_net_amount,customer_total_amount,refunded_amount,paid_at,stripe_transfer_id,released_at) values($1,$2,$3,$4,'USD','paid_out',90,90,0,clock_timestamp(),$5,clock_timestamp())",[id(n+100),id(n),id(pro),'pi_'+n,'tr_'+n]);
 const r=receipt(n,pro),params={amount:9000,currency:'usd',destination:r.destination,source_transaction:r.charge_id};
 const plan=[{kind:r.kind,chargeId:r.charge_id,currency:r.currency,direction:r.direction,origin:r.origin,destination:r.destination,source:r.source,params}];
 await q("insert into job_financial_resolutions(request_id,owner,decision,plan,state) values($1,'automatic_release',$2,$3,'executing')",[id(n),JSON.stringify({plan}),JSON.stringify(plan)]);
 await q("insert into job_financial_steps(request_id,kind,charge_id,params,receipt,confirmed_at) values($1,'transfer',$2,$3,$4,now())",[id(n),r.charge_id,JSON.stringify(params),JSON.stringify(r)]);
}
const award=async(n=10,e=evidence(n))=>scalar('select award_provider_referral($1,$2)',[id(n),e===null?null:JSON.stringify(e)]);
const reserve=async(n=10,e=evidence(n))=>scalar('select reserve_provider_referral_bonus($1,$2)',[id(n),e===null?null:JSON.stringify(e)]);
async function seed(sql,args=[]){
 for(const table of ['service_requests','change_orders','job_claims','payment_reassignments'])await pg.exec('alter table '+table+' disable trigger user');
 try{return await q(sql,args);}finally{for(const table of ['service_requests','change_orders','job_claims','payment_reassignments'])await pg.exec('alter table '+table+' enable trigger user');}
}
const count=()=>scalar('select count(*)::int from provider_referral_credit_ledger');
function bonusReceipt(d){return {id:'tr_bonus'+d.id.replaceAll('-',''),amount:2500,currency:'usd',destination:d.destination,source_transaction:null,
 transfer_group:'relydo_pro_bonus_'+d.id,reversed:false,amount_reversed:0,metadata:{provider_referral_redemption_id:d.id}};}
before(async()=>{
 pg=new PGlite();await setup(pg,fs,path,false);
 await pg.exec(`alter table service_requests add column created_at timestamptz default clock_timestamp();
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
 create table profiles(id uuid primary key,role text);
 create table provider_profiles(user_id uuid primary key,verified boolean,verification_status text,stripe_account_id text);
 create or replace function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';`);
 // Both customer and Pro programs coexist, unchanged customer migrations.
 for(const p of ['202610060003_customer_referrals_foundation','202610070001_customer_referral_awards','202610070002_customer_referral_first_job','202610080001_provider_referrals_foundation','202610080002_provider_referral_release_bonus'])await pg.exec(read('supabase/migrations/'+p+'.sql'));
});
beforeEach(async()=>{
 await pg.exec("reset role;set request.jwt.claim.role='service_role';truncate provider_referral_pending,provider_referral_redemptions,provider_referral_credit_ledger,provider_referrals,provider_referral_codes,customer_referral_award_pending,referral_credit_ledger,customer_referrals,customer_referral_codes,provider_profiles,profiles,auth.users,job_financial_steps,job_financial_resolutions,payments,change_orders,job_claims,payment_reassignments,payment_reassignment_funding_sources,service_requests cascade");
 await signup(1);const code=await scalar('select code from provider_referral_codes where provider_id=$1',[id(1)]);
 await signup(2,'provider',code.toLowerCase());await signup(3,'customer');await job();
});
after(async()=>pg?.close());
test('signup capture immutable; customer credit and codes are separate',async()=>{
 assert.equal(await scalar('select referrer_id from provider_referrals'),id(1));assert.equal(await scalar('select count(*)::int from customer_referrals'),0);
 await assert.rejects(q('update provider_referrals set referrer_id=$1',[id(3)]),/immutable/);
 await assert.rejects(q('delete from provider_referrals'),/immutable/);
 await q("update auth.users set raw_user_meta_data='{}' where id=$1",[id(2)]);
 assert.equal(await scalar('select referrer_id from provider_referrals'),id(1));
 await assert.rejects(signup(4,'provider','REL-ABCDEFGH23'),/Invalid referral/);
 await assert.rejects(q('insert into provider_referrals(referred_id,referrer_id,code) select provider_id,provider_id,code from provider_referral_codes where provider_id=$1',[id(1)]),/check constraint/);
});
test('first release pays A immediately and unlocks B; next release pays B in full',async()=>{
 assert.equal((await award(10,null)).outcome,'needs_evidence');assert.equal(await count(),0);
 assert.equal((await award()).outcome,'awarded');assert.equal(await count(),2);
 assert.deepEqual((await q('select amount_cents from provider_referral_credit_ledger')).rows,[{amount_cents:2500},{amount_cents:2500}]);
 assert.equal((await award()).outcome,'already_awarded');assert.equal(await scalar('select count(*)::int from referral_credit_ledger'),0);
 const d=(await reserve()).redemption;assert.equal(d.amount_cents,2500);assert.equal(d.beneficiary_id,id(1));
 await q('select record_provider_referral_bonus($1,$2)',[d.id,JSON.stringify(bonusReceipt(d))]);
 assert.equal(Number(await scalar('select provider_net_amount from payments'))+d.amount_cents/100,115);
 assert.deepEqual((await reserve()).redemption.receipt,bonusReceipt(d));
 await job(11);const b=(await reserve(11,evidence(11))).redemption;assert.equal(b.beneficiary_id,id(2));assert.equal(b.amount_cents,2500);
 await q('select record_provider_referral_bonus($1,$2)',[b.id,JSON.stringify(bonusReceipt(b))]);
});
test('failed second award rolls back first and settlement',async()=>{
 await pg.exec("create function fail_pro_award() returns trigger language plpgsql as $$ begin if new.award_kind='referred' then raise exception 'INJECTED'; end if;return new;end $$;create trigger fail_pro_award before insert on provider_referral_credit_ledger for each row execute function fail_pro_award()");
 await assert.rejects(award(),/INJECTED/);assert.equal(await count(),0);
 assert.equal(await scalar('select state from job_financial_resolutions'),'executing');
 await pg.exec('drop trigger fail_pro_award on provider_referral_credit_ledger;drop function fail_pro_award()');
 assert.equal((await award()).outcome,'awarded');
});
for(const [name,sql] of [
 ['not verified',"update provider_profiles set verified=false where user_id='"+id(2)+"'"],
 ['verification pending',"update provider_profiles set verification_status='pending' where user_id='"+id(2)+"'"],
 ['incomplete job',"update service_requests set status='working'"],
 ['unpaid',"update payments set status='pending'"],
 ['missing release',"update payments set released_at=null"],
 ['missing transfer',"update payments set stripe_transfer_id=null"],
 ['refund',"update payments set refunded_amount=1"],
 ['dispute',"update payments set status='disputed'"],
 ['claim',"insert into job_claims(request_id,status) select id,'closed' from service_requests"],
 ['reassignment incident',"insert into payment_reassignments(request_id,status) select id,'cancelled' from service_requests"],
 ['zero real amount',"update payments set customer_total_amount=0"],
 ['non-USD',"update payments set currency='EUR'"],
 ['wrong provider payment',"update payments set provider_id='"+id(1)+"'"],
 ['release reconciliation',"update job_financial_resolutions set state='reconciliation_required'"],
 ['fake self job',"update service_requests set customer_id=preferred_provider_id"],
 ['referrer is customer',"update service_requests set customer_id='"+id(1)+"'"],
])test('no award: '+name,async()=>{await seed(sql);assert.equal((await award()).outcome,'ineligible');assert.equal(await count(),0);});
for(const [name,change] of [
 ['refund',e=>e[0].amount_refunded=1],['dispute',e=>e[0].disputed=true],['reversal',e=>e[0].reversed=true],
 ['stale',e=>e[0].observed_at='2020-01-01'],['wrong charge',e=>e[0].charge_id='ch_wrong'],['incomplete',e=>e.pop()],
])test('fresh full Stripe evidence required: '+name,async()=>{const e=evidence();change(e);await assert.rejects(award(10,e),/PRO_REFERRAL_EVIDENCE/);assert.equal(await count(),0);});
for(const [name,sql] of [
 ['cancelled',"update service_requests set status='cancelled' where id='"+id(10)+"'"],
 ['refund',"update payments set refunded_amount=1 where request_id='"+id(10)+"'"],
 ['dispute',"update payments set status='disputed' where request_id='"+id(10)+"'"],
 ['claim',"insert into job_claims(request_id,status) values('"+id(10)+"','closed')"],
 ['financial incident',"update job_financial_resolutions set state='reconciliation_required' where request_id='"+id(10)+"'"],
 ['unpaid',"update payments set status='pending' where request_id='"+id(10)+"'"],
 ['unconfirmed release',"update payments set released_at=null where request_id='"+id(10)+"'"],
])test('ineligible first job leaves bonus pending until eligible release: '+name,async()=>{
 await seed(sql);assert.equal((await award()).outcome,'ineligible');assert.equal(await count(),0);
 await job(11);assert.equal((await award(11,null)).outcome,'needs_evidence');assert.equal(await count(),0);
 assert.equal((await award(11,evidence(11))).outcome,'awarded');assert.equal(await count(),2);
 assert.deepEqual((await q('select qualifying_request_id,amount_cents from provider_referral_credit_ledger')).rows,
  [{qualifying_request_id:id(11),amount_cents:2500},{qualifying_request_id:id(11),amount_cents:2500}]);
 const d=(await reserve(11,evidence(11))).redemption;assert.equal(d.amount_cents,2500);
 await job(12);assert.equal((await award(12,evidence(12))).outcome,'already_awarded');assert.equal(await count(),2);
});

test('no backfill: eligible jobs before referral never award or block a later eligible release',async()=>{
 await seed("update service_requests set created_at=(select created_at-interval '1 second' from provider_referrals where referred_id=$1) where id=$2",[id(2),id(10)]);
 assert.equal((await award()).outcome,'ineligible');assert.equal(await count(),0);
 await job(11);assert.equal((await award(11,evidence(11))).outcome,'awarded');assert.equal(await count(),2);
});

test('remote-only refund/dispute evidence does not consume referral opportunity',async()=>{
 for(const change of [e=>e[0].has_refunds=true,e=>e[0].disputed=true]){
  const e=evidence();change(e);await assert.rejects(award(10,e),/PRO_REFERRAL_EVIDENCE/);assert.equal(await count(),0);
 }
 await job(11);assert.equal((await award(11,evidence(11))).outcome,'awarded');assert.equal(await count(),2);
});

test('change orders are not jobs and must all be released',async()=>{
 await seed("insert into change_orders(id,request_id,customer_id,provider_id,original_amount,additional_amount,new_total_amount,status,payment_status,additional_provider_net_amount) values($1,$2,$3,$4,100,10,110,'accepted','paid',9)",[id(99),id(10),id(3),id(2)]);
 assert.equal((await award()).outcome,'ineligible');
});
test('B cannot consume first job; credit is exclusive to next release; A needs no own job',async()=>{
 await award();const a=(await reserve()).redemption;assert.equal(a.beneficiary_id,id(1));
 await job(11);const b=(await reserve(11,evidence(11))).redemption;assert.equal(b.beneficiary_id,id(2));
 await job(12);assert.equal((await reserve(12,evidence(12))).outcome,'no_credit');
 await job(13,1);assert.equal((await reserve(13,evidence(13,1))).outcome,'no_credit');
 assert.equal(await scalar('select count(*)::int from provider_referral_redemptions'),2);
});
test('existing reservation keeps original destination and credit on retry; authorization blocks new send after incident',async()=>{
 await award();const d=(await reserve()).redemption;
 await q("update provider_profiles set stripe_account_id='acct_changed' where user_id=$1",[id(1)]);
 assert.equal((await reserve()).redemption.destination,d.destination);
 assert.equal((await scalar('select authorize_provider_referral_bonus($1,$2)',[d.id,JSON.stringify(evidence())])).allowed,false);
 // Remote success recovery remains recordable, never reissued elsewhere.
 await q('select record_provider_referral_bonus($1,$2)',[d.id,JSON.stringify(bonusReceipt(d))]);
});
test('mismatched/partial bonus receipt rejected; exact repeat allowed',async()=>{
 await award();const d=(await reserve()).redemption;const r=bonusReceipt(d);
 await assert.rejects(q('select record_provider_referral_bonus($1,$2)',[d.id,JSON.stringify({...r,amount:1000})]),/RECEIPT_MISMATCH/);
 await q('select record_provider_referral_bonus($1,$2)',[d.id,JSON.stringify(r)]);
 await q('select record_provider_referral_bonus($1,$2)',[d.id,JSON.stringify(r)]);
 await assert.rejects(q('select record_provider_referral_bonus($1,$2)',[d.id,JSON.stringify({...r,id:'tr_other'})]),/CONFLICT/);
});
test('service role cannot directly mint/mutate credits; anon/auth cannot call award/spend',async()=>{
 await pg.exec('set role service_role');await assert.rejects(q('insert into provider_referral_credit_ledger default values'),/permission denied/);
 await assert.rejects(q('delete from provider_referral_redemptions'),/permission denied/);await pg.exec('reset role;set role authenticated');
 await assert.rejects(award(),/permission denied/);await assert.rejects(reserve(),/permission denied/);
 await pg.exec("reset role;set request.jwt.claim.sub='"+id(2)+"';set role authenticated");
 assert.equal((await q('select * from provider_referral_codes')).rows.length,1);
 assert.equal((await scalar('select my_provider_referral_summary()')).available_cents,0);
 await pg.exec('reset role');
});
test('pending queue is durable with release save; retry query isolated',async()=>{
 assert.deepEqual(await scalar('select json_agg(value) from pending_provider_referrals() value'),[id(10)]);
 await award();const d=(await reserve()).redemption;await q('select record_provider_referral_bonus($1,$2)',[d.id,JSON.stringify(bonusReceipt(d))]);
 assert.equal(await scalar('select json_agg(value) from pending_provider_referrals() value'),null);
});

test('customer + Pro awards coexist on same request; ledgers/spending remain separate',async()=>{
 await signup(4,'customer');const code=await scalar('select code from customer_referral_codes where customer_id=$1',[id(4)]);
 await signup(5,'customer',code);await seed('update service_requests set customer_id=$1,created_at=clock_timestamp()',[id(5)]);await q('update payments set paid_at=clock_timestamp()');
 assert.equal((await scalar('select award_customer_referral($1,$2)',[id(10),JSON.stringify(evidence())])).outcome,'awarded');
 assert.equal((await award()).outcome,'awarded');assert.equal(await count(),2);
 assert.equal(await scalar('select sum(amount_cents)::int from referral_credit_ledger'),3000);
 const d=(await reserve()).redemption;assert.equal(d.amount_cents,2500);
 assert.equal(await scalar('select sum(amount_cents)::int from referral_credit_ledger'),3000);
});
test('concurrent callers reserve one credit/job and award exactly twice',async()=>{
 const awards=await Promise.all([award(),award(),award()]);assert.deepEqual(awards.map(a=>a.outcome),['awarded','already_awarded','already_awarded']);
 const reservations=await Promise.all([reserve(),reserve(),reserve()]);assert.equal(new Set(reservations.map(r=>r.redemption.id)).size,1);
 assert.equal(await scalar('select count(*)::int from provider_referral_redemptions'),1);
});

for(const [name,sql] of [
 ['cancelled',"update service_requests set status='cancelled' where id='"+id(11)+"'"],
 ['refund',"update payments set refunded_amount=1 where request_id='"+id(11)+"'"],
 ['dispute',"update payments set status='disputed' where request_id='"+id(11)+"'"],
 ['incident',"insert into job_claims(request_id,status) values('"+id(11)+"','closed')"],
])test('B second ineligible attempt keeps full credit for next eligible release: '+name,async()=>{
 await award();await reserve();await job(11);await seed(sql);
 assert.equal((await reserve(11,evidence(11))).outcome,'ineligible');
 assert.equal(await scalar("select count(*)::int from provider_referral_redemptions where beneficiary_id='"+id(2)+"'"),0);
 await job(12);const d=(await reserve(12,evidence(12))).redemption;
 assert.equal(d.beneficiary_id,id(2));assert.equal(d.amount_cents,2500);
});

test('A authorization uses B release evidence and A destination',async()=>{
 await award();const d=(await reserve()).redemption;
 assert.equal(d.destination,'acct_pro1');
 assert.equal((await scalar('select authorize_provider_referral_bonus($1,$2)',[d.id,JSON.stringify(evidence())])).allowed,true);
});
test('B cannot backfill old releases or pre-relation requests; remote refund leaves credit pending',async()=>{
 await job(11);await award();await reserve();
 assert.equal((await reserve(11,evidence(11))).outcome,'no_credit');
 await job(12);await seed("update service_requests set created_at=(select created_at-interval '1 second' from provider_referrals where referred_id=$1) where id=$2",[id(2),id(12)]);
 assert.equal((await reserve(12,evidence(12))).outcome,'no_credit');
 await job(13);const e=evidence(13);e[0].has_refunds=true;
 await assert.rejects(reserve(13,e),/PRO_REFERRAL_EVIDENCE/);
 await job(14);const d=(await reserve(14,evidence(14))).redemption;assert.equal(d.beneficiary_id,id(2));
 assert.equal((await scalar('select authorize_provider_referral_bonus($1,$2)',[d.id,JSON.stringify(evidence(14))])).allowed,true);
});
