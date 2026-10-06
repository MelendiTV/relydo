/* eslint-disable @typescript-eslint/no-require-imports -- Local PostgreSQL test harness. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/202610060001_base_payment_offer_unique.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(__dirname, '../supabase/rollback/202610060001_base_payment_offer_unique.sql'), 'utf8');
const request = '00000000-0000-4000-8000-000000000001';
const offer = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
async function fixture(t) {
  const pg = new PGlite();
  t.after(() => pg.close());
  // Minimal synthetic prerequisite schema: repository has no payments baseline dump.
  await pg.exec(`create table public.payments (
    id uuid primary key default gen_random_uuid(), request_id uuid,
    offer_id uuid, provider_payment_id text, status text);
    create table public.change_orders (id uuid primary key default gen_random_uuid(), request_id uuid, status text);`);
  return pg;
}
function insert(pg, o = offer, pi = 'pi_first', status = 'ready_for_payout') {
  return pg.query('insert into public.payments(request_id,offer_id,provider_payment_id,status) values($1,$2,$3,$4)', [request, o, pi, status]);
}
test('BASE SQL: index rejects same/different PaymentIntent and every payment status', async t => {
  const pg = await fixture(t);
  await pg.exec(migration);
  await insert(pg);
  for (const status of ['ready_for_payout', 'paid_out', 'refunded', 'cancelled']) {
    for (const pi of ['pi_first', 'pi_second', null]) {
      await assert.rejects(insert(pg, offer, pi, status), e => e.code === '23505' && e.message.includes('payments_base_offer_unique'));
    }
  }
  await assert.rejects(pg.query('insert into public.payments(request_id,offer_id) values($1,$2)', [other, offer]), e => e.code === '23505');
  assert.equal((await pg.query('select count(*)::int as n from public.payments')).rows[0].n, 1);
});
test('BASE SQL: existing data, reassignment offers, NULL legacy rows and multiple Change Orders survive', async t => {
  const pg = await fixture(t);
  await insert(pg); await insert(pg, other, null); await insert(pg, null); await insert(pg, null);
  await pg.query('insert into public.change_orders(request_id,status) values($1,$2),($1,$2)', [request, 'paid']);
  const before = await pg.query('select * from public.payments order by id');
  const coBefore = await pg.query('select * from public.change_orders order by id');
  await pg.exec(migration);
  assert.deepEqual((await pg.query('select * from public.payments order by id')).rows, before.rows);
  assert.deepEqual((await pg.query('select * from public.change_orders order by id')).rows, coBefore.rows);
  await assert.rejects(pg.query('update public.payments set offer_id=$1 where offer_id=$2', [offer, other]), e => e.code === '23505');
});
test('BASE SQL: historical duplicates abort migration without deleting data or leaving an index', async t => {
  const pg = await fixture(t);
  await insert(pg); await insert(pg, offer, 'pi_second', 'refunded');
  await assert.rejects(pg.exec(migration), /BASE_PAYMENT_DUPLICATE_OFFERS/);
  await pg.exec('rollback');
  assert.equal((await pg.query('select count(*)::int as n from public.payments')).rows[0].n, 2);
  assert.equal((await pg.query("select to_regclass('public.payments_base_offer_unique') as idx")).rows[0].idx, null);
});
test('BASE SQL: queued competing inserts have exactly one winner (single connection, not multi-session)', async t => {
  const pg = await fixture(t);
  await pg.exec(migration);
  const results = await Promise.allSettled(Array.from({length: 20}, (_, i) => insert(pg, offer, `pi_${i}`)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const rejected = results.filter(r => r.status === 'rejected');
  assert.equal(rejected.length, 19);
  for (const result of rejected) assert.equal(result.reason.code, '23505');
  assert.equal((await pg.query('select count(*)::int as n from public.payments')).rows[0].n, 1);
});
test('BASE SQL: rollback preserves rows and unrelated constraints; migration can be reapplied', async t => {
  const pg = await fixture(t);
  await pg.exec('create unique index existing_payment_intent_unique on public.payments(provider_payment_id)');
  await insert(pg);
  await pg.exec(migration);
  await pg.exec(rollback);
  assert.equal((await pg.query('select count(*)::int as n from public.payments')).rows[0].n, 1);
  assert.notEqual((await pg.query("select to_regclass('public.existing_payment_intent_unique') as idx")).rows[0].idx, null);
  await pg.exec(migration);
  await assert.rejects(insert(pg, offer, 'pi_second'), e => e.code === '23505');
  await pg.exec(rollback);
  await insert(pg, offer, 'pi_second');
});
