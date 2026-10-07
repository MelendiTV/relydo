/* eslint-disable @typescript-eslint/no-require-imports -- Offline VM harness; no real Stripe calls. */
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exportsObject={};
class FinancialGuardError extends Error {}
const receipt={id:'tr_1',kind:'transfer',charge_id:'ch_1',source:{paymentIntentId:'pi_1'},destination:'acct_pro',amount:9000,currency:'usd'};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/lib/customerReferralAwards.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
 exports:exportsObject,Date,console:{error(){}},require(name){
  if(name==='./jobFinancialGuard')return {FinancialGuardError,readJobResolution:async()=>({receipts:[receipt]})};
  throw Error(name);
 }
});
function fixture(outcome='needs_evidence') {
 const calls=[];
 const charge={id:'ch_1',payment_intent:'pi_1',paid:true,status:'succeeded',currency:'usd',disputed:false,refunded:false,amount_refunded:0,livemode:false};
 const refunds={has_more:false,data:[]};
 const transfer={id:'tr_1',source_transaction:'ch_1',destination:'acct_pro',amount:9000,currency:'usd',reversed:false,amount_reversed:0,livemode:false};
 const db={rpc:async(name,args)=>{calls.push({name,args});if(name==='pending_customer_referral_awards')return {data:['job1','job2']};return {data:{outcome:args.p_evidence===null?outcome:'awarded'}};}};
 const stripe={charges:{retrieve:async()=>charge},refunds:{list:async()=>refunds},transfers:{retrieve:async()=>transfer}};
 return {db,stripe,calls,charge,refunds,transfer};
}
test('Web sends fresh matching Stripe evidence only after preflight; creates no Stripe effects',async()=>{
 const f=fixture();assert.equal((await exportsObject.awardCustomerReferral(f.db,f.stripe,'job')).outcome,'awarded');
 assert.equal(f.calls.length,2);assert.equal(f.calls[0].args.p_evidence,null);
 const e=f.calls[1].args.p_evidence[0];assert.equal(e.transfer_id,'tr_1');assert.equal(e.payment_intent_id,'pi_1');assert.equal(e.has_refunds,false);assert.ok(Date.now()-Date.parse(e.observed_at)<1000);
});
for(const outcome of ['not_referred','already_awarded','ineligible'])test(`Web skips Stripe observation for ${outcome}`,async()=>{
 const f=fixture(outcome);f.stripe.charges.retrieve=async()=>{throw Error('unexpected Stripe call');};
 assert.equal((await exportsObject.awardCustomerReferral(f.db,f.stripe,'job')).outcome,outcome);assert.equal(f.calls.length,1);
});
for(const [name,mutate] of [
 ['dispute',f=>{f.charge.disputed=true;}],['refund',f=>{f.charge.amount_refunded=1;}],
 ['pending refund',f=>{f.refunds.data=[{}];}],['incomplete refund pagination',f=>{f.refunds.has_more=true;}],
 ['reversed transfer',f=>{f.transfer.reversed=true;}],
])test(`Web refuses credits for ${name}`,async()=>{
 const f=fixture();mutate(f);assert.equal((await exportsObject.awardCustomerReferral(f.db,f.stripe,'job')).outcome,'ineligible');assert.equal(f.calls.length,1);
});
test('Web mismatched source refuses award and leaves retry pending',async()=>{
 const f=fixture();f.transfer.source_transaction='ch_wrong';await assert.rejects(exportsObject.awardCustomerReferral(f.db,f.stripe,'job'),/evidencia/);assert.equal(f.calls.length,1);
});
test('Web RPC failure is reported; no fallback one-sided award',async()=>{
 const f=fixture();const rpc=f.db.rpc;f.db.rpc=async(name,args)=>args.p_evidence===null?rpc(name,args):{error:{message:'unavailable'}};
 await assert.rejects(exportsObject.awardCustomerReferral(f.db,f.stripe,'job'),/ya está guardada/);
});
test('pending-credit retries continue after one observation fails, without Pro transfers',async()=>{
 const f=fixture();let seen=0;f.stripe.charges.retrieve=async()=>{if(++seen===1)throw Error('network');return f.charge;};
 await exportsObject.retryCustomerReferralAwards(f.db,f.stripe);
 assert.equal(seen,2);assert.ok(f.calls.some(c=>c.args?.p_request_id==='job2' && c.args.p_evidence));
});
test('release hook follows durable payment save; cron retries follow authorization',()=>{
 const route=fs.readFileSync('app/api/payments/release/route.ts','utf8');
 assert.ok(route.indexOf('await awardCustomerReferral')>route.indexOf('if (releaseSaveError)'));
 const cron=route.slice(route.indexOf('export async function GET'));
 assert.ok(cron.indexOf('await retryCustomerReferralAwards')>cron.indexOf('return unauthorized()'));
});
