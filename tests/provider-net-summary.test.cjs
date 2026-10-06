/* eslint-disable @typescript-eslint/no-require-imports -- Offline VM harness. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsModule = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/lib/providerNetSummary.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText, { exports: exportsModule, Set, Number, Error });
const { providerNetSummary: sum, loadProviderChangeOrders: load } = exportsModule;
const base = { request_id: 'job1', job_amount: '100', provider_net_amount: '80.10', status: 'ready_for_payout' };
const order = (id, extra = {}) => ({ id, request_id: 'job1', original_amount: '100', created_at: '2026-10-06', payment_status: 'paid', additional_provider_net_amount: '20.20', released_at: null, stripe_transfer_id: null, ...extra });
test('base only preserves the persisted net', () => {
  assert.equal(sum(base, []).total, 80.1);
  assert.equal(sum(base, []).held, 80.1);
});
test('base plus one confirmed addition preserves separate amounts', () => {
  const result = sum(base, [order('co1')]);
  assert.equal(result.base, 80.1);
  assert.equal(result.additional, 20.2);
  assert.equal(result.total, 100.3);
});
test('multiple additions use cents and count each id once', () => {
  assert.equal(sum(base, [order('co1'), order('co2'), order('co1')]).total, 120.5);
});
test('unpaid, unconfirmed, refunded and other-job additions do not count', () => {
  const orders = ['unpaid', 'pending', 'refunded', null].map((payment_status, i) => order(String(i), { payment_status }));
  orders.push(order('other', { request_id: 'job2' }));
  assert.equal(sum(base, orders).total, 80.1);
});
test('addition release is independent of the base payout state', () => {
  const result = sum({ ...base, status: 'paid_out' }, [order('held'), order('released', { released_at: '2026-10-06' })]);
  assert.equal(result.held, 20.2);
  assert.equal(result.released, 100.3);
  assert.equal(result.total, 120.5);
});
test('null and non-finite net never substitute price or current fees', () => {
  assert.equal(sum(base, [order('null', { additional_provider_net_amount: null }), order('invalid', { additional_provider_net_amount: 'NaN' })]).total, 80.1);
});
test('loader scopes paid snapshots to provider and paginates', async () => {
  const calls = [];
  const db = { from(table) {
    assert.equal(table, 'change_orders');
    const query = { select(fields) { assert.ok(fields.includes('additional_provider_net_amount')); return query; },
      eq(key, value) { calls.push([key, value]); return query; }, order() { return query; },
      async range(start) { return { data: start === 0 ? Array.from({ length: 500 }, (_, i) => order(String(i))) : [order('last')], error: null }; } };
    return query;
  } };
  assert.equal((await load(db, 'pro1')).length, 501);
  assert.ok(calls.some(([key, value]) => key === 'provider_id' && value === 'pro1'));
  assert.ok(calls.some(([key, value]) => key === 'payment_status' && value === 'paid'));
});
test('loader fails visibly instead of showing a partial total', async () => {
  const query = { select: () => query, eq: () => query, order: () => query, range: async () => ({ data: null, error: { message: 'denied' } }) };
  await assert.rejects(load({ from: () => query }, 'pro1'), /denied/);
});

test('historical aggregated base fails instead of counting additions twice', () => {
  assert.throws(() => sum({ ...base, job_amount: 125 }, [order('co1')]), /conciliación/);
});
