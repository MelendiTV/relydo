/* eslint-disable @typescript-eslint/no-require-imports -- Execute the real Checkout route offline. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function fixture(balance=1500) {
 const state={reservation:null,created:[],keys:[],rpcCalls:[]};
 const job={id:'job1',customer_id:'customer1',status:'open',preferred_provider_id:null,title:'Repair'};
 const offer={id:'offer1',request_id:'job1',professional_id:'pro1',price:20,status:'pending'};
 const settings={id:'settings1',provider_commission_percent:10,customer_service_fee_percent:5,currency:'USD',active:true};
 const db={from(table){const row=table==='service_requests'?job:table==='offers'?offer:table==='payment_settings'?settings:table==='provider_profiles'?{business_name:'Pro'}:table==='profiles'?{role:'customer'}:null;const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:row,error:null}),then(resolve){return Promise.resolve({data:table==='referral_credit_checkouts'?(state.reservation?[state.reservation]:[]):row,error:null}).then(resolve);}};return q;},rpc:async(name,args)=>{
  state.rpcCalls.push(name);
  if(name==='reserve_referral_checkout') {
   if(state.reservation)return {data:state.reservation,error:null};
   const m=args.p_snapshot,credit=args.p_use_credit?Math.min(balance,Math.round(Number(m.platform_revenue_amount)*100)):0;
   state.reservation={id:'reservation1',customer_id:'customer1',request_id:'job1',offer_id:'offer1',state:'reserved',created_at:new Date().toISOString(),amount_cents:credit,charge_cents:Math.round(Number(m.customer_total)*100)-credit,stripe_session_id:null,stripe_payment_intent_id:null,snapshot:{...m,use_referral_credit:String(args.p_use_credit),referral_credit_reservation_id:'reservation1',referral_credit_applied:(credit/100).toFixed(2),customer_charge_amount:((Math.round(Number(m.customer_total)*100)-credit)/100).toFixed(2)}};
   return {data:state.reservation,error:null};
  }
  if(name==='attach_referral_checkout'){state.reservation.stripe_session_id=args.p_session_id;state.reservation.stripe_payment_intent_id=args.p_intent_id;return {error:null};}
  throw Error(name);
 }};
 const session={id:'cs1',url:'https://checkout.stripe.com/pay/cs1',status:'open',payment_intent:null};
 const stripe={checkout:{sessions:{create:async(params,opts)=>{state.created.push(params);state.keys.push(opts.idempotencyKey);return session;},retrieve:async()=>session}}};
 const cache=new Map();function load(file){if(cache.has(file))return cache.get(file);const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,process:{env:{RELYDO_BASE_URL:'https://www.relydo.co'}},console,require:name=>{
  if(name==='next/server')return {NextResponse:{json:(body,opts)=>Response.json(body,opts)}};
  if(name==='stripe')return {default:class{constructor(){return stripe;}}};
  if(name==='@supabase/supabase-js')return {createClient:()=>db};
  if(name.endsWith('serverAuth'))return {getAuthenticatedUser:async()=>({user:{id:'customer1'}})};
  if(name.endsWith('serverNotifications'))return {sendRelydoNotification:async()=>{}};
  if(name.endsWith('referralCheckout'))return load('app/lib/referralCheckout.ts');
  throw Error(name);
 }});cache.set(file,exports);return exports;}
 return {state,run:body=>load('app/api/checkout/route.ts').POST({json:async()=>({requestId:'job1',offerId:'offer1',...body}),nextUrl:{origin:'https://www.relydo.co'}})};
}
for(const use of [true,false]) test(`real checkout ${use?'opt in':'opt out'} ignores frontend amounts and freezes server prices`,async()=>{
 const f=fixture();const response=await f.run({useReferralCredit:use,referralCreditApplied:99999,referral_credit_applied:99999,professionalPrice:1,total:0,serviceFee:0});assert.equal(response.status,200);
 const params=f.state.created[0];assert.equal(params.line_items[0].price_data.unit_amount,use?1800:2100);
 assert.equal(params.metadata.professional_price,'20.00');assert.equal(params.metadata.provider_net_amount,'18.00');assert.equal(params.metadata.provider_commission_amount,'2.00');
 assert.equal(params.payment_intent_data.metadata.customer_total,'21.00');assert.equal(Number(params.metadata.referral_credit_applied),use?3:0);
 assert.equal(f.state.keys[0],'referral-checkout:reservation1:session');
});
test('real checkout missing opt-in and no balance preserve normal charge',async()=>{
 for(const [balance,body] of [[1500,{}],[0,{useReferralCredit:true}]]){const f=fixture(balance);assert.equal((await f.run(body)).status,200);assert.equal(f.state.created[0].line_items[0].price_data.unit_amount,2100);}
});
test('real checkout double submit retrieves original Session rather than making another charge',async()=>{
 const f=fixture();assert.equal((await f.run({useReferralCredit:true})).status,200);assert.equal((await f.run({useReferralCredit:true})).status,200);assert.equal(f.state.created.length,1);
});
