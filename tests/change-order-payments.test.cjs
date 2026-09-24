/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS Node test harness with isolated VM dependencies. */
// Offline tests: every external dependency is replaced; no env file is read.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const fixtures = [];
afterEach(() => {
  for (const state of fixtures.splice(0)) {
    if (!state.allowCreation) assert.equal(state.creates, 0, 'Confirmation must never attempt charge creation');
  }
});

function fixture() {
  const identity = { payment_type: 'change_order', change_order_id: 'co1', request_id: 'job1', customer_id: 'customer1', provider_id: 'provider1' };
  const snapshot = { ...identity, original_amount: '200.00', additional_amount: '100.00', new_total_amount: '300.00', customer_fee_percent: '10.00', customer_fee_amount: '10.00', customer_total_amount: '110.00', provider_commission_percent: '20.00', provider_commission_amount: '20.00', provider_net_amount: '80.00', platform_revenue_amount: '30.00' };
  const state = {
    order: { id: 'co1', request_id: 'job1', customer_id: 'customer1', provider_id: 'provider1', status: 'accepted', payment_status: 'unpaid', stripe_checkout_session_id: 'cs1', stripe_payment_intent_id: null, additional_amount: 100, original_amount: 200, new_total_amount: 300, updated_at: '2026-09-01T00:00:00Z' },
    job: { id: 'job1', customer_id: 'customer1', preferred_provider_id: 'provider1', status: 'in_progress' },
    intents: { pi1: { id: 'pi1', status: 'succeeded', amount: 11000, amount_received: 11000, currency: 'usd', metadata: identity, latest_charge: { id: 'ch1', created: 1750000000, refunded: false, amount_refunded: 0, disputed: false } } },
    sessions: { cs1: { id: 'cs1', mode: 'payment', status: 'complete', payment_status: 'paid', payment_intent: 'pi1', amount_total: 11000, currency: 'usd', metadata: snapshot } },
    writes: 0, notifications: 0, saveError: false, readError: false, notificationError: false, user: { id: 'customer1' },
    event: null, validSignature: true, stripeReadError: false, beforeUpdate: null, creates: 0, allowCreation: false,
  };
  fixtures.push(state);
  const clone = value => structuredClone(value);
  const db = {
    auth: { getUser: async token => ({ data: { user: token === 'valid' ? state.user : null }, error: null }) },
    // Contract double only. The separate SQL suite executes the actual migration.
    async rpc(name, args) {
      if (state.rpcMissing) return {data:null,error:{code:'PGRST202'}};
      const fail = () => ({data:null,error:{code:'P0001'}});
      const order=state.order;
      if(name==='reserve_change_order_payment') {
        if(order.payment_status==='paid')return {data:{outcome:'paid'}};
        if(order.status!=='accepted'||state.job.status!=='in_progress'||state.claim)return fail();
        if(state.reservation) {
          if(state.reservation.flow!==args.p_flow)return fail();
          return {data:{outcome:'reserved',reservation:clone({...state.reservation,session_id:order.stripe_checkout_session_id,payment_intent_id:order.stripe_payment_intent_id})}};
        }
        if(order.stripe_checkout_session_id||order.stripe_payment_intent_id)return {data:{outcome:'legacy'}};
        if(!args.p_payload)return {data:{outcome:'needs_payload'}};
        state.reservation={id:'reservation1',flow:args.p_flow,created_at:new Date().toISOString(),payload:clone(args.p_payload),session_id:null,payment_intent_id:null};
        return {data:{outcome:'reserved',reservation:clone(state.reservation)}};
      }
      if(name==='attach_change_order_payment') {
        if(state.saveError)return {data:null,error:{code:'08006'}};
        if(!state.reservation||state.reservation.id!==args.p_reservation_id)return fail();
        if(args.p_session_id)order.stripe_checkout_session_id=args.p_session_id;
        if(args.p_payment_intent_id)order.stripe_payment_intent_id=args.p_payment_intent_id;
        return {data:{attached:!state.zeroAttach,allowed:state.job.status==='in_progress'&&!state.claim}};
      }
      assert.equal(name,'confirm_change_order_payment');
      if(state.saveError)return {data:null,error:{code:'08006'}};
      if(state.beforeUpdate){const fn=state.beforeUpdate;state.beforeUpdate=null;fn();}
      const e=args.p_evidence,m=e.metadata;
      if(Number(m.additional_amount)!==order.additional_amount ||
        (order.stripe_payment_intent_id&&order.stripe_payment_intent_id!==e.payment_intent_id)||
        (e.session_id&&order.stripe_checkout_session_id&&order.stripe_checkout_session_id!==e.session_id))return fail();
      if(order.payment_status==='paid')return {data:{outcome:'paid',already_paid:true}};
      state.evidence=clone(e);
      if(order.status!=='accepted'||order.payment_status!=='unpaid'||!['in_progress','completed'].includes(state.job.status)||state.job.preferred_provider_id!==order.provider_id||state.claim)return {data:{outcome:'reconciliation_required'}};
      Object.assign(order,{payment_status:'paid',stripe_payment_intent_id:e.payment_intent_id,paid_at:e.paid_at,
        additional_customer_fee_percent:Number(m.customer_fee_percent),additional_provider_net_amount:Number(m.provider_net_amount)});
      state.writes++;
      return {data:{outcome:'paid',already_paid:false}};
    },
    from(table) {
      assert.ok(['change_orders', 'service_requests', ...(state.allowCreation ? ['payment_settings','profiles'] : [])].includes(table), `Unexpected DB table: ${table}`);
      let values = null;
      const filters = [];
      const exclusions = [];
      const query = {
        select() { return query; }, eq(k,v) { filters.push([k,v]); return query; },
        neq(k,v) { exclusions.push([k,v]); return query; },
        order() {return query;}, limit() {return query;},
        then(resolve,reject) {return query.maybeSingle().then(resolve,reject);},
        is(k,v) { filters.push([k,v]); return query; },
        update(v) { assert.equal(table,'change_orders'); values=v; return query; },
        async maybeSingle() {
          if (state.readError && !values) return { data: null, error: { message: 'read failed' } };
          const row = table === 'change_orders' ? state.order : table === 'service_requests' ? state.job :
            table === 'profiles' ? {id:'customer1',stripe_customer_id:'cus1'} : {active:true,customer_service_fee_percent:10,provider_commission_percent:20,currency:'usd'};
          if (values && state.saveError) return { data: null, error: { message: 'save failed' } };
          if (values && state.beforeUpdate) { const fn=state.beforeUpdate; state.beforeUpdate=null; fn(); }
          if (!row || !filters.every(([k,v]) => row[k] === v) || !exclusions.every(([k,v])=>row[k]!==v)) return { data: null, error: null };
          if (values) { Object.assign(row,values); state.writes++; }
          return { data: clone(row), error: null };
        },
      };
      return query;
    },
  };
  const stripe = {
    checkout: { sessions: {
      retrieve: async id => { if(state.stripeReadError)throw Error('Stripe unavailable'); assert.ok(state.sessions[id]); return clone(state.sessions[id]); },
      list: async ({payment_intent}) => ({ data: Object.values(state.sessions).filter(s=>s.payment_intent===payment_intent).map(clone) }),
      create: async (params,options) => { if(!state.allowCreation)throw Error('TEST FAILURE: confirmation attempted to create Checkout');state.createKeys??=[];state.createKeys.push(options.idempotencyKey);if(state.sessions.cs_new)return clone(state.sessions.cs_new);state.creates++;state.createdParams=params;state.sessions.cs_new={id:'cs_new',mode:'payment',status:'open',payment_status:'unpaid',amount_total:11000,currency:'usd',metadata:params.metadata,url:'https://checkout.example.invalid'};if(state.afterCreate)state.afterCreate();return clone(state.sessions.cs_new); },
    } },
    paymentIntents: {
      retrieve: async id => { assert.ok(state.intents[id]); return clone(state.intents[id]); },
      create: async (params,options) => { if(!state.allowCreation)throw Error('TEST FAILURE: confirmation attempted to create PaymentIntent');state.createKeys??=[];state.createKeys.push(options.idempotencyKey);if(state.intents.pi_new)return clone(state.intents.pi_new);state.creates++;state.createdParams=params;state.intents.pi_new={...params,id:'pi_new',customer:'cus1',status:'requires_payment_method',client_secret:'fake_client_secret'};if(state.afterCreate)state.afterCreate();return clone(state.intents.pi_new); },
    },
    customerSessions: {create:async()=>({client_secret:'fake_customer_session'})},
    webhooks: { constructEvent: () => { if(!state.validSignature)throw Error('invalid signature'); return state.event; } },
  };
  const cache = new Map();
  function load(relative) {
    const filename=path.resolve(root,relative);
    if(cache.has(filename))return cache.get(filename);
    const testModule={exports:{}}; cache.set(filename,testModule.exports);
    const source=ts.transpileModule(fs.readFileSync(filename,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const mockedRequire = name => {
      if(name==='stripe')return function Stripe(){return stripe;};
      if(name==='@supabase/supabase-js')return {createClient:()=>db};
      if(name==='next/server')return {NextResponse:{json:(body,options)=>Response.json(body,options)}};
      if(name.endsWith('serverNotifications'))return {sendRelydoNotification:async()=>{state.notifications++; if(state.notificationError)throw Error('push failed');return {internalNotificationSaved:true};}};
      if(name.startsWith('.'))return load(path.relative(root,path.resolve(path.dirname(filename),name+'.ts')));
      throw Error('Unmocked dependency: '+name);
    };
    vm.runInNewContext(source,{module:testModule,exports:testModule.exports,require:mockedRequire,process:{env:{STRIPE_SECRET_KEY:'fake',STRIPE_WEBHOOK_SECRET:'fake',NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',SUPABASE_SECRET_KEY:'fake'}},console:{error(){},warn(){}},fetch:()=>{throw Error('Network forbidden');},Date,Response},{filename});
    return testModule.exports;
  }
  const helper=load('app/lib/changeOrderPayments.ts');
  const confirm=(input={sessionId:'cs1',expectedCustomerId:'customer1'})=>helper.confirmChangeOrderPayment(input);
  const request=(body={},token='valid')=>({headers:new Headers(token?{authorization:`Bearer ${token}`} : {}),json:async()=>body,nextUrl:{origin:'https://example.invalid'}});
  const webhook=async(type='checkout.session.completed')=>{
    state.event={type,data:{object:type==='payment_intent.succeeded'?state.intents.pi1:state.sessions.cs1}};
    return load('app/api/stripe/webhook/route.ts').POST({headers:new Headers({'stripe-signature':'test'}),text:async()=>'{"mock":true}'});
  };
  return {state,confirm,load,request,webhook,snapshot};
}

test('web: real Session snapshot is persisted, including Stripe charge date',async()=>{
  const f=fixture();const r=await f.confirm();assert.equal(r.paymentStatus,'paid');assert.equal(f.state.order.additional_provider_net_amount,80);assert.equal(f.state.order.paid_at,new Date(1750000000*1000).toISOString());assert.equal(f.state.writes,1);assert.equal(f.state.notifications,1);
});
test('repeated same payment is successful without additional writes or notification',async()=>{
  const f=fixture();await f.confirm();const r=await f.confirm();assert.equal(r.alreadyPaid,true);assert.equal(f.state.writes,1);assert.equal(f.state.notifications,1);
});
test('simultaneous confirmations converge on one write',async()=>{
  const f=fixture();const r=await Promise.all([f.confirm(),f.confirm()]);assert.ok(r.every(x=>x.paymentStatus==='paid'));assert.equal(f.state.writes,1);assert.equal(f.state.notifications,1);
});
test('another paid PaymentIntent is never overwritten',async()=>{
  const f=fixture();f.state.order.payment_status='paid';f.state.order.stripe_payment_intent_id='pi_other';await assert.rejects(f.confirm(),e=>e.status===409);assert.equal(f.state.writes,0);
});
test('changed attempt requires reconciliation',async()=>{
  const f=fixture();f.state.order.stripe_checkout_session_id='cs_other';await assert.rejects(f.confirm(),e=>e.status===409);assert.equal(f.state.writes,0);
});
test('invalid NULL payment status fails closed (real schema is NOT NULL)',async()=>{
  const f=fixture();f.state.order.payment_status=null;await assert.rejects(f.confirm(),e=>e.status===409);assert.equal(f.state.writes,0);
});
test('database failure is retryable; payment not reported as confirmed',async()=>{
  const f=fixture();f.state.saveError=true;await assert.rejects(f.confirm(),e=>e.status===503);assert.equal(f.state.order.payment_status,'unpaid');f.state.saveError=false;await f.confirm();assert.equal(f.state.writes,1);
});
test('concurrent budget edit is not silently reported as paid',async()=>{
  const f=fixture();f.state.beforeUpdate=()=>{f.state.order.additional_amount=999;};await assert.rejects(f.confirm(),e=>e.status===409);assert.equal(f.state.writes,0);
});
test('late confirmation after job completion is allowed',async()=>{
  const f=fixture();f.state.job.status='completed';await f.confirm();assert.equal(f.state.writes,1);
});
for(const conflict of ['cancelled','reassigned','rejected'])test(`${conflict} requires review, no automatic financial movement`,async()=>{
  const f=fixture();if(conflict==='cancelled')f.state.job.status='cancelled';if(conflict==='reassigned')f.state.job.preferred_provider_id='other';if(conflict==='rejected')f.state.order.status='rejected';await assert.rejects(f.confirm(),e=>e.status===409);assert.equal(f.state.writes,0);
});
test('ownership is checked',async()=>{const f=fixture();await assert.rejects(f.confirm({sessionId:'cs1',expectedCustomerId:'other'}),e=>e.status===403);assert.equal(f.state.writes,0);});
for(const invalid of ['amount','currency','metadata','refund','dispute','unpaid'])test(`reject ${invalid}`,async()=>{
  const f=fixture();if(invalid==='amount')f.state.intents.pi1.amount_received=1;if(invalid==='currency')f.state.sessions.cs1.currency='eur';if(invalid==='metadata')delete f.state.sessions.cs1.metadata.provider_net_amount;if(invalid==='refund')f.state.intents.pi1.latest_charge.amount_refunded=100;if(invalid==='dispute')f.state.intents.pi1.latest_charge.disputed=true;if(invalid==='unpaid')f.state.intents.pi1.status='processing';await assert.rejects(f.confirm(),e=>e.status===409);assert.equal(f.state.writes,0);
});
test('mobile uses historical snapshot without querying current settings',async()=>{
  const f=fixture();f.state.order.stripe_checkout_session_id=null;f.state.order.stripe_payment_intent_id='pi1';f.state.intents.pi1.metadata={...f.snapshot,payment_flow:'payment_sheet'};const r=await f.confirm({paymentIntentId:'pi1',expectedCustomerId:'customer1'});assert.equal(r.paymentStatus,'paid');assert.equal(f.state.order.additional_customer_fee_percent,10);
});
test('notification failure does not undo payment or cause another write',async()=>{
  const f=fixture();f.state.notificationError=true;const r=await f.confirm();assert.equal(r.notificationWarning,true);assert.equal((await f.confirm()).alreadyPaid,true);assert.equal(f.state.writes,1);
});
test('browser API accepts sessionId without changeOrderId',async()=>{
  const f=fixture();const response=await f.load('app/api/change-orders/verify-payment/route.ts').POST(f.request({sessionId:'cs1'}));assert.equal(response.status,200);assert.equal((await response.json()).paymentStatus,'paid');
});
test('missing/expired browser session fails, webhook still confirms with browser closed',async()=>{
  const f=fixture();const api=f.load('app/api/change-orders/verify-payment/route.ts');for(const token of ['', 'expired'])assert.equal((await api.POST(f.request({sessionId:'cs1'},token))).status,401);assert.equal(f.state.writes,0);assert.equal((await f.webhook()).status,200);assert.equal(f.state.writes,1);
});
test('internal header cannot bypass user authentication on public verification',async()=>{
  const f=fixture();const request=f.request({sessionId:'cs1'},'');request.headers.set('x-relydo-internal-stripe','fake');assert.equal((await f.load('app/api/change-orders/verify-payment/route.ts').POST(request)).status,401);
});
test('signed webhook repeats and async success are idempotent',async()=>{
  const f=fixture();assert.equal((await f.webhook()).status,200);assert.equal((await f.webhook('checkout.session.async_payment_succeeded')).status,200);assert.equal(f.state.writes,1);
});
test('PaymentIntent webhook resolves historical web Session snapshot',async()=>{
  const f=fixture();assert.equal((await f.webhook('payment_intent.succeeded')).status,200);assert.equal(f.state.writes,1);
});
test('mobile webhook works without a browser or app confirmation',async()=>{
  const f=fixture();f.state.order.stripe_checkout_session_id=null;f.state.order.stripe_payment_intent_id='pi1';f.state.intents.pi1.metadata={...f.snapshot,payment_flow:'payment_sheet'};assert.equal((await f.webhook('payment_intent.succeeded')).status,200);assert.equal(f.state.writes,1);
});
test('webhook returns 500 on DB failure, then recovers on retry',async()=>{
  const f=fixture();f.state.saveError=true;assert.equal((await f.webhook()).status,500);f.state.saveError=false;assert.equal((await f.webhook()).status,200);assert.equal(f.state.writes,1);
});
test('invalid signature cannot write payment',async()=>{const f=fixture();f.state.validSignature=false;assert.equal((await f.webhook()).status,400);assert.equal(f.state.writes,0);});
test('unrelated mobile payments remain ignored',async()=>{const f=fixture();f.state.intents.pi1.metadata.payment_type='initial';const r=await f.webhook('payment_intent.succeeded');assert.equal((await r.json()).ignored,true);assert.equal(f.state.writes,0);});
test('legacy mobile checkout confirm delegates without creating another payment',async()=>{
  const f=fixture();f.state.order.stripe_checkout_session_id=null;f.state.order.stripe_payment_intent_id='pi1';f.state.intents.pi1.metadata={...f.snapshot,payment_flow:'payment_sheet'};const r=await f.load('app/api/change-orders/checkout/route.ts').POST(f.request({changeOrderId:'co1',paymentFlow:'payment_sheet',action:'confirm',paymentIntentId:'pi1'}));assert.equal(r.status,200);assert.equal((await r.json()).paymentStatus,'paid');
});
test('checkout reconciles an already collected web payment',async()=>{
  const f=fixture();const r=await f.load('app/api/change-orders/checkout/route.ts').POST(f.request({changeOrderId:'co1'}));assert.equal(r.status,200);assert.equal((await r.json()).paymentStatus,'paid');assert.equal(f.state.writes,1);
});
test('failed Stripe lookup in checkout cannot fall through to a new charge',async()=>{
  const f=fixture();f.state.stripeReadError=true;const r=await f.load('app/api/change-orders/checkout/route.ts').POST(f.request({changeOrderId:'co1'}));assert.equal(r.status,503);assert.equal(f.state.writes,0);
});
test('verification rejects creation-only payload',async()=>{const f=fixture();const r=await f.load('app/api/change-orders/verify-payment/route.ts').POST(f.request({changeOrderId:'co1'}));assert.equal(r.status,400);assert.equal(f.state.writes,0);});

for (const flow of ['checkout','payment_sheet']) test(`new ${flow} preparation retains web/mobile response contract`,async()=>{
  const f=fixture();f.state.allowCreation=true;f.state.order.stripe_checkout_session_id=null;f.state.job.job_stage='working';
  const response=await f.load('app/api/change-orders/checkout/route.ts').POST(f.request({changeOrderId:'co1',paymentFlow:flow}));
  assert.equal(response.status,200);const result=await response.json();assert.equal(f.state.creates,1);assert.equal(f.state.order.payment_status,'unpaid');
  if(flow==='checkout'){assert.equal(result.url,'https://checkout.example.invalid');assert.equal(f.state.order.stripe_checkout_session_id,'cs_new');}
  else {assert.equal(result.paymentIntentClientSecret,'fake_client_secret');assert.equal(result.customerSessionClientSecret,'fake_customer_session');assert.equal(f.state.order.stripe_payment_intent_id,'pi_new');}
  assert.equal(f.state.createdParams.metadata.customer_total_amount,'110.00');
});
test('mobile verification endpoint keeps legacy confirm payload',async()=>{
  const f=fixture();f.state.order.stripe_checkout_session_id=null;f.state.order.stripe_payment_intent_id='pi1';f.state.intents.pi1.metadata={...f.snapshot,payment_flow:'payment_sheet'};
  const r=await f.load('app/api/change-orders/verify-payment/route.ts').POST(f.request({changeOrderId:'co1',paymentFlow:'payment_sheet',action:'confirm',paymentIntentId:'pi1'}));assert.equal(r.status,200);assert.equal((await r.json()).paymentStatus,'paid');
});
test('web and mobile cannot replace an already active attempt in another channel',async()=>{
  const f=fixture();f.state.sessions.cs1.status='open';f.state.sessions.cs1.payment_status='unpaid';f.state.sessions.cs1.url='https://example.invalid';f.state.intents.pi1.status='requires_payment_method';
  const r=await f.load('app/api/change-orders/checkout/route.ts').POST(f.request({changeOrderId:'co1',paymentFlow:'payment_sheet'}));assert.equal(r.status,409);
});
test('another customer cannot confirm legacy mobile checkout',async()=>{
  const f=fixture();f.state.user={id:'other'};const r=await f.load('app/api/change-orders/checkout/route.ts').POST(f.request({changeOrderId:'co1',action:'confirm',paymentIntentId:'pi1'}));assert.equal(r.status,404);assert.equal(f.state.writes,0);
});

// Execute the actual return-effect body in isolation; no React/browser/network.
async function runReturnEffect(payload) {
  const file=fs.readFileSync(path.join(root,'app/mis-solicitudes/[id]/page.tsx'),'utf8');
  const marker=file.indexOf('VERIFICAR REGRESO DE STRIPE PARA CHANGE ORDER');
  const start=file.indexOf('useEffect(() => {',marker)+'useEffect(() => {'.length;
  const end=file.indexOf('}, [id]);',start);
  assert.ok(start>marker&&end>start);
  const body=file.slice(start,end).replace('    verificar();','    await verificar();');
  const source=ts.transpileModule(`(async()=>{${body}})()`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const state={errors:[],messages:[],reloads:0,cleaned:false};
  await vm.runInNewContext(source,{
    id:'job1',language:'es',URLSearchParams,
    window:{location:{search:'?change_order_payment=success&session_id=cs1&change_order_id=co1'},history:{replaceState(){state.cleaned=true;}}},
    T:s=>s,setMensaje:s=>state.messages.push(s),setError:s=>state.errors.push(s),setVerificandoPagoChangeOrder(){},
    supabase:{auth:{getSession:async()=>({data:{session:{access_token:'valid'}}})}},
    fetch:async()=>({ok:true,json:async()=>payload}),cargarDetalle:async()=>{state.reloads++;},console:{error(){}},
  });
  return state;
}
test('return UI rejects HTTP success without a confirmed payment',async()=>{
  const state=await runReturnEffect({success:true,url:'https://checkout.example.invalid'});assert.equal(state.reloads,0);assert.equal(state.cleaned,false);assert.ok(state.errors.at(-1));
});
test('return UI rejects payment belonging to a different job',async()=>{
  const state=await runReturnEffect({paymentStatus:'paid',requestId:'other',changeOrderId:'co1'});assert.equal(state.reloads,0);assert.equal(state.cleaned,false);
});
test('return UI reloads totals and clears URL only after confirmed matching payment',async()=>{
  const state=await runReturnEffect({paymentStatus:'paid',requestId:'job1',changeOrderId:'co1',alreadyPaid:true});assert.equal(state.reloads,1);assert.equal(state.cleaned,true);assert.match(state.messages.at(-1),/Pago adicional confirmado/);
});

function freshPreparation() {
  const f=fixture();f.state.allowCreation=true;f.state.order.stripe_checkout_session_id=null;f.state.job.job_stage='working';
  f.prepare=(flow='checkout')=>f.load('app/api/change-orders/checkout/route.ts').POST(f.request({changeOrderId:'co1',paymentFlow:flow}));
  return f;
}
test('simultaneous web/mobile requests reserve one channel and one Stripe object',async()=>{
  const f=freshPreparation();const results=await Promise.all([f.prepare(),f.prepare('payment_sheet')]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(f.state.creates,1);
});
for(const flow of ['checkout','payment_sheet'])test(`simultaneous ${flow} requests share stable Stripe key and frozen parameters`,async()=>{
  const f=freshPreparation();const results=await Promise.all([f.prepare(flow),f.prepare(flow)]);
  assert.ok(results.every(r=>r.status===200));assert.equal(f.state.creates,1);assert.equal(new Set(f.state.createKeys).size,1);
});
for(const flow of ['checkout','payment_sheet'])test(`${flow}: failed attachment never exposes secret/URL and retry reuses original object`,async()=>{
  const f=freshPreparation();f.state.saveError=true;const first=await f.prepare(flow);assert.equal(first.status,503);
  const body=await first.json();assert.equal(body.url,undefined);assert.equal(body.paymentIntentClientSecret,undefined);
  assert.equal(f.state.order.stripe_checkout_session_id,null);assert.ok(f.state.reservation);
  f.state.saveError=false;assert.equal((await f.prepare(flow)).status,200);assert.equal(f.state.creates,1);assert.equal(new Set(f.state.createKeys).size,1);
});
test('missing migration fails closed before creating any Stripe object',async()=>{
  const f=freshPreparation();f.state.rpcMissing=true;assert.equal((await f.prepare()).status,503);assert.equal(f.state.creates,0);
});
test('missing confirm RPC never falls back to direct UPDATE',async()=>{
  const f=fixture();f.state.rpcMissing=true;await assert.rejects(f.confirm(),e=>e.status===503);assert.equal(f.state.writes,0);
});
test('zero attachment result never returns a payable URL',async()=>{
  const f=freshPreparation();f.state.zeroAttach=true;const r=await f.prepare();assert.equal(r.status,503);assert.equal((await r.json()).url,undefined);
});
test('uncertain reservation beyond retry window cannot create again',async()=>{
  const f=freshPreparation();f.state.saveError=true;await f.prepare();f.state.saveError=false;
  f.state.reservation.created_at=new Date(Date.now()-21*3600000).toISOString();assert.equal((await f.prepare()).status,409);assert.equal(f.state.creates,1);
});
test('old attached reservation only retrieves Stripe and never replaces expired Checkout',async()=>{
  const f=freshPreparation();await f.prepare();f.state.reservation.created_at='2020-01-01T00:00:00Z';f.state.sessions.cs_new.status='expired';
  assert.equal((await f.prepare()).status,409);assert.equal(f.state.creates,1);
});
test('cancellation between Stripe preparation and attachment stores identifier but hides URL',async()=>{
  const f=freshPreparation();f.state.afterCreate=()=>{f.state.job.status='cancelled';};const r=await f.prepare();
  assert.equal(r.status,409);assert.equal(f.state.order.stripe_checkout_session_id,'cs_new');assert.equal((await r.json()).url,undefined);
});
test('Stripe succeeds then claim conflict preserves evidence without local confirmation',async()=>{
  const f=fixture();f.state.claim=true;await assert.rejects(f.confirm(),e=>e.status===409);assert.equal(f.state.order.payment_status,'unpaid');assert.equal(f.state.evidence.payment_intent_id,'pi1');
});
test('historical expired web Session and succeeded mobile PaymentIntent reconcile without creation',async()=>{
  const f=fixture();f.state.sessions.cs1.status='expired';f.state.sessions.cs1.payment_status='unpaid';f.state.sessions.cs1.payment_intent=null;
  f.state.order.stripe_payment_intent_id='pi1';f.state.intents.pi1.metadata={...f.snapshot,payment_flow:'payment_sheet'};
  const r=await f.load('app/api/change-orders/checkout/route.ts').POST(f.request({changeOrderId:'co1'}));assert.equal(r.status,200);assert.equal((await r.json()).paymentStatus,'paid');assert.equal(f.state.creates,0);
});
test('reserved amount mismatch in Stripe is rejected before exposure',async()=>{
  const f=freshPreparation();await f.prepare('payment_sheet');f.state.intents.pi_new.amount=99999;
  assert.equal((await f.prepare('payment_sheet')).status,409);assert.equal(f.state.creates,1);
});
test('retries use frozen reservation even if profile/settings reads are unavailable',async()=>{
  const f=freshPreparation();await f.prepare();
  // Any additional settings/profile query now fails the fixture table allowlist.
  f.state.allowCreation=false;assert.equal((await f.prepare()).status,200);assert.equal(f.state.creates,1);
  f.state.allowCreation=true;
});
