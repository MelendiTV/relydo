/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test harness. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createHmac } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '..');

test('Checkr authenticity uses direct-account HMAC, rejects bad signatures and unsafe origins', () => {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, 'app/lib/checkr.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  const env = { PROVIDER_SCREENING_ENABLED: 'true', CHECKR_API_KEY: 'fixture-key-not-a-credential', CHECKR_PACKAGE_SLUG: 'fixture' };
  vm.runInNewContext(source, { exports, require: name => name === 'server-only' ? {} : require(name), process: { env }, URL, Buffer });
  const raw = '{"id":"fixture"}';
  const signature = createHmac('sha256', env.CHECKR_API_KEY).update(raw).digest('hex');
  assert.equal(exports.authenticCheckrBody(raw, signature), true);
  assert.equal(exports.authenticCheckrBody(raw + ' ', signature), false);
  assert.equal(exports.authenticCheckrBody(raw, 'bad'), false);
  assert.equal(exports.authenticCheckrBody(raw, null), false);
  env.CHECKR_API_BASE_URL = 'https://attacker.invalid/v1';
  assert.throws(() => exports.checkrConfig());
});

test('payment confirmation retrieves Stripe state and rejects amount/owner mismatches', async () => {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, 'app/lib/providerScreening.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  const row = { id: 'screening-fixture', provider_id: 'pro-fixture', stripe_session_id: 'cs_fixture', amount: 5999, currency: 'usd', paid_at: null };
  let writes = 0;
  const query = { select() { return this; }, eq() { return this; }, single: async () => ({ data: row }), then(resolve) { resolve({ error: null }); } };
  const db = { from: () => ({ ...query, update() { writes++; return query; } }) };
  vm.runInNewContext(source, { exports, require: name => name === 'server-only' ? {} : name === '@supabase/supabase-js' ? { createClient: () => db } : require(name), process: { env: {} } });
  const metadata = { payment_type: 'provider_verification', screening_id: row.id, provider_id: row.provider_id };
  const session = { id: row.stripe_session_id, metadata, client_reference_id: row.provider_id, amount_total: 5999, currency: 'usd', payment_status: 'paid', payment_intent: 'pi_fixture' };
  const intent = { id: 'pi_fixture', status: 'succeeded', amount_received: 5999, currency: 'usd', metadata, latest_charge: { paid: true, status: 'succeeded', amount_refunded: 0, refunded: false, disputed: false } };
  const stripe = { checkout: { sessions: { retrieve: async () => session } }, paymentIntents: { retrieve: async () => intent } };
  await exports.confirmScreeningPayment(stripe, session.id);
  assert.equal(writes, 1);
  session.amount_total = 1;
  await assert.rejects(exports.confirmScreeningPayment(stripe, session.id), /mismatch/);
  session.amount_total = 5999; session.client_reference_id = 'other-pro';
  await assert.rejects(exports.confirmScreeningPayment(stripe, session.id), /mismatch/);
  session.client_reference_id = row.provider_id; intent.status = 'processing';
  await assert.rejects(exports.confirmScreeningPayment(stripe, session.id), /mismatch/);
  assert.equal(writes, 1);
});

test('migration in ephemeral PostgreSQL: backend-only writes, dedupe, ordered states, approval guard', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE profiles(id uuid PRIMARY KEY);
      CREATE TABLE provider_profiles(user_id uuid PRIMARY KEY,verified boolean DEFAULT false,active boolean DEFAULT false,verification_status text DEFAULT 'pending');
      INSERT INTO profiles VALUES('00000000-0000-4000-8000-000000000001');
      INSERT INTO provider_profiles(user_id) SELECT id FROM profiles;`);
    await pg.exec(fs.readFileSync(path.join(root, 'supabase/migrations/202610020002_provider_screening_foundation.sql'), 'utf8'));
    const row = (await pg.query(`INSERT INTO provider_screenings(provider_id,amount,currency,package_slug) SELECT id,5999,'usd','fixture' FROM profiles RETURNING id`)).rows[0];
    async function event(id, date, background, identity) {
      await pg.query('SELECT apply_provider_screening_event($1,$2,$3,$4,$5,$6,$7,$8)', [row.id, id, 'report.completed', date, 'report-fixture', null, background, identity]);
    }
    // Disabled database flag preserves the previous approval behavior.
    await pg.exec("UPDATE provider_profiles SET verified=true,active=true,verification_status='verified'; UPDATE provider_profiles SET verified=false,active=false,verification_status='pending'; UPDATE provider_screening_settings SET enabled=true");
    await assert.rejects(pg.exec('UPDATE provider_profiles SET verified=true,active=true,verification_status=\'verified\''), /screening required/);
    await pg.exec("UPDATE provider_screenings SET payment_status='paid'");
    await event('e1','2026-10-02T01:00:00Z','consider','verified');
    assert.equal((await pg.query('SELECT decision_state FROM provider_screenings')).rows[0].decision_state,'human_review');
    await event('e2','2026-10-02T02:00:00Z','clear','pending');
    await assert.rejects(pg.exec('UPDATE provider_profiles SET verified=true'), /screening required/);
    await event('e3','2026-10-02T03:00:00Z','clear','pending');
    await event('e3','2026-10-02T04:00:00Z','consider','pending');
    await pg.query('SELECT apply_provider_screening_event($1,$2,$3,$4,$5,$6,$7,$8)', [row.id,'inv-new','invitation.completed','2026-10-02T09:00:00Z','report-fixture','completed',null,null]);
    assert.equal((await pg.query('SELECT identity_status FROM provider_screenings')).rows[0].identity_status,'pending');
    await event('old-completed','2026-10-02T01:00:00Z','clear','verified');
    assert.equal((await pg.query('SELECT decision_state FROM provider_screenings')).rows[0].decision_state,'eligible');
    await pg.exec("UPDATE provider_screenings SET payment_status='unpaid'");
    await assert.rejects(pg.exec('UPDATE provider_profiles SET verified=true'), /screening required/);
    await pg.exec("UPDATE provider_screenings SET payment_status='paid'; UPDATE provider_profiles SET verified=true,active=true,verification_status='verified'");
    await pg.exec('SET ROLE authenticated');
    await assert.rejects(pg.exec('UPDATE provider_screenings SET identity_status=\'verified\''), /permission denied/);
    await assert.rejects(pg.exec('SELECT * FROM provider_screening_events'), /permission denied/);
    await assert.rejects(pg.exec('UPDATE provider_screening_settings SET enabled=false'), /permission denied/);
    await pg.exec('RESET ROLE');
    await pg.exec("UPDATE provider_screenings SET payment_status='refunded'");
    await assert.rejects(pg.exec('UPDATE provider_profiles SET active=true'), /screening required/);
    await pg.exec("UPDATE provider_screenings SET payment_status='disputed'");
    await event('after-dispute','2026-10-02T10:00:00Z','clear','verified');
    assert.equal((await pg.query('SELECT decision_state FROM provider_screenings')).rows[0].decision_state,'blocked');
    await assert.rejects(pg.exec('UPDATE provider_profiles SET active=true'), /screening required/);
  } finally { await pg.close(); }
});

function loadModule(file, env, db, extra = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { exports, require: name => name === 'server-only' ? {} : name === '@supabase/supabase-js' ? { createClient: () => db } : require(name), process: { env }, URL, Buffer, AbortSignal, ...extra });
  return exports;
}
test('application flag disabled never queries screening; enabled fails closed', async () => {
  const env = {};
  const db = { from() { throw new Error('database should not be consulted'); } };
  const lib = loadModule('app/lib/providerScreening.ts',env,db);
  for (const flag of [undefined,'false','TRUE','1','']) {
    env.PROVIDER_SCREENING_ENABLED = flag;
    assert.equal(await lib.screeningApprovalReady('pro'),true);
  }
  env.PROVIDER_SCREENING_ENABLED = 'true';
  await assert.rejects(lib.screeningApprovalReady('pro'),/database/);
});
test('report explicitly includes IDV and terminal identity outcomes do not remain pending', async () => {
  let url;
  const identity = {status:'complete',result:'clear'};
  const lib = loadModule('app/lib/checkr.ts', { PROVIDER_SCREENING_ENABLED:'true', CHECKR_API_KEY:'fixture', CHECKR_PACKAGE_SLUG:'fixture' }, null, {
    fetch: async target => { url=String(target); return {ok:true,json:async () => ({identity_verification:identity})}; }
  });
  const report = await lib.checkrReport('report-fixture');
  assert.equal(url,'https://api.checkr.com/v1/reports/report-fixture?include=identity_verification');
  assert.equal(lib.checkrIdentityStatus(report.identity_verification),'verified');
  for (const value of [{status:'complete',result:'consider'}, {status:'complete',result:'unknown'}, {status:'canceled'}, {status:'complete',result:'clear',cancellation_reason:'fixture'}]) assert.equal(lib.checkrIdentityStatus(value),'unverified');
  assert.equal(lib.checkrIdentityStatus({status:'pending'}),'pending');
  assert.equal(lib.checkrIdentityStatus(null),'pending');
});
test('start revalidates actual charge, persists refund/dispute and cannot revive an invalid payment', async () => {
  const row = {id:'screening',provider_id:'pro',payment_status:'paid',stripe_payment_intent_id:'pi',amount:5999,currency:'usd'};
  let persisted; let retrieves=0;
  const query = {select(){return this;},eq(){return this;},single:async()=>({data:{...row,payment_status:persisted?.payment_status || row.payment_status}}),then(resolve){resolve({error:null});}};
  const db = {from:()=>({...query,update(value){persisted=value;return query;}})};
  const lib = loadModule('app/lib/providerScreening.ts',{},db);
  const charge = {id:'ch',payment_intent:'pi',paid:true,status:'succeeded',amount_refunded:0,refunded:false,disputed:false};
  const intent = {id:'pi',status:'succeeded',amount_received:5999,currency:'usd',metadata:{payment_type:'provider_verification',screening_id:'screening',provider_id:'pro'},latest_charge:charge};
  const stripe = {paymentIntents:{retrieve:async(id,options)=>{retrieves++; if(options)assert.deepEqual(Array.from(options.expand),['latest_charge']);return intent;}},charges:{retrieve:async()=>charge}};
  assert.equal(await lib.revalidateScreeningPayment(stripe,row),true);
  charge.amount_refunded=1;
  assert.equal(await lib.revalidateScreeningPayment(stripe,row),false);
  assert.equal(persisted.payment_status,'refunded');
  assert.equal(persisted.decision_state,'blocked');
  persisted=null;charge.amount_refunded=0;charge.disputed=true;
  assert.equal(await lib.revalidateScreeningPayment(stripe,row),false);
  assert.equal(persisted.payment_status,'disputed');
  const count=retrieves;
  assert.equal(await lib.revalidateScreeningPayment(stripe,{...row,payment_status:'refunded'}),false);
  assert.equal(retrieves,count);
  persisted=null; await lib.invalidateScreeningPayment(stripe,'ch','disputed');
  assert.equal(persisted.payment_status,'disputed');
  charge.disputed=false;
  assert.equal(await lib.revalidateScreeningPayment(stripe,row),false);
  intent.latest_charge=null;
  await assert.rejects(lib.revalidateScreeningPayment(stripe,row),/Expanded charge/);
});

test('Stripe webhook dispatches refunds/disputes and retries failed persistence', async () => {
  let event; let fail=false; const calls=[];
  const exports={};
  const source=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/stripe/webhook/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  vm.runInNewContext(source,{exports,process:{env:{STRIPE_SECRET_KEY:'fixture',STRIPE_WEBHOOK_SECRET:'fixture'}},require:name=>{
    if(name==='next/server')return {NextResponse:{json:(body,options)=>Response.json(body,options)}};
    if(name==='stripe')return function(){return {webhooks:{constructEvent:()=>event}};};
    if(name.endsWith('providerScreening'))return {invalidateScreeningPayment:async(stripe,id,status)=>{calls.push([id,status]);if(fail)throw Error('fixture');}};
    if(name.endsWith('changeOrderPayments'))return {};
    throw Error(name);
  },Response});
  const request={text:async()=>'',headers:new Headers({'stripe-signature':'fixture'})};
  for(const type of ['charge.refunded','charge.dispute.created','charge.dispute.updated','charge.dispute.closed']) {
    event={type,data:{object:type==='charge.refunded'?{id:'ch'}:{charge:'ch'}}};
    assert.equal((await exports.POST(request)).status,200);
    assert.deepEqual(calls.at(-1),['ch',type==='charge.refunded'?'refunded':'disputed']);
  }
  fail=true;
  assert.equal((await exports.POST(request)).status,500);
});
test('provider start blocks before every Checkr call when payment is invalid', async () => {
  for (const payment_status of ['refunded','disputed','paid']) {
    let checkrCalls=0;let validations=0;
    const row={id:'screening',provider_id:'pro',payment_status};
    const db={from:table=>({select(){return this;},eq(){return this;},single:async()=>({data:table==='profiles'?{role:'provider'}:table==='provider_profiles'?{user_id:'pro',verification_status:'pending'}:row})})};
    const exports={};
    const source=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/provider/screening/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
    vm.runInNewContext(source,{exports,process:{env:{STRIPE_SECRET_KEY:'sk_test_fixture',PROVIDER_VERIFICATION_AMOUNT_CENTS:'5999'}},require:name=>{
      if(name==='next/server')return {NextResponse:{json:(body,options)=>Response.json(body,options)}};
      if(name==='stripe')return function(){return {};};
      if(name.endsWith('serverAuth'))return {getAuthenticatedUser:async()=>({user:{id:'pro',email:'fixture@example.invalid'}})};
      if(name.endsWith('providerScreening'))return {screeningDb:()=>db,screeningColumns:'fixture',revalidateScreeningPayment:async()=>{validations++;return false;}};
      if(name.endsWith('checkr'))return {checkrConfig:()=>({packageSlug:'fixture'}),checkrRequest:async()=>{checkrCalls++;throw Error('must not call');}};
      if(name.endsWith('adminPermissions'))return {};
      throw Error(name);
    },Response});
    const response=await exports.POST({json:async()=>({action:'start'})});
    assert.equal(response.status,409);
    assert.equal(checkrCalls,0);
    assert.equal(validations,payment_status==='paid'?1:0);
  }
});
