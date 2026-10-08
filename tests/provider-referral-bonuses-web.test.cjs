/* eslint-disable @typescript-eslint/no-require-imports -- Offline VM + fake Stripe. */
const {test}=require('node:test');const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const api={};class FinancialGuardError extends Error{}
const receipt={id:'tr_base',kind:'transfer',charge_id:'ch_base',source:{paymentIntentId:'pi_base'},destination:'acct_pro2',amount:9000,currency:'usd'};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/lib/providerReferralBonuses.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
 exports:api,Date,console:{error(){}},require(name){if(name==='./jobFinancialGuard')return {FinancialGuardError,readJobResolution:async()=>({receipts:[receipt]})};throw Error(name);}
});
function fixture(){
 const d={id:'bonus1',request_id:'job',destination:'acct_pro2',amount_cents:2500,currency:'usd',created_at:new Date().toISOString(),receipt:null};
 const state={reserved:false,awarded:false,created:[],remote:[],calls:[],failSave:false,allowed:true};
 const charge={id:'ch_base',payment_intent:'pi_base',paid:true,status:'succeeded',currency:'usd',disputed:false,refunded:false,amount_refunded:0,livemode:false};
 const refunds={has_more:false,data:[]};
 const base={id:'tr_base',source_transaction:'ch_base',destination:'acct_pro2',amount:9000,currency:'usd',reversed:false,amount_reversed:0,livemode:false};
 const db={rpc:async(name,args)=>{
  state.calls.push({name,args});
  if(name==='award_provider_referral'){if(state.awarded)return {data:{outcome:'already_awarded'}};if(args.p_evidence){state.awarded=true;return {data:{outcome:'awarded'}};}return {data:{outcome:'needs_evidence'}};}
  if(name==='reserve_provider_referral_bonus'){if(state.reserved)return {data:{outcome:'reserved',redemption:{...d}}};if(args.p_evidence){state.reserved=true;return {data:{outcome:'reserved',redemption:{...d}}};}return {data:{outcome:'needs_evidence'}};}
  if(name==='authorize_provider_referral_bonus')return {data:{allowed:state.allowed}};
  if(name==='record_provider_referral_bonus'){if(state.failSave)return {error:{message:'offline'}};d.receipt=args.p_receipt;return {data:{recorded:true}};}
  if(name==='pending_provider_referrals')return {data:['job','job']};throw Error(name);
 }};
 const stripe={charges:{retrieve:async()=>charge},refunds:{list:async()=>refunds},transfers:{
  retrieve:async()=>base,list:async()=>({data:state.remote,has_more:state.hasMore||false}),
  create:async(params,options)=>{state.created.push({params,options});const t={...params,id:'tr_bonus',source_transaction:null,reversed:false,amount_reversed:0};state.remote=[t];return t;}
 }};
 return {db,stripe,state,d,charge,refunds,base};
}
test('full $25 financed by platform after two atomic awards; retry creates no second transfer',async()=>{
 const f=fixture();assert.equal((await api.processProviderReferral(f.db,f.stripe,'job')).outcome,'paid');
 const c=f.state.created[0];assert.equal(c.params.amount,2500);assert.equal(c.params.source_transaction,undefined);assert.equal(c.params.destination,'acct_pro2');assert.equal(c.options.idempotencyKey,'relydo_pro_bonus_bonus1');
 assert.equal((await api.processProviderReferral(f.db,f.stripe,'job')).outcome,'already_paid');assert.equal(f.state.created.length,1);
 const names=f.state.calls.map(c=>c.name);assert.ok(names.indexOf('authorize_provider_referral_bonus')<names.indexOf('record_provider_referral_bonus'));
});
test('remote success + local failure is recovered without create, even after 24h',async()=>{
 const f=fixture();f.state.failSave=true;await assert.rejects(api.processProviderReferral(f.db,f.stripe,'job'),/reintento/);
 f.state.failSave=false;f.d.created_at='2020-01-01';f.charge.disputed=true;
 assert.equal((await api.processProviderReferral(f.db,f.stripe,'job')).outcome,'paid');assert.equal(f.state.created.length,1);
});
test('uncertain expired reservation blocks creation and never frees credit',async()=>{
 const f=fixture();f.state.awarded=true;f.state.reserved=true;f.d.created_at='2020-01-01';
 await assert.rejects(api.processProviderReferral(f.db,f.stripe,'job'),/conciliación/);assert.equal(f.state.created.length,0);assert.equal(f.state.reserved,true);
});
for(const [name,mutate] of [
 ['dispute',f=>f.charge.disputed=true],['refund',f=>f.charge.amount_refunded=1],['pending refund',f=>f.refunds.data=[{}]],
 ['refund pagination',f=>f.refunds.has_more=true],['reversed ordinary transfer',f=>f.base.reversed=true],
])test('no award/no bonus on '+name,async()=>{const f=fixture();mutate(f);assert.equal((await api.processProviderReferral(f.db,f.stripe,'job')).outcome,'ineligible');assert.equal(f.state.awarded,false);assert.equal(f.state.created.length,0);});
test('wrong ordinary source blocks award',async()=>{const f=fixture();f.base.source_transaction='ch_wrong';await assert.rejects(api.processProviderReferral(f.db,f.stripe,'job'),/evidencia/);assert.equal(f.state.created.length,0);});
test('new incident before bonus send blocks it, keeps reservation',async()=>{
 const f=fixture();f.state.allowed=false;assert.equal((await api.processProviderReferral(f.db,f.stripe,'job')).outcome,'ineligible');assert.equal(f.state.created.length,0);assert.equal(f.state.reserved,true);
});
test('insufficient platform balance leaves entire $25 reserved for retry',async()=>{
 const f=fixture();f.stripe.transfers.create=async()=>{throw Error('insufficient balance');};
 await assert.rejects(api.processProviderReferral(f.db,f.stripe,'job'),/insufficient balance/);assert.equal(f.state.reserved,true);assert.equal(f.d.receipt,null);
});
for(const mode of ['duplicate','wrong destination','reversed','pagination'])test('bonus recovery refuses '+mode,async()=>{
 const f=fixture();await api.processProviderReferral(f.db,f.stripe,'job');f.d.receipt=null;
 if(mode==='duplicate')f.state.remote.push({...f.state.remote[0],id:'tr_duplicate'});
 if(mode==='wrong destination')f.state.remote[0].destination='acct_wrong';
 if(mode==='reversed')f.state.remote[0].reversed=true;
 if(mode==='pagination')f.state.hasMore=true;
 await assert.rejects(api.processProviderReferral(f.db,f.stripe,'job'),/conciliar/);assert.equal(f.state.created.length,1);
});
test('unrelated job has no bonus and no Stripe effects',async()=>{
 const f=fixture();f.db.rpc=async(name)=>({data:{outcome:name==='award_provider_referral'?'not_referred':'no_credit'}});
 assert.equal((await api.processProviderReferral(f.db,f.stripe,'job')).outcome,'no_credit');assert.equal(f.state.created.length,0);
});
test('cron retries continue after a single failure',async()=>{
 const f=fixture();let reads=0;f.stripe.charges.retrieve=async()=>{if(++reads===1)throw Error('network');return f.charge;};
 await api.retryProviderReferrals(f.db,f.stripe);assert.equal(f.state.created.length,1);
});
test('release hook follows durable save; cron authorization comes before bonus retries; signup validates first',()=>{
 const route=fs.readFileSync('app/api/payments/release/route.ts','utf8');assert.ok(route.indexOf('await processProviderReferral')>route.indexOf('if (releaseSaveError)'));
 const cron=route.slice(route.indexOf('export async function GET'));assert.ok(cron.indexOf('await retryProviderReferrals')>cron.indexOf('return unauthorized()'));
 const page=fs.readFileSync('app/registro-profesional/page.tsx','utf8');assert.ok(page.indexOf('validate_provider_referral_code')<page.indexOf('await supabase.auth.signUp'));assert.match(page,/provider_referral_code: providerReferralCode/);
});
test('simultaneous bonus workers use the same instruction/key and one remote effect',async()=>{
 const f=fixture();f.state.awarded=true;f.state.reserved=true;const effects=new Map();const attempted=[];
 f.stripe.transfers.create=async(params,options)=>{
  attempted.push(options.idempotencyKey);
  if(!effects.has(options.idempotencyKey))effects.set(options.idempotencyKey,{...params,id:'tr_single',source_transaction:null,reversed:false,amount_reversed:0});
  return effects.get(options.idempotencyKey);
 };
 await Promise.all([api.processProviderReferral(f.db,f.stripe,'job'),api.processProviderReferral(f.db,f.stripe,'job')]);
 assert.equal(effects.size,1);assert.ok(attempted.every(key=>key==='relydo_pro_bonus_bonus1'));assert.equal(f.d.receipt.id,'tr_single');
});
