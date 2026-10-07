const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const read = p => fs.readFileSync(p, 'utf8');
function load(p) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(read(p), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, URL });
 return exports;
}
function webSignup(code, valid = true, prefill = false) {
 const calls=[], errors=[], elements=[];
 const states=[code,'Customer B','b@example.test','4155551234','1 Main Street','','San Francisco','CA','94105','Strong-pass1!','Strong-pass1!',false,false,true,false,'','',false,false];
 let cursor=0;
 const jsx=(type,props)=>{const e={type,props:props||{}};elements.push(e);return e;};
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:valid,error:null};},auth:{signUp:async(args)=>{calls.push({name:'signup',args});return {data:{user:{id:id(2)},session:null},error:null};}}};
 const exports={};
 const requireStub=name=>{
  if(name==='react')return {Suspense:'Suspense',useState:initial=>{const index=cursor++;return [prefill&&index===0?initial:states[index],value=>{if(index===15)errors.push(value);}];},useEffect:()=>{}};
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(name==='next/navigation')return {useRouter:()=>({replace:()=>{}}),useSearchParams:()=>new URLSearchParams(prefill?`ref=${encodeURIComponent(code)}`:'')};
  if(name.includes('LanguageProvider'))return {useLanguage:()=>({language:'en'})};
  if(name.includes('supabaseBrowser'))return {supabase:db};
  throw Error(name);
 };
 vm.runInNewContext(ts.transpileModule(read('app/registro-cliente/page.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:requireStub,URLSearchParams,Date,console,window:{location:{origin:'https://relydo-staging.vercel.app'}}});
 const root=exports.default();root.props.children.type();
 const form=elements.find(e=>e.type==='form');
 return {submit:()=>form.props.onSubmit({preventDefault:()=>{}}),calls,errors,field:elements.find(e=>e.props.id==='referral-code')};
}
test('Web signup with no code succeeds without referral validation',async()=>{
 const h=webSignup('');await h.submit();assert.equal(h.calls.length,1);assert.equal(h.calls[0].args.options.data.referral_code,null);
});
test('Web signup validates valid code before persisting metadata',async()=>{
 const h=webSignup('REL-ABCDEFGH23');await h.submit();assert.equal(h.calls[0].name,'validate_customer_referral_code');assert.equal(h.calls[1].args.options.data.referral_code,'REL-ABCDEFGH23');
});
test('invalid Web code blocks signup; query prefill is normalized and editable',async()=>{
 const h=webSignup('BAD',false);await h.submit();assert.equal(h.calls.length,1);assert.match(h.errors.at(-1),/invalid.*leave it blank/);
 const query=webSignup(' rel-ABCDEFGH23 ',true,true);assert.equal(query.field.props.value,'REL-ABCDEFGH23');assert.equal(typeof query.field.props.onChange,'function');await query.submit();assert.equal(query.calls[1].args.options.data.referral_code,'REL-ABCDEFGH23');
});
test('canonical referral links, normalization and event-accurate ES/EN sharing', () => {
 const lib = load('app/lib/customerReferralProgram.ts');
 assert.equal(lib.normalizeReferralCode(' rel-ABCDEFGH23 '), 'REL-ABCDEFGH23');
 assert.equal(lib.normalizeReferralCode(null), '');
 for (const origin of ['https://relydo.co', 'https://www.relydo.co', 'https://untrusted.example']) {
  assert.equal(lib.customerReferralLink('REL-ABCDEFGH23', origin), 'https://relydo.co/registro-cliente?ref=REL-ABCDEFGH23');
 }
 assert.equal(lib.customerReferralLink('REL-ABCDEFGH23', 'https://relydo-staging.vercel.app'), 'https://relydo-staging.vercel.app/registro-cliente?ref=REL-ABCDEFGH23');
 assert.equal(new URL(lib.customerReferralLink('a&b')).searchParams.get('ref'), 'A&B');
 assert.match(lib.customerReferralMessage(true), /primer trabajo válido.*libere el pago/);
 assert.match(lib.customerReferralMessage(false), /first qualifying job.*payment is released/);
 const web = read('app/registro-cliente/page.tsx');
 assert.match(web, /searchParams.get\("ref"\).*trim\(\).toUpperCase\(\)/);
 assert.match(web, /referral_code: referralCode.trim\(\) \|\| null/);
 assert.match(read('app/components/CustomerReferralCard.tsx'), /navigator.share/);
 assert.match(read('app/components/CustomerReferralCard.tsx'), /navigator.clipboard.writeText/);
});
test('Web card copies owner code, shares canonical link and falls back to copying; cancel stays quiet',async()=>{
 const lib=load('app/lib/customerReferralProgram.ts');
 async function scenario(share) {
  const copied=[],shared=[],elements=[];let cursor=0;
  const states=[{code:'REL-ABCDEFGH23',availableCents:1500,registered:1,pending:1,rewarded:0,referred:false},false,''];
  const jsx=(type,props)=>{const e={type,props:props||{}};elements.push(e);return e;};
  const exports={};const navigator={clipboard:{writeText:async value=>copied.push(value)}};
  if(share)navigator.share=async payload=>{shared.push(payload);if(share==='cancel')throw new DOMException('Cancelled','AbortError');};
  const requireStub=name=>{
   if(name==='react')return {useState:()=>[states[cursor++],()=>{}],useEffect:()=>{}};
   if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
   if(name.includes('LanguageProvider'))return {useLanguage:()=>({language:'en'})};
   if(name.includes('supabaseBrowser'))return {supabase:{}};
   if(name.includes('customerReferralProgram'))return lib;
   throw Error(name);
  };
  vm.runInNewContext(ts.transpileModule(read('app/components/CustomerReferralCard.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:requireStub,navigator,DOMException,window:{location:{origin:'https://www.relydo.co'}}});
  exports.default();const buttons=elements.filter(e=>e.type==='button');await buttons[0].props.onClick();await buttons[1].props.onClick();
  // Event handlers return void; let the async clipboard/share continuation settle.
  await new Promise(resolve=>setImmediate(resolve));
  return {copied,shared};
 }
 const native=await scenario(true);assert.equal(native.copied[0],'REL-ABCDEFGH23');assert.equal(native.shared[0].url,'https://relydo.co/registro-cliente?ref=REL-ABCDEFGH23');
 const fallback=await scenario(false);assert.match(fallback.copied[1],/first qualifying job.*https:\/\/relydo.co\/registro-cliente\?ref=REL-ABCDEFGH23/);
 const cancel=await scenario('cancel');assert.equal(cancel.copied.length,1);
});

test('summary: caller-only code/balance, pending/rewarded states, relationship privacy and admin isolation', async () => {
 const pg = new PGlite();
 try {
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_user_meta_data jsonb);
   CREATE TABLE profiles(id uuid PRIMARY KEY,role text,admin_role text);
   CREATE TABLE referral_credit_movements(customer_id uuid,amount_cents bigint);
   GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;`);
  await pg.exec(read('supabase/migrations/202610060003_customer_referrals_foundation.sql'));
  const checkout = read('supabase/migrations/202610070003_customer_referral_checkout.sql');
  await pg.exec(checkout.slice(checkout.indexOf('CREATE FUNCTION public.referral_credit_balance'), checkout.indexOf('CREATE FUNCTION public.my_referral_credit_balance')));
  await pg.exec('REVOKE ALL ON FUNCTION referral_credit_balance(uuid) FROM PUBLIC,anon,authenticated');
  await pg.exec(read('supabase/migrations/202610070004_customer_referral_summary.sql'));
  async function signup(n, code) {
   await pg.query('insert into auth.users values($1,$2)', [id(n),JSON.stringify({ referral_code:code })]);
   await pg.query("insert into profiles(id,role) values($1,'customer')",[id(n)]);
  }
  await signup(1); const code=(await pg.query('select code from customer_referral_codes')).rows[0].code;
  await signup(2,code); await signup(3);
  async function as(n,role='authenticated') {
   await pg.exec('RESET ROLE'); await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]); await pg.exec(`SET ROLE ${role}`);
  }
  const summary=async()=>(await pg.query('select my_customer_referral_summary() s')).rows[0].s;
  await as(1); let s=await summary();
  assert.equal(s.code,code); assert.equal(s.availableCents,0); assert.equal(s.registered,1); assert.equal(s.pending,1); assert.equal(s.rewarded,0);
  assert.equal(s.referred,false); assert.equal(Object.keys(s).length,7);
  assert.equal((await pg.query('select * from customer_referral_codes')).rows.length,1);
  await assert.rejects(pg.query('select * from customer_referrals'),/permission denied/);
  await assert.rejects(pg.query('select admin_customer_referrals($1)',[id(2)]),/ADMIN_REQUIRED/);
  await as(2); s=await summary(); assert.equal(s.referred,true); assert.equal(s.awarded,false); assert.notEqual(s.code,code);
  await pg.exec('RESET ROLE');
  await pg.query("insert into referral_credit_ledger(referral_id,beneficiary_id,award_kind,amount_cents) values($1,$2,'referrer',1500),($1,$1,'referred',1500)",[id(2),id(1)]);
  await pg.query('insert into referral_credit_movements values($1,-300)',[id(1)]);
  await as(1); s=await summary(); assert.equal(s.availableCents,1200);assert.equal(s.pending,0);assert.equal(s.rewarded,1);
  await as(2);s=await summary();assert.equal(s.awarded,true);assert.equal(s.availableCents,1500);
  await as(3);s=await summary();assert.equal(s.registered,0);assert.equal(s.availableCents,0);
  assert.equal((await pg.query('select * from referral_credit_ledger')).rows.length,0);
  await as(3,'anon');await assert.rejects(summary(),/permission denied/);
  await pg.exec('RESET ROLE');await pg.query("insert into profiles values($1,'admin','support_agent'),($2,'admin','finance_manager')",[id(4),id(5)]);
  await as(4);const admin=(await pg.query('select admin_customer_referrals($1) s',[id(1)])).rows[0].s;
  assert.equal(admin.code,code); assert.equal(admin.relationships[0].status,'rewarded');
  assert.deepEqual(Object.keys(admin.relationships[0]).sort(),['code','created_at','referred_id','referrer_id','status']);
  await as(5);await assert.rejects(pg.query('select admin_customer_referrals($1)',[id(1)]),/ADMIN_REQUIRED/);
 } finally { await pg.close(); }
});
