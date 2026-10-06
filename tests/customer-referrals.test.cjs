const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const sql = fs.readFileSync('supabase/migrations/202610060003_customer_referrals_foundation.sql','utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('referrals: transactional capture, optional signup, immutable association, ledger and ACL constraints', async () => {
 const pg = new PGlite();
 try {
 await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_user_meta_data jsonb);
 CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text NOT NULL);
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;`);
 await pg.exec(sql);
 async function signup(n,code,role='customer') {
  await pg.exec('BEGIN');
  try {
   await pg.query('INSERT INTO auth.users VALUES ($1,$2)',[id(n),JSON.stringify({referral_code:code})]);
   await pg.query('INSERT INTO profiles VALUES ($1,$2)',[id(n),role]);
   await pg.exec('COMMIT');
  } catch(e) { await pg.exec('ROLLBACK'); throw e; }
 }
 await signup(1,null);
 const code = (await pg.query('SELECT ensure_customer_referral_code($1) AS code',[id(1)])).rows[0].code;
 assert.match(code,/^REL-[A-HJ-NP-Z2-9]{10}$/);
 assert.equal((await pg.query('SELECT ensure_customer_referral_code($1) AS code',[id(1)])).rows[0].code,code);
 await signup(2,` ${code.toLowerCase()} `);
 assert.equal((await pg.query('SELECT referrer_id FROM customer_referrals')).rows[0].referrer_id,id(1));
 await signup(3,'');
 await signup(4,null,'provider');
 await assert.rejects(signup(5,'INVALID'),/Invalid referral code/);
 assert.equal((await pg.query('SELECT count(*) AS n FROM auth.users WHERE id=$1',[id(5)])).rows[0].n,0);
 await assert.rejects(pg.query('SELECT ensure_customer_referral_code($1)',[id(4)]),/Customer required/);
 await assert.rejects(pg.query('UPDATE customer_referrals SET referrer_id=$1',[id(3)]),/immutable/);
 await assert.rejects(pg.query('UPDATE customer_referral_codes SET code=code'),/immutable/);
 await assert.rejects(pg.query('INSERT INTO customer_referrals VALUES ($1,$1,$2,now())',[id(1),code]),/check constraint/);
 await assert.rejects(pg.query('INSERT INTO customer_referrals VALUES ($1,$2,$3,now())',[id(2),id(1),code]),/unique constraint/);
 await assert.rejects(pg.query('INSERT INTO customer_referral_codes VALUES ($1,$2,now())',[id(4),code]),/unique constraint/);
 assert.equal((await pg.query('SELECT count(*) AS n FROM referral_credit_ledger')).rows[0].n,0);
 await assert.rejects(pg.query("INSERT INTO referral_credit_ledger(referral_id,beneficiary_id,award_kind,amount_cents) VALUES ($1,$2,'referrer',1500)",[id(2),id(3)]),/Invalid referral beneficiary/);
 const award = "INSERT INTO referral_credit_ledger(referral_id,beneficiary_id,award_kind,amount_cents) VALUES ($1,$2,'referrer',1500)";
 await pg.query(award,[id(2),id(1)]);
 await assert.rejects(pg.query(award,[id(2),id(1)]),/unique constraint/);
 await assert.rejects(pg.exec('DELETE FROM referral_credit_ledger'),/immutable/);
 await pg.query("UPDATE auth.users SET raw_user_meta_data = $1 WHERE id=$2",[JSON.stringify({referral_code:'INVALID'}),id(3)]);
 assert.equal((await pg.query('SELECT count(*) AS n FROM customer_referrals')).rows[0].n,1);
 // Force RNG collisions: retries must fail safely, never assign an existing code.
 await pg.exec(sql.slice(sql.indexOf('CREATE FUNCTION public.ensure_customer_referral_code'), sql.indexOf('CREATE FUNCTION public.my_customer_referral_code')).replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').replace('random()*', '0*'));
 await signup(6,null);
 await assert.rejects(signup(7,null),/generation exhausted/);
 assert.equal((await pg.query('SELECT count(*) AS n FROM profiles WHERE id=$1',[id(7)])).rows[0].n,0);
 await pg.exec('SET ROLE anon');
 assert.equal((await pg.query('SELECT validate_customer_referral_code($1) AS valid',[code.toLowerCase()])).rows[0].valid,true);
 assert.equal((await pg.query("SELECT validate_customer_referral_code('BAD') AS valid")).rows[0].valid,false);
 await assert.rejects(pg.query('SELECT ensure_customer_referral_code($1)',[id(1)]),/permission denied/);
 await pg.exec('RESET ROLE');
 await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id(3)]);
 await pg.exec('SET ROLE authenticated');
 assert.equal((await pg.query('SELECT * FROM customer_referrals')).rows.length,0);
 assert.equal((await pg.query('SELECT my_customer_referral_code() AS code')).rows.length,1);
 await assert.rejects(pg.query('INSERT INTO customer_referrals VALUES ($1,$2,$3,now())',[id(3),id(1),code]),/permission denied/);
 } finally { await pg.close(); }
});
test('real customer registration ES/EN sends optional metadata and validates on server', () => {
 const page=fs.readFileSync('app/registro-cliente/page.tsx','utf8');
 assert.ok(page.includes('Código de referido (opcional)'));
 assert.ok(page.includes('Referral code (optional)'));
 assert.match(page,/validate_customer_referral_code/);
 assert.match(page,/referral_code: referralCode.trim\(\) \|\| null/);
 assert.match(page,/<input id="referral-code"/);
 assert.ok(page.indexOf('validate_customer_referral_code') < page.indexOf('await supabase.auth.signUp'));
});
