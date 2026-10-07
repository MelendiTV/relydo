/* eslint-disable @typescript-eslint/no-require-imports -- Execute the route's actual cancellation amount block. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app/api/customer/cancel-job/route.ts','utf8');
const start=source.indexOf('    const serviceFeeAmount = dinero('),end=source.indexOf('// 8. PREVALIDAR STRIPE CONNECT',start);
function distribution(cash,penalty,provider,platform) {
 const context={payment:{customer_fee_amount:5},jobAmount:100,customerTotal:cash,penaltyPercent:penalty,providerJobPercent:provider,relydoStagePercent:platform,dinero:n=>Math.round((n+Number.EPSILON)*100)/100,NextResponse:{json:(body,opts)=>({status:opts.status,body})}};
 return vm.runInNewContext('(function(){'+source.slice(start,end)+'\nreturn {providerAwardAmount,customerRefundAmount,relydoCancellationAmount};})()',context);
}
test('normal cancellation retains existing stage distributions',()=>{
 for(const [penalty,provider,platform] of [[0,0,0],[50,40,10],[100,80,20]]) {
  const d=distribution(105,penalty,provider,platform);assert.equal(d.providerAwardAmount,provider);assert.equal(d.customerRefundAmount,100-penalty);assert.equal(d.relydoCancellationAmount,5+platform);
 }
});
test('promotional discount never becomes a cash refund and Pro stage amount stays unchanged',()=>{
 for(const [penalty,provider,platform] of [[0,0,0],[50,40,10],[100,80,20]]) {
  const d=distribution(90,penalty,provider,platform);assert.equal(d.providerAwardAmount,provider);assert.ok(d.customerRefundAmount+d.providerAwardAmount+d.relydoCancellationAmount<=90);assert.ok(d.customerRefundAmount<=100-penalty);
 }
});
test('insufficient cash for unchanged Pro compensation stops before Stripe instead of financing it',()=>{
 const d=distribution(90,100,100,0);assert.equal(d.status,409);
});

test('financial plan refuses combined transfers/refunds exceeding real promotional Stripe charge',async()=>{
 const ts=require('typescript'),exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/lib/jobFinancialGuard.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:()=>{throw Error('unexpected dependency');}});
 const stripe={paymentIntents:{retrieve:async()=>({id:'pi',status:'succeeded',amount_received:9000,currency:'usd',latest_charge:'ch',metadata:{referral_credit_reservation_id:'r1'}})}};
 const source={key:'payment:p',paymentIntentId:'pi',transfer:{amount:9000,currency:'usd',destination:'acct',source_transaction:'ch'},refund:{amount:1000,payment_intent:'pi'}};
 await assert.rejects(exports.financialPlan(stripe,[source]),/supera el cobro real/);
 delete source.refund;assert.equal((await exports.financialPlan(stripe,[source]))[0].params.amount,9000);
});
