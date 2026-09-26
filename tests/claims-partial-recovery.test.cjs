/* eslint-disable @typescript-eslint/no-require-imports -- Isolated local route/guard harness. */
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.join(__dirname,'..');
function load(file,imports={}) {
 const m={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{module:m,exports:m.exports,require:n=>{if(imports[n])return imports[n];throw Error('Unmocked dependency '+n);},Date,Map,Set});return m.exports;
}
const guard=load('app/lib/jobFinancialGuard.ts');
const {reconcilePartialClaimSources}=load('app/lib/partialClaimRecovery.ts',{'./jobFinancialGuard':guard});
const route=fs.readFileSync(path.join(root,'app/api/admin/claims/resolve/route.ts'),'utf8');
const begin=route.indexOf('      let providerProfileForPartial:');
const fragment=route.slice(begin,route.indexOf('      const baseRefundedCents',begin));
const code=ts.transpileModule(`async function run(){${fragment}\nreturn {partialTransferIds,partialRefundIds};}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(kind, normal = false) {
 const state={transfers:[],refunds:[],steps:new Map(),creates:[],failSecond:true,failSave:false};
 const sources=[6000,4000].map((amount,i)=>({key:`funding_source_${i}`,paymentIntentId:`pi_${i}`,providerCents:kind==='transfer'?amount:0,refundCents:kind==='refund'?amount:0,metadata:{funding_source_id:String(i)},fundingSourceId:String(i)}));
 const stripe={paymentIntents:{retrieve:async id=>({latest_charge:id.replace('pi_','ch_'),status:'succeeded',currency:'usd',amount_received:100000})},accounts:{retrieve:async()=>({capabilities:{transfers:'active'}})}};
 for(const k of ['transfer','refund']) stripe[k+'s']={
  list:async ({charge})=>({has_more:!!state.hasMore,data:state[k+'s'].filter(r=>!charge||r.charge===charge)}),
  create:async p=>{
   const charge=p.source_transaction||p.payment_intent.replace('pi_','ch_');
   if(state.failSecond&&charge==='ch_1')throw Error('second source failed');
   const r={...structuredClone(p),id:`${k}_${state[k+'s'].length}`,charge,currency:'usd',status:'succeeded',amount_reversed:0};state[k+'s'].push(r);state.creates.push([k,p.amount]);return r;
  }
 };
 const db={rpc:async(name,a)=>{
  const fail=()=>({error:{message:'conflict'}});
  if(name==='reserve_job_financial_resolution') {
   const decision=JSON.stringify(a.p_decision);
   if((state.owner && state.owner!==a.p_owner) || (state.decision && state.decision!==decision))return {error:{message:'FINANCIAL_OWNER_CONFLICT'}};
   state.owner=a.p_owner;state.decision=decision;state.plan=a.p_decision.plan;state.reservations=(state.reservations||0)+1;
   return {data:{pending_steps:[...state.steps.values()].filter(s=>!s.receipt).map(s=>({kind:s.kind,params:s.params}))}}; }
  if(name==='reserve_job_financial_step'){
   assert.ok(state.decision, 'resolution must be reserved before steps');
   const key=a.p_kind+a.p_charge_id;let step=state.steps.get(key);
   if(step&&JSON.stringify(step.params)!==JSON.stringify(a.p_params))return fail();
   if(!step){step={id:key,kind:a.p_kind,params:structuredClone(a.p_params),created_at:new Date().toISOString()};state.steps.set(key,step);}return {data:{...structuredClone(step),instruction:state.plan.find(e=>e.kind===a.p_kind && e.chargeId===a.p_charge_id)}};
  }
  assert.equal(name,'record_job_financial_step');if(state.failSave)return fail();
  const step=[...state.steps.values()].find(s=>s.id===a.p_step_id);assert.ok(step);step.receipt=structuredClone(a.p_receipt);return {data:{recorded:true}};
 },from:table=>{
  assert.ok(['provider_profiles','payment_reassignment_source_refunds'].includes(table));
  const q={select(){return q;},eq(){return q;},limit(){return q;},maybeSingle:async()=>({data:table==='provider_profiles'?{stripe_account_id:'acct_1'}:{stripe_refund_id:'ledger'},error:null})};return q;
 }};
 const context={stripe,supabaseAdmin:db,settlement:guard.financialStripe(stripe,db,'claim:claim1'),reconcilePartialClaimSources,financialPlan:guard.financialPlan,reserveJobResolution:guard.reserveJobResolution,FinancialGuardError:guard.FinancialGuardError,sourcePlan:sources,providerAwardAmount:kind==='transfer'?100:0,customerRefundAmount:kind==='refund'?100:0,expectedProviderCents:kind==='transfer'?10000:0,totalCustomerFee:0,claim:{id:'claim1',request_id:'job1',provider_id:'provider1'},payment:{id:'base',provider_payment_id:'pi_0',currency:'usd'},transferGroup:'relydo_request_job1',reconciliandoResolucion:true,NextResponse:{json:(body,options)=>({body,...options})},dinero:n=>Math.round(n*100)/100};
 Object.assign(context,{esPagoReasignado:false,jobAmount:100,providerNet:80,customerTotal:100,reassignmentSources:[],changeOrders:[{id:'co1',stripe_payment_intent_id:'pi_1',additional_amount:50,additional_customer_fee_amount:0,additional_provider_net_amount:40}]});
 const planning=route.slice(route.indexOf('      type PartialMoneySource'),begin);
 vm.createContext(context);vm.runInContext(normal?ts.transpileModule(`async function run(){${planning}${fragment}\nreturn {partialTransferIds,partialRefundIds};}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText:code,context);
 return {state,sources,context,stripe,run:async()=>{context.existingTransfers=await stripe.transfers.list({});return context.run();}};
}
for(const kind of ['transfer','refund']) {
 test(`${kind}: 60 confirmed, 40 failed; retry creates only 40; full retry creates nothing`,async()=>{
  const f=fixture(kind);await assert.rejects(f.run(),/second source failed/);assert.deepEqual(f.state.creates,[[kind,6000]]);
  f.state.failSecond=false;const result=await f.run();assert.deepEqual(f.state.creates,[[kind,6000],[kind,4000]]);assert.equal(result[kind==='transfer'?'partialTransferIds':'partialRefundIds'].length,2);
  await f.run();assert.equal(f.state.creates.length,2);
 });
 test(`${kind}: missing receipt recovered before continuing`,async()=>{
  const f=fixture(kind);f.state.failSave=true;await assert.rejects(f.run());assert.equal(f.state.creates.length,1);
  f.state.failSave=false;f.state.failSecond=false;await f.run();assert.deepEqual(f.state.creates,[[kind,6000],[kind,4000]]);
 });
 for(const conflict of ['under','excess','key','charge','metadata','duplicate','zero allocation','params','pagination',...(kind==='transfer'?['reversed','destination','currency']:['pending'])]) test(`${kind}: ${conflict} blocks before missing source creates`,async()=>{
  const f=fixture(kind);await assert.rejects(f.run());const r=f.state[kind+'s'][0];
  if(conflict==='under')r.amount=5000;if(conflict==='excess')r.amount=10000;
  if(conflict==='key')r.metadata.claim_source_key='unknown';if(conflict==='charge'){if(kind==='transfer')r.source_transaction='wrong';else r.charge='ch_1';}
  if(conflict==='metadata')r.metadata.claim_id='other';if(conflict==='duplicate')f.state[kind+'s'].push({...r,id:'duplicate'});
  if(conflict==='zero allocation')f.sources[0][kind==='transfer'?'providerCents':'refundCents']=0;
  if(conflict==='params')f.sources[0].metadata.funding_source_id='changed';if(conflict==='pagination')f.state.hasMore=true;
  if(conflict==='reversed')r.amount_reversed=1;if(conflict==='destination')r.destination='other';if(conflict==='currency')r.currency='eur';if(conflict==='pending')r.status='pending';
  f.state.failSecond=false;await assert.rejects(f.run(),e=>e.status===409);assert.equal(f.state.creates.length,1);
 });
}
for (const kind of ['transfer','refund']) {
 test(`${kind}: divergence in last source blocks before creating the first`,async()=>{
  const f=fixture(kind);f.state.failSecond=false;await f.run();
  f.state[kind+'s'].shift();f.state.steps.delete(kind+'ch_0');
  f.state[kind+'s'][0].amount=3900;const count=f.state.creates.length;
  await assert.rejects(f.run(),e=>e.status===409);assert.equal(f.state.creates.length,count);
 });
 test(`${kind}: equal total with wrong source distribution is blocked`,async()=>{
  const f=fixture(kind);f.state.failSecond=false;await f.run();
  f.state[kind+'s'][0].amount=5000;f.state[kind+'s'][1].amount=5000;
  await assert.rejects(f.run(),e=>e.status===409);assert.equal(f.state.creates.length,2);
 });
 test(`${kind}: duplicate physical charge in source plan is blocked`,async()=>{
  const f=fixture(kind);f.sources[1].paymentIntentId=f.sources[0].paymentIntentId;
  await assert.rejects(f.run(),e=>e.status===409);assert.equal(f.state.creates.length,0);
 });
}

for(const award of [100,60]) test(`normal base + CO: award ${award}, retry preserves plan and creates nothing twice`,async()=>{
 const f=fixture('transfer',true);f.state.failSecond=false;f.context.providerAwardAmount=award;
 await f.run();assert.deepEqual(f.state.creates,award===100?[['transfer',8000],['transfer',2000]]:[['transfer',6000]]);
 const decision=f.state.decision;assert.ok(decision);assert.equal(JSON.parse(decision).plan.length,award===100?2:1);await f.run();assert.equal(f.state.decision,decision);assert.equal(f.state.creates.length,award===100?2:1);
});
test('award over total capacity fails before reservation',async()=>{
 const f=fixture('transfer',true);f.context.providerAwardAmount=121;
 const result=await f.run();assert.equal(result.status,409);assert.equal(f.state.reservations,undefined);assert.equal(f.state.creates.length,0);
});
for(const defect of ['absent','unpaid','insufficient','currency','duplicate']) test(`CO ${defect}: no durable decision or money`,async()=>{
 const f=fixture('transfer',true);const retrieve=f.stripe.paymentIntents.retrieve;
 f.stripe.paymentIntents.retrieve=async id=>{const pi=await retrieve(id);if(id==='pi_1'){
 if(defect==='absent')pi.latest_charge=null;if(defect==='unpaid')pi.status='processing';
 if(defect==='insufficient')pi.amount_received=100;if(defect==='currency')pi.currency='eur';
 if(defect==='duplicate')pi.latest_charge='ch_0';}return pi;};
 await assert.rejects(f.run(),e=>e.status===409);assert.equal(f.state.reservations,undefined);assert.equal(f.state.creates.length,0);
});

test('another financial owner remains excluded',async()=>{
 const f=fixture('transfer',true);f.state.owner='automatic_release';
 await assert.rejects(f.run(),e=>e.status===409);assert.equal(f.state.creates.length,0);
});
test('mixed allocation uses remaining physical capacity and retries',async()=>{
 const f=fixture('transfer',true);f.state.failSecond=false;f.context.customerRefundAmount=50;
 await f.run();assert.deepEqual(f.state.creates,[['transfer',8000],['transfer',2000],['refund',2000],['refund',3000]]);
 await f.run();assert.equal(f.state.creates.length,4);
});
test('reassigned source and CO use the same reserved execution plan',async()=>{
 const f=fixture('transfer',true);f.state.failSecond=false;f.context.esPagoReasignado=true;
 f.context.reassignmentSources=[{id:'fund1',stripe_payment_intent_id:'pi_0',allocated_customer_amount:100,allocated_provider_amount:80}];
 await f.run();assert.deepEqual(f.state.creates,[['transfer',8000],['transfer',2000]]);
 await f.run();assert.equal(f.state.creates.length,2);
});
