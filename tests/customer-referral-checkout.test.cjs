/* eslint-disable @typescript-eslint/no-require-imports -- Local database and route harness. */
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let pg;
const query = (sql,args=[]) => pg.query(sql,args);
function snapshot(job=10, offer=20, price=100, fee=5, commission=10) {
 const money=n=>Math.round((n+Number.EPSILON)*100)/100;
 const f=money(price*fee/100),c=money(price*commission/100);
 return {payment_type:'initial_job',payment_flow:'web',request_id:id(job),offer_id:id(offer),customer_id:id(2),professional_id:id(3),payment_settings_id:id(4),professional_price:price.toFixed(2),customer_fee_percent:fee.toFixed(2),customer_fee_amount:f.toFixed(2),customer_total:(price+f).toFixed(2),provider_commission_percent:commission.toFixed(2),provider_commission_amount:c.toFixed(2),provider_net_amount:(price-c).toFixed(2),platform_revenue_amount:(f+c).toFixed(2),currency:'USD'};
}
const reserve=async(use=true,job=10,offer=20,m=snapshot(job,offer))=>(await query('select reserve_referral_checkout($1,$2,$3,$4,$5) r',[id(2),id(job),id(offer),use,JSON.stringify(m)])).rows[0].r;
const balance=async(customer=2)=>Number((await query('select referral_credit_balance($1) n',[id(customer)])).rows[0].n);
const attach=(r,pi='pi1',cs='cs1')=>query('select attach_referral_checkout($1,$2,$3)',[r.id,cs,pi]);
const release=r=>query('select return_referral_checkout($1)',[r.id]);
async function pay(r, overrides={}) {
 const m=r.snapshot;
 const data={request_id:r.request_id,offer_id:r.offer_id,customer_id:id(2),provider_id:id(3),job_amount:Number(m.professional_price),customer_fee_percent:Number(m.customer_fee_percent),customer_fee_amount:Number(m.customer_fee_amount),customer_total_amount:Number(m.customer_total),provider_commission_percent:Number(m.provider_commission_percent),provider_commission_amount:Number(m.provider_commission_amount),provider_net_amount:Number(m.provider_net_amount),platform_revenue_amount:Number(m.platform_revenue_amount),currency:'USD',status:'ready_for_payout',payment_provider:'stripe',provider_payment_id:'pi1',referral_credit_reservation_id:r.id,referral_credit_applied:Number(r.amount_cents)/100,customer_charge_amount:Number(r.charge_cents)/100,...overrides};
 const keys=Object.keys(data);await query(`insert into payments(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(data));
}
function load(file) { const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports});return exports; }
const validate=load('app/lib/basePaymentSnapshot.ts').validateBasePaymentSnapshot;
before(async()=>{
 pg=new PGlite();await pg.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
 create table profiles(id uuid primary key,role text);
 create table service_requests(id uuid primary key,customer_id uuid,status text,preferred_provider_id uuid);
 create table offers(id uuid primary key,request_id uuid,professional_id uuid,price numeric,status text);
 create table payment_settings(id uuid primary key,provider_commission_percent numeric,customer_service_fee_percent numeric,currency text,active boolean,created_at timestamptz default now());
 create table payment_reassignments(id uuid primary key default gen_random_uuid(),original_payment_id uuid,available_credit numeric,status text);
 create table payments(id uuid primary key default gen_random_uuid(),request_id uuid,offer_id uuid,customer_id uuid,provider_id uuid,job_amount numeric,customer_fee_percent numeric,customer_fee_amount numeric,customer_total_amount numeric,provider_commission_percent numeric,provider_commission_amount numeric,provider_net_amount numeric,platform_revenue_amount numeric,currency text,status text,payment_provider text,provider_payment_id text,refunded_amount numeric,paid_at timestamptz,updated_at timestamptz);
 grant usage on schema public,auth to anon,authenticated,service_role;`);
 await pg.exec(fs.readFileSync('supabase/migrations/202610060003_customer_referrals_foundation.sql','utf8'));
 await pg.exec(fs.readFileSync('supabase/migrations/202610070003_customer_referral_checkout.sql','utf8'));
});
beforeEach(async()=>{
 await pg.exec("reset role;truncate profiles,auth.users,service_requests,offers,payment_settings,payments cascade");
 await query("insert into auth.users values($1,'{}')",[id(1)]);await query("insert into profiles values($1,'customer')",[id(1)]);
 const code=(await query('select code from customer_referral_codes where customer_id=$1',[id(1)])).rows[0].code;
 await query('insert into auth.users values($1,$2)',[id(2),JSON.stringify({referral_code:code})]);
 await query("insert into profiles values($1,'customer'),($2,'provider')",[id(2),id(3)]);
 await query("insert into service_requests values($1,$2,'open',null),($3,$2,'open',null)",[id(10),id(2),id(11)]);
 await query("insert into offers values($1,$2,$3,100,'pending'),($4,$5,$3,100,'pending')",[id(20),id(10),id(3),id(21),id(11)]);
 await query("insert into payment_settings(id,provider_commission_percent,customer_service_fee_percent,currency,active) values($1,10,5,'USD',true)",[id(4)]);
 await query("insert into referral_credit_ledger(referral_id,beneficiary_id,award_kind,amount_cents) values($1,$1,'referred',1500)",[id(2)]);
});
after(async()=>pg?.close());
test('derived balance: award, reserve, consume, return; no mutable balance',async()=>{
 assert.equal(await balance(),1500);const r=await reserve();assert.equal(r.amount_cents,1500);assert.equal(r.charge_cents,9000);assert.equal(await balance(),0);
 await release(r);assert.equal(await balance(),1500);await release(r);assert.equal(await balance(),1500);
 const next=await reserve();await attach(next);await pay(next);assert.equal(await balance(),0);
 assert.equal((await query("select count(*)::int n from referral_credit_movements where kind='consume'")).rows[0].n,1);
});
test('opt out charges normal amount and leaves balance available',async()=>{
 const r=await reserve(false);assert.equal(r.amount_cents,0);assert.equal(r.charge_cents,10500);assert.equal(await balance(),1500);
 await attach(r);await pay(r);assert.equal(await balance(),1500);
});
test('margin caps credit and remaining credit stays available',async()=>{
 await pg.exec('update offers set price=20');const r=await reserve(true,10,20,snapshot(10,20,20));
 assert.equal(r.amount_cents,300);assert.equal(r.charge_cents,1800);assert.equal(await balance(),1200);
 await attach(r);await pay(r);assert.equal(await balance(),1200);
 const payment=(await query('select * from payments')).rows[0];assert.equal(Number(payment.provider_net_amount),18);assert.equal(Number(payment.provider_commission_amount),2);assert.equal(Number(payment.job_amount),20);assert.equal(Number(payment.customer_fee_amount),1);
});
test('frontend extra requested amount cannot override server credit',async()=>{
 const m={...snapshot(),referral_credit_applied:'999999.00',customer_charge_amount:'0.00'};
 const r=await reserve(true,10,20,m);assert.equal(r.amount_cents,1500);assert.equal(Number(r.snapshot.referral_credit_applied),15);assert.equal(Number(r.snapshot.customer_charge_amount),90);
});
for (const key of ['professional_price','customer_fee_amount','customer_total','provider_commission_amount','provider_net_amount','platform_revenue_amount','payment_settings_id','professional_id']) test(`server rejects forged ${key}`,async()=>{
 const m={...snapshot(),[key]:'999'};await assert.rejects(reserve(true,10,20,m),/INVALID_CHECKOUT_SNAPSHOT/);assert.equal(await balance(),1500);
});
test('simultaneous submit/retry share one reservation and one consumption',async()=>{
 const [a,b]=await Promise.all([reserve(),reserve()]);assert.equal(a.id,b.id);assert.equal(await balance(),0);
 await attach(a);await attach(a);await pay(a);
 await query('update payments set status=$1',['ready_for_payout']);
 assert.equal((await query("select count(*)::int n from referral_credit_movements where kind='reserve'")).rows[0].n,1);
 assert.equal((await query("select count(*)::int n from referral_credit_movements where kind='consume'")).rows[0].n,1);
});
test('different jobs cannot spend the same customer balance',async()=>{
 const [a,b]=await Promise.all([reserve(),reserve(true,11,21)]);
 assert.equal(Number(a.amount_cents)+Number(b.amount_cents),1500);assert.equal(await balance(),0);
});
test('failed payment transaction rolls back consumption and keeps reserve for retry',async()=>{
 const r=await reserve();await attach(r);await pg.exec("alter table payments add constraint injected check(status<>'ready_for_payout')");
 try {await assert.rejects(pay(r),/injected/);assert.equal((await query('select state from referral_credit_checkouts')).rows[0].state,'reserved');assert.equal((await query("select count(*)::int n from referral_credit_movements where kind='consume'")).rows[0].n,0);} finally {await pg.exec('alter table payments drop constraint injected');}
 await pay(r);assert.equal((await query('select state from referral_credit_checkouts')).rows[0].state,'consumed');
});
test('returned reserve cannot be consumed by late payment',async()=>{const r=await reserve();await attach(r);await release(r);await assert.rejects(pay(r),/INVALID_CREDIT_PAYMENT/);assert.equal(await balance(),1500);});
test('consumed reserve cannot be returned as a failed checkout',async()=>{const r=await reserve();await attach(r);await pay(r);await assert.rejects(release(r),/CREDIT_ALREADY_CONSUMED/);});
test('Stripe reference cannot be overwritten',async()=>{const r=await reserve();await attach(r);await assert.rejects(attach(r,'pi2'),/CHECKOUT_REFERENCE_CONFLICT/);});
for(const [name,patch] of [['net',{provider_net_amount:80}],['commission',{provider_commission_amount:20}],['charge',{customer_charge_amount:91}],['intent',{provider_payment_id:'pi_other'}],['owner',{customer_id:id(1)}]]) test(`payment trigger rejects mismatched ${name}`,async()=>{const r=await reserve();await attach(r);await assert.rejects(pay(r,patch),/INVALID_CREDIT_PAYMENT|referral_payment_charge/);});
test('new snapshot accepts reduced charge only with database corroboration',async()=>{
 const r=await reserve();const m=r.snapshot;assert.throws(()=>validate(m,9000));
 const checked=validate(m,9000,r);assert.equal(checked.customerChargeAmount,90);assert.equal(checked.customerTotalAmount,105);assert.equal(checked.providerNetAmount,90);assert.equal(checked.providerCommissionAmount,10);
 assert.throws(()=>validate({...m,referral_credit_applied:'16.00'},8900,r));assert.throws(()=>validate(m,10500,r));
 assert.throws(()=>validate(snapshot(),9000));
});
test('no referral or no credit charges normal total',async()=>{
 await pg.exec("truncate referral_credit_ledger;truncate customer_referrals cascade");const r=await reserve();assert.equal(r.amount_cents,0);assert.equal(r.charge_cents,10500);assert.equal(await balance(),0);await attach(r);await pay(r);
});
test('own balance RPC is scoped to authenticated customer and SDK writers denied',async()=>{
 await query("set request.jwt.claim.sub='"+id(1)+"'");await pg.exec('set role authenticated');assert.equal(Number((await query('select my_referral_credit_balance() n')).rows[0].n),0);
 await assert.rejects(query('select referral_credit_balance($1)',[id(2)]),/permission denied/);
 await assert.rejects(query('select reserve_referral_checkout($1,$2,$3,true,$4)',[id(2),id(10),id(20),JSON.stringify(snapshot())]),/permission denied/);
 await pg.exec('reset role;set role service_role');await assert.rejects(pg.exec("update referral_credit_checkouts set amount_cents=0"),/permission denied/);
 await assert.rejects(pg.exec("insert into referral_credit_movements(checkout_id,customer_id,kind,amount_cents) values(gen_random_uuid(),gen_random_uuid(),'return',1500)"),/permission denied/);await pg.exec('reset role');
});
test('zero charge uses credit without Stripe or invented minimum and is idempotent',async()=>{
 await pg.exec('update payment_settings set provider_commission_percent=100;update offers set price=10');
 const r=await reserve(true,10,20,snapshot(10,20,10,5,100));assert.equal(r.charge_cents,0);assert.equal(r.amount_cents,1050);
 await query('select confirm_zero_referral_checkout($1,$2)',[r.id,id(2)]);await query('select confirm_zero_referral_checkout($1,$2)',[r.id,id(2)]);
 assert.equal(await balance(),450);assert.equal((await query('select count(*)::int n from payments')).rows[0].n,1);
 assert.equal((await query('select status from service_requests where id=$1',[id(10)])).rows[0].status,'in_progress');
});
const {returnReferralCheckout}=load('app/lib/referralCheckout.ts');
test('failed PaymentIntent is canceled before reservation return, duplicate event returns once',async()=>{
 const r=await reserve();await attach(r,'pi1',null);const order=[];
 const db={rpc:async(name,args)=>{order.push(name);await query('select return_referral_checkout($1)',[args.p_id]);return {error:null};}};
 const stripe={paymentIntents:{retrieve:async()=>({id:'pi1',status:'requires_payment_method'}),cancel:async()=>{order.push('cancel');return {status:'canceled'};}}};
 const bound={...r,stripe_payment_intent_id:'pi1'};assert.equal(await returnReferralCheckout(db,stripe,bound,true),true);await returnReferralCheckout(db,stripe,bound,true);
 assert.equal(order[0],'cancel');assert.equal(await balance(),1500);assert.equal((await query("select count(*)::int n from referral_credit_movements where kind='return'")).rows[0].n,1);
});
test('processing/success or lost create response never returns credit speculatively',async()=>{
 const r=await reserve();const db={rpc:async()=>{throw Error('Must not return credit');}};
 for(const status of ['processing','succeeded']) assert.equal(await returnReferralCheckout(db,{paymentIntents:{retrieve:async()=>({status})}},{...r,stripe_payment_intent_id:'pi1'},true),false);
 assert.equal(await returnReferralCheckout(db,{},r,true),false);
});
test('expired Session releases credit; browser cancellation must expire Stripe first',async()=>{
 const r=await reserve();await attach(r,null,'cs1');let expired=false;
 const stripe={checkout:{sessions:{retrieve:async()=>({id:'cs1',status:'open'}),expire:async()=>{expired=true;return {status:'expired'};}}}};
 const db={rpc:async(name,args)=>{assert.equal(expired,true);await release({...r,id:args.p_id});return {error:null};}};
 assert.equal(await returnReferralCheckout(db,stripe,{...r,stripe_session_id:'cs1'},true),true);assert.equal(await balance(),1500);
});

const {createReferralStripeObject}=load('app/lib/referralCheckout.ts');
test('definitive Stripe rejection returns reserve; uncertain network or idempotency errors retain it',async()=>{
 const r=await reserve();const db={rpc:async(name,args)=>{await release({...r,id:args.p_id});return {error:null};}};
 for(const failure of [{type:'StripeConnectionError'},{type:'StripeIdempotencyError'},{type:'StripeInvalidRequestError',code:'idempotency_key_in_use'}]) {
  await assert.rejects(createReferralStripeObject(db,r,async()=>{throw Object.assign(Error('uncertain'),failure);}));assert.equal(await balance(),0);
 }
 await assert.rejects(createReferralStripeObject(db,r,async()=>{throw Object.assign(Error('invalid'),{type:'StripeInvalidRequestError'});}));assert.equal(await balance(),1500);
});
test('async Session failure cancels its unpaid intent before credit is returned',async()=>{
 const r=await reserve();await attach(r,'pi1','cs1');let canceled=false;
 const stripe={checkout:{sessions:{retrieve:async()=>({status:'complete',payment_status:'unpaid',payment_intent:'pi1'})}},paymentIntents:{retrieve:async()=>({id:'pi1',status:'requires_payment_method'}),cancel:async()=>{canceled=true;return {status:'canceled'};}}};
 const db={rpc:async()=>{assert.equal(canceled,true);await release(r);return {error:null};}};
 assert.equal(await returnReferralCheckout(db,stripe,{...r,stripe_payment_intent_id:'pi1',stripe_session_id:'cs1'},true),true);assert.equal(await balance(),1500);
});

test('reassignment holds actual cash only and does not reintroduce consumed promo credit',async()=>{
 const r=await reserve();await attach(r);await pay(r);
 const p=(await query('select id from payments')).rows[0].id;
 await query("insert into payment_reassignments(original_payment_id,available_credit,status) values($1,105,'available')",[p]);
 assert.equal(Number((await query('select available_credit from payment_reassignments')).rows[0].available_credit),90);
 assert.equal(await balance(),0);await pg.exec('update payment_reassignments set available_credit=105');
 assert.equal(Number((await query('select available_credit from payment_reassignments')).rows[0].available_credit),90);
});
