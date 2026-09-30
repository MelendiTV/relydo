const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');

const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const publicColumns='user_id business_name bio trade years_experience service_radius_miles average_rating completed_jobs verified active verification_status city state zip_code avatar_url company_logo_url cover_url has_license insured bonded'.split(' ');

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

async function role(pg,r,n){
  await pg.exec('RESET ROLE');
  await pg.query(
    "select set_config('request.jwt.claim.sub',$1,false)",
    [n?id(n):'']
  );
  await pg.exec(`SET ROLE ${r}`);
}

test('real PostgreSQL ACL/RLS: phased public allowlist and private cutover',async t=>{
  const pg=new PGlite();

  try{
    await pg.exec(read('tests/fixtures/provider-profile-privacy-schema.sql'));

    await pg.exec(
      "ALTER TABLE profiles ALTER COLUMN full_name SET DEFAULT 'Fixture user'"
    );

    await pg.exec(`
      INSERT INTO profiles(id,role,admin_role) VALUES
        ('${id(1)}','customer',NULL),
        ('${id(2)}','provider',NULL),
        ('${id(3)}','provider',NULL),
        ('${id(4)}','admin','provider_manager'),
        ('${id(5)}','admin','finance_manager'),
        ('${id(6)}','admin','claims_manager'),
        ('${id(7)}','admin','support_agent');

      INSERT INTO provider_profiles(
        user_id,
        business_name,
        verified,
        active,
        verification_status,
        address,
        latitude,
        longitude,
        stripe_account_id,
        license_number,
        zip_code
      ) VALUES
        (
          '${id(2)}',
          'Public Pro',
          true,
          true,
          'verified',
          'Private address',
          40,
          -115,
          'acct_secret',
          'LICENSE_SECRET',
          '89101-1234'
        ),
        (
          '${id(3)}',
          'Pending Pro',
          false,
          true,
          'pending',
          'Other address',
          41,
          -116,
          'acct_other',
          NULL,
          '89101'
        );

      INSERT INTO services(id,name,slug)
      VALUES('${id(8)}','Repair','repair');

      INSERT INTO provider_services(provider_id,service_id)
      VALUES('${id(2)}','${id(8)}');

      INSERT INTO reviews(job_id,reviewer_id,reviewee_id,rating)
      VALUES('${id(9)}','${id(1)}','${id(2)}',5);
    `);

    /*
     * PHASE 1
     * Safe allowlisted view becomes available, but legacy direct reads
     * remain temporarily compatible for older Cliente installations.
     */
    await pg.exec(
      read('supabase/migrations/202609300002_provider_profiles_public_allowlist.sql')
    );

    await t.test(
      'phase 1 exposes safe public view while preserving temporary legacy reads',
      async()=>{
        await role(pg,'anon');

        const publicRows=(
          await pg.query('SELECT * FROM public_provider_profiles')
        ).rows;

        assert.equal(publicRows.length,1);

        assert.deepEqual(
          Object.keys(publicRows[0]).sort(),
          [...publicColumns].sort()
        );

        assert.equal(publicRows[0].zip_code,'89101');
        assert.equal(publicRows[0].has_license,true);

        for(const c of [
          'address',
          'latitude',
          'longitude',
          'stripe_account_id',
          'stripe_payouts_enabled',
          'license_number',
          'registration_source',
          'insurance_company'
        ]){
          await assert.rejects(
            pg.query(`SELECT ${c} FROM public_provider_profiles`),
            /does not exist/
          );
        }

        await assert.rejects(
          pg.query("UPDATE public_provider_profiles SET bio='bad'"),
          /permission denied/
        );

        /*
         * Temporary backwards compatibility:
         * verified legacy rows remain readable until Phase 2.
         */
        const anonLegacy=(
          await pg.query(
            'SELECT user_id,address,license_number FROM provider_profiles'
          )
        ).rows;

        assert.equal(anonLegacy.length,1);
        assert.equal(anonLegacy[0].user_id,id(2));
        assert.equal(anonLegacy[0].address,'Private address');
        assert.equal(anonLegacy[0].license_number,'LICENSE_SECRET');

        await role(pg,'authenticated',1);

        const customerLegacy=(
          await pg.query(
            'SELECT user_id,address FROM provider_profiles'
          )
        ).rows;

        assert.equal(customerLegacy.length,1);
        assert.equal(customerLegacy[0].user_id,id(2));

        await role(pg,'authenticated',3);

        const providerLegacy=(
          await pg.query('SELECT * FROM provider_profiles')
        ).rows;

        assert.equal(providerLegacy.length,2);

        await role(pg,'authenticated',5);

        const financeLegacy=(
          await pg.query('SELECT * FROM provider_profiles')
        ).rows;

        assert.equal(financeLegacy.length,1);
        assert.equal(financeLegacy[0].user_id,id(2));
      }
    );

    /*
     * PHASE 2
     * Deferred cutover removes legacy public access.
     */
    await role(pg,'postgres');

    await pg.exec(
      read('supabase/deferred/provider_profiles_private_read_cutover.sql')
    );

    await t.test(
      'phase 2 anon select star exposes exactly allowlisted columns and active verified rows',
      async()=>{
        await role(pg,'anon');

        const rows=(
          await pg.query('SELECT * FROM public_provider_profiles')
        ).rows;

        assert.equal(rows.length,1);

        assert.deepEqual(
          Object.keys(rows[0]).sort(),
          [...publicColumns].sort()
        );

        assert.equal(rows[0].zip_code,'89101');
        assert.equal(rows[0].has_license,true);

        for(const c of [
          'address',
          'latitude',
          'longitude',
          'stripe_account_id',
          'stripe_payouts_enabled',
          'license_number',
          'registration_source',
          'insurance_company'
        ]){
          await assert.rejects(
            pg.query(`SELECT ${c} FROM public_provider_profiles`),
            /does not exist/
          );
        }

        await assert.rejects(
          pg.query('SELECT address FROM provider_profiles'),
          /permission denied/
        );

        await assert.rejects(
          pg.query('SELECT * FROM provider_profiles'),
          /permission denied/
        );

        await assert.rejects(
          pg.query("UPDATE public_provider_profiles SET bio='bad'"),
          /permission denied/
        );
      }
    );

    await t.test(
      'phase 2 authenticated customer cannot read another Pro through direct API or joins',
      async()=>{
        await role(pg,'authenticated',1);

        assert.equal(
          (await pg.query('SELECT * FROM provider_profiles')).rows.length,
          0
        );

        assert.equal(
          (
            await pg.query(
              'SELECT stripe_account_id,address FROM provider_profiles WHERE user_id=$1',
              [id(2)]
            )
          ).rows.length,
          0
        );

        assert.equal(
          (
            await pg.query(
              'SELECT p.* FROM provider_profiles p JOIN public_provider_profiles v USING(user_id)'
            )
          ).rows.length,
          0
        );

        assert.equal(
          (await pg.query('SELECT * FROM public_provider_profiles')).rows.length,
          1
        );
      }
    );

    await t.test(
      'phase 2 own Pro has all private columns even when not publicly verified',
      async()=>{
        await role(pg,'authenticated',3);

        const rows=(
          await pg.query('SELECT * FROM provider_profiles')
        ).rows;

        assert.equal(rows.length,1);
        assert.equal(rows[0].address,'Other address');
        assert.equal(rows[0].stripe_account_id,'acct_other');

        assert.ok(
          Object.keys(rows[0]).length > publicColumns.length
        );
      }
    );

    await t.test(
      'phase 2 providers claims orders admins keep full access while finance alone cannot',
      async()=>{
        for(const n of [4,6,7]){
          await role(pg,'authenticated',n);

          assert.equal(
            (
              await pg.query(
                'SELECT stripe_account_id,address FROM provider_profiles'
              )
            ).rows.length,
            2
          );
        }

        await role(pg,'authenticated',5);

        assert.equal(
          (await pg.query('SELECT * FROM provider_profiles')).rows.length,
          0
        );

        await role(pg,'service_role');

        assert.equal(
          (await pg.query('SELECT * FROM provider_profiles')).rows.length,
          2
        );
      }
    );

    await t.test(
      'reviews services and preferred-provider requests survive base-table lockdown',
      async()=>{
        await role(pg,'anon');

        assert.equal(
          (await pg.query('SELECT * FROM reviews')).rows.length,
          1
        );

        assert.equal(
          (await pg.query('SELECT * FROM provider_services')).rows.length,
          1
        );

        await role(pg,'authenticated',1);

        const values=[id(8),id(1),id(2)];

        await pg.query(
          "INSERT INTO service_requests(service_id,customer_id,preferred_provider_id,title,description,address_line1,city,state,zip_code) VALUES($1,$2,$3,'Repair','Test','Customer address','Las Vegas','NV','89101')",
          values
        );

        await assert.rejects(
          pg.query(
            "INSERT INTO service_requests(service_id,customer_id,preferred_provider_id,title,description,address_line1,city,state,zip_code) VALUES($1,$2,$3,'Repair','Test','Address','City','NV','89101')",
            [id(8),id(1),id(3)]
          ),
          /row-level security/
        );
      }
    );

    await t.test(
      'Stripe readiness is internal only and future permissive policies cannot reopen private rows',
      async()=>{
        for(const r of ['anon','authenticated']){
          await role(pg,r,1);

          await assert.rejects(
            pg.query(
              'SELECT relydo_provider_payments_ready($1)',
              [id(2)]
            ),
            /permission denied/
          );
        }

        await role(pg,'postgres');

        await pg.exec(
          'CREATE POLICY accidental_public_read ON provider_profiles FOR SELECT TO authenticated USING(true)'
        );

        await role(pg,'authenticated',1);

        assert.equal(
          (await pg.query('SELECT * FROM provider_profiles')).rows.length,
          0
        );
      }
    );

    await t.test(
      'new private columns stay excluded and definer-owned internal payment calls still work',
      async()=>{
        await role(pg,'postgres');

        await pg.exec(`
          ALTER TABLE provider_profiles
          ADD COLUMN future_private_field text DEFAULT 'secret';

          CREATE FUNCTION internal_hire_readiness(uuid)
          RETURNS boolean
          LANGUAGE sql
          SECURITY DEFINER
          SET search_path=''
          AS $$
            SELECT public.relydo_provider_payments_ready($1)
          $$;
        `);

        await role(pg,'authenticated',1);

        assert.equal(
          (
            await pg.query(
              'SELECT internal_hire_readiness($1) AS ready',
              [id(2)]
            )
          ).rows[0].ready,
          false
        );

        const row=(
          await pg.query('SELECT * FROM public_provider_profiles')
        ).rows[0];

        assert.ok(!('future_private_field' in row));
      }
    );

  }finally{
    await pg.close();
  }
});

test(
  'all existing public caller projections execute against the allowlist',
  async()=>{
    const pg=new PGlite();

    try{
      await pg.exec(
        read('tests/fixtures/provider-profile-privacy-schema.sql')
      );

      await pg.exec(
        read('supabase/migrations/202609300002_provider_profiles_public_allowlist.sql')
      );

      const files=[
        'app/profesionales/page.tsx',
        'app/profesionales/[id]/page.tsx',
        'app/solicitar-trabajo/page.tsx',
        'app/checkout/[id]/page.tsx',
        'app/mis-solicitudes/[id]/page.tsx'
      ];

      const mobile=path.resolve(root,'../relydo-mobile');

      for(const n of [
        'HomeScreen',
        'MessagesScreen',
        'ProviderProfileScreen',
        'RequestDetailScreen',
        'RequestsScreen'
      ]){
        files.push(
          path.join(
            mobile,
            `src/screens/${n}.tsx`
          )
        );
      }

      await role(pg,'anon');

      let queries=0;

      for(const file of files){
        const text=fs.readFileSync(
          path.isAbsolute(file)
            ? file
            : path.join(root,file),
          'utf8'
        );

        assert.ok(
          !text.includes('.from("provider_profiles")'),
          file
        );

        for(
          const m of text.matchAll(
            /\.from\("public_provider_profiles"\)\s*\.select\(\s*(["`])([\s\S]*?)\1\s*\)/g
          )
        ){
          await pg.query(
            `SELECT ${m[2]} FROM public_provider_profiles`
          );

          queries++;
        }
      }

      assert.equal(queries,11);

    }finally{
      await pg.close();
    }
  }
);