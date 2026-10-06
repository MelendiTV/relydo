/* eslint-disable @typescript-eslint/no-require-imports -- Offline route integration harness. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function fixture() {
  const metadata = { payment_type:'initial_job', payment_flow:'payment_sheet', request_id:'job1', offer_id:'offer1', customer_id:'customer1', professional_id:'pro1', professional_price:'100.00', customer_fee_percent:'10.00', customer_fee_amount:'10.00', customer_total:'110.00', provider_commission_percent:'20.00', provider_commission_amount:'20.00', provider_net_amount:'80.00', platform_revenue_amount:'30.00', currency:'USD' };
  const state = { payment:null, notifications:0, writes:[], collision:null, saveError:false, networkError:false, signature:true, origin:'https://relydo.invalid', refunds:[], eventType:'payment_intent.succeeded' };
  const offer={id:'offer1',request_id:'job1',professional_id:'pro1',price:100,status:'pending'};
  const job={id:'job1',customer_id:'customer1',status:'open',preferred_provider_id:null};
  const intent={id:'pi1',metadata,status:'succeeded',amount:11000,amount_received:11000,customer:'cus1',currency:'usd'};
  const session={id:'cs1',metadata:{...metadata,payment_flow:'web'},payment_status:'paid',payment_intent:intent,customer:'cus1',amount_total:11000,currency:'usd'};
  const db={from(table) {
    assert.notEqual(table,'payment_settings');
    let action=null, values=null;const filters=[];
    const q={select:()=>q,limit:()=>q,eq:(k,v)=>{filters.push(row=>row[k]===v);return q;},is:(k,v)=>{filters.push(row=>row[k]===v);return q;},neq:(k,v)=>{filters.push(row=>row[k]!==v);return q;},in:(k,v)=>{filters.push(row=>v.includes(row[k]));return q;},or:()=>q,
      update(data){action='update';values=data;return q;},insert(data){action='insert';values=data;return q;},
      maybeSingle:async()=>execute(),then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject);}};
    function execute(){
      const row=table==='payments'?state.payment:table==='offers'?offer:job;
      if(!action)return {data:row && filters.every(f=>f(row))?{...row}:null,error:null};
      if(table==='payments' && state.saveError)return {error:{code:'offline'},data:null};
      if(table==='payments' && action==='insert' && state.collision){state.payment={id:'payment1',offer_id:'offer1',provider_payment_id:state.collision==='null'?null:state.collision};state.collision=null;return {error:{code:'23505'},data:null};}
      if(action==='insert'){assert.equal(state.payment,null);state.payment={id:'payment1',...values};state.writes.push({table,values});return {error:null,data:state.payment};}
      if(table==='payments' && action==='update' && state.updateWinner){state.payment.provider_payment_id=state.updateWinner;state.updateWinner=null;}
      if(row && filters.every(f=>f(row))){Object.assign(row,values);state.writes.push({table,values});return {error:null,data:{...row}};}
      return {error:null,data:null};
    }
    return q;
  }};
  const stripe={paymentIntents:{retrieve:async id=>{assert.equal(id,intent.id);return intent;}},checkout:{sessions:{retrieve:async()=>session}},refunds:{create:async(params,opts)=>{state.refunds.push({params,opts});return {id:'refund1'};}},webhooks:{constructEvent:()=>{if(!state.signature)throw Error('signature');return {type:state.eventType,data:{object:state.eventType==='payment_intent.succeeded'?intent:session}};}}};
  const cache=new Map();
  function load(file){
    if(cache.has(file))return cache.get(file);const exports={};
    const requireMock=name=>{
      if(name==='next/server')return {NextResponse:{json:(body,opts)=>Response.json(body,opts)}};
      if(name==='stripe')return {default:class Stripe{constructor(){return stripe;}}};
      if(name==='@supabase/supabase-js')return {createClient:()=>db};
      if(name.endsWith('basePaymentSnapshot'))return load('app/lib/basePaymentSnapshot.ts');
      if(name.endsWith('serverAuth'))return {getAuthenticatedUser:async()=>{throw Error('Webhook must not need customer authentication');}};
      if(name.endsWith('serverNotifications'))return {sendRelydoNotification:async()=>{state.notifications++;}};
      if(name.endsWith('jobFinancialGuard'))return {assertReassignmentSafe:async()=>{}};
      if(name.endsWith('providerScreening'))return {};
      if(name.endsWith('changeOrderPayments'))return {confirmChangeOrderPayment:async()=>{state.changeOrders=(state.changeOrders||0)+1;return {};}};
      throw Error(name);
    };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:requireMock,process:{env:{STRIPE_WEBHOOK_SECRET:'secret',RELYDO_BASE_URL:state.origin}},console:{error(){},warn(){}},URL,Response,fetch:async(url,options)=>{
      if(state.networkError)throw Error('offline');
      assert.equal(url,'https://relydo.invalid/api/checkout/verify-payment');
      assert.equal(options.headers['x-relydo-internal-stripe'],'secret');
      const body=JSON.parse(options.body);state.forwarded=body;
      return load('app/api/checkout/verify-payment/route.ts').POST({headers:new Headers(options.headers),json:async()=>body});
    }});
    cache.set(file,exports);return exports;
  }
  const webhook=()=>load('app/api/stripe/webhook/route.ts').POST({headers:new Headers({'stripe-signature':'signed'}),text:async()=>''});
  return {state,metadata,intent,offer,job,webhook};
}
test('base mobile webhook confirms without client and freezes original snapshot',async()=>{
  const f=fixture();const r=await f.webhook();assert.equal(r.status,200);assert.equal((await r.json()).processed,true);
  assert.deepEqual(f.state.forwarded,{paymentIntentId:'pi1'});assert.equal(f.state.payment.provider_net_amount,80);assert.equal(f.state.payment.customer_total_amount,110);assert.equal(f.job.status,'in_progress');assert.equal(f.offer.status,'selected');assert.equal(f.state.notifications,1);
});
test('repeated Stripe delivery does not write another payment or repeat state transitions/notification',async()=>{
  const f=fixture();await f.webhook();const writes=f.state.writes.length;assert.equal((await f.webhook()).status,200);assert.equal(f.state.writes.length,writes);assert.equal(f.state.notifications,1);assert.equal(f.state.refunds.length,0);
});
for(const [key,value] of [['customer_total',undefined],['provider_commission_percent','101'],['provider_net_amount','79.00']])test(`invalid mobile snapshot ${key} fails before mutations`,async()=>{
  const f=fixture();f.metadata[key]=value;assert.equal((await f.webhook()).status,500);assert.equal(f.state.writes.length,0);assert.equal(f.state.payment,null);
});
test('actual charged amount must match frozen snapshot',async()=>{const f=fixture();f.intent.amount_received=10999;assert.equal((await f.webhook()).status,500);assert.equal(f.state.writes.length,0);});
test('DB failure after job selection recovers on Stripe retry',async()=>{const f=fixture();f.state.saveError=true;assert.equal((await f.webhook()).status,500);f.state.saveError=false;assert.equal((await f.webhook()).status,200);assert.equal(f.state.payment.provider_payment_id,'pi1');assert.equal(f.state.notifications,1);assert.equal(f.state.refunds.length,0);});
test('same-intent insert collision confirms without duplicate notification/refund',async()=>{const f=fixture();f.state.collision='pi1';assert.equal((await f.webhook()).status,200);assert.equal(f.state.notifications,0);assert.equal(f.state.refunds.length,0);});
test('different-intent collision refunds second charge using idempotency key',async()=>{const f=fixture();f.state.collision='pi_other';const r=await f.webhook();assert.equal(r.status,200);assert.equal((await r.json()).refunded,true);assert.equal(f.state.payment.provider_payment_id,'pi_other');assert.equal(f.state.refunds[0].opts.idempotencyKey,'relydo-auto-refund-pi1');assert.equal(f.state.notifications,0);});
test('unconfirmed collision remains retryable',async()=>{const f=fixture();f.state.collision='null';assert.equal((await f.webhook()).status,500);assert.equal(f.state.notifications,0);});
test('network failure returns retryable response',async()=>{const f=fixture();f.state.networkError=true;assert.equal((await f.webhook()).status,500);f.state.networkError=false;assert.equal((await f.webhook()).status,200);});
test('invalid signature cannot finalize mobile payment',async()=>{const f=fixture();f.state.signature=false;assert.equal((await f.webhook()).status,400);assert.equal(f.state.writes.length,0);});
test('web PaymentIntent is ignored and web Session still confirms',async()=>{const f=fixture();f.metadata.payment_flow='web';assert.equal((await (await f.webhook()).json()).ignored,true);assert.equal(f.state.writes.length,0);f.state.eventType='checkout.session.completed';assert.equal((await f.webhook()).status,200);assert.deepEqual(f.state.forwarded,{sessionId:'cs1'});});
test('Change Order PaymentIntent retains its confirmation path',async()=>{const f=fixture();f.metadata.payment_type='change_order';assert.equal((await f.webhook()).status,200);assert.equal(f.state.changeOrders,1);assert.equal(f.state.writes.length,0);});
test('missing trusted origin cannot forward mobile confirmation',async()=>{const f=fixture();f.state.origin='';assert.equal((await f.webhook()).status,500);assert.equal(f.state.writes.length,0);});

test('pending local payment is filled once and repeated webhook preserves it',async()=>{const f=fixture();f.state.payment={id:'payment1',offer_id:'offer1',provider_payment_id:null};assert.equal((await f.webhook()).status,200);const writes=f.state.writes.length;assert.equal((await f.webhook()).status,200);assert.equal(f.state.writes.length,writes);assert.equal(f.state.notifications,1);});
test('concurrent update cannot overwrite another confirmed intent',async()=>{const f=fixture();f.state.payment={id:'payment1',offer_id:'offer1',provider_payment_id:null};f.state.updateWinner='pi_other';assert.equal((await f.webhook()).status,500);assert.equal(f.state.payment.provider_payment_id,'pi_other');assert.equal(f.state.notifications,0);assert.equal((await f.webhook()).status,200);assert.equal(f.state.refunds.length,1);});
