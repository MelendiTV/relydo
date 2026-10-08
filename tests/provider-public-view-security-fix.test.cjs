const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8').replace(/^\uFEFF/,'');
const columns='user_id business_name bio trade years_experience service_radius_miles average_rating completed_jobs verified active verification_status city state zip_code avatar_url company_logo_url cover_url has_license insured bonded'.split(' ').sort();
test('invoker regression: restore public visibility without changing private RLS, definition or ACL',async()=>{
 const pg=new PGlite();
 const customer='5612387d-5ce6-40c7-be15-492def8b1b3c', pro='17b89d53-b1e8-41c2-bc2d-a0668315a56d';
 const sql=read('supabase/migrations/202610080003_provider_public_view_security_fix.sql');
 assert.equal(sql.trim(),'ALTER VIEW public.public_provider_profiles SET (security_invoker = false);');
 const metadata=async()=> (await pg.query(`SELECT pg_get_viewdef(oid) AS definition,relacl::text AS acl,relowner, (SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE tablename IN ('provider_profiles','service_requests')) AS policies FROM pg_class WHERE oid='public.public_provider_profiles'::regclass`)).rows[0];
 const client=async()=>{await pg.exec('SET ROLE authenticated');await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[customer]);};
 const gate=async()=> (await pg.query('SELECT EXISTS(SELECT 1 FROM public.public_provider_profiles WHERE user_id=$1 AND verification_status=\'verified\' AND verified=true AND active=true) AS ok',[pro])).rows[0].ok;
 try{
  await pg.exec(read('tests/fixtures/provider-profile-privacy-schema.sql'));
  await pg.exec(read('supabase/migrations/202609300002_provider_profiles_public_allowlist.sql'));
  await pg.query("INSERT INTO profiles(id,role,full_name) VALUES($1,'customer','Fixture customer'),($2,'provider','Fixture Pro')",[customer,pro]);
  await pg.query("INSERT INTO provider_profiles(user_id,business_name,verified,active,verification_status,address,stripe_account_id) VALUES($1,'Public Pro',true,true,'verified','private','acct_private')",[pro]);
  await pg.exec('ALTER VIEW public.public_provider_profiles SET (security_invoker = true)');
  const before=await metadata();
  await client(); assert.equal(await gate(),false);
  assert.equal((await pg.query('SELECT * FROM public.provider_profiles')).rows.length,0);
  await pg.exec('RESET ROLE'); await pg.exec(sql);
  assert.deepEqual(await metadata(),before);
  const opts=(await pg.query("SELECT reloptions FROM pg_class WHERE oid='public.public_provider_profiles'::regclass")).rows[0].reloptions;
  assert.ok(opts.includes('security_barrier=true')); assert.ok(opts.includes('security_invoker=false'));
  await client(); assert.equal(await gate(),true);
  assert.equal((await pg.query('SELECT * FROM public.provider_profiles')).rows.length,0);
  for(const role of ['authenticated','anon']){
   await pg.exec('RESET ROLE');await pg.exec(`SET ROLE ${role}`);
   const rows=(await pg.query('SELECT * FROM public.public_provider_profiles')).rows;
   assert.equal(rows.length,1);assert.deepEqual(Object.keys(rows[0]).sort(),columns);
   for(const field of ['address','stripe_account_id','license_number']) await assert.rejects(pg.query(`SELECT ${field} FROM public.public_provider_profiles`),/does not exist/);
   if(role==='anon')await assert.rejects(pg.query('SELECT * FROM public.provider_profiles'),/permission denied/);
  }
  await pg.exec('RESET ROLE');await pg.exec(sql);assert.deepEqual(await metadata(),before);
 }finally{await pg.close();}
});
