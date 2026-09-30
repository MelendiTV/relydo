/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('app/admin/trabajos/orderFinancialSummary.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const exportsObject = {};
vm.runInNewContext(code, { exports: exportsObject });
const summary = exportsObject.orderFinancialSummary;
const payment = { job_amount: 56, customer_total_amount: 58.8, customer_fee_amount: 2.8, provider_commission_amount: 5.6, provider_net_amount: 50.4, platform_revenue_amount: 8.4 };
const change = { id: 'co1', request_id: 'job', payment_status: 'paid', original_amount: 56, additional_amount: 23, created_at: '2026-09-01', additional_customer_total_amount: 24.15, additional_customer_fee_amount: 1.15, additional_provider_commission_amount: 2.3, additional_provider_net_amount: 20.7, additional_platform_revenue_amount: 3.45 };
test('real example, duplicate IDs, other requests and unpaid history', () => {
  const result = summary(payment, [change, change, { ...change, id: 'pending', payment_status: 'unpaid' }, { ...change, id: 'other', request_id: 'other' }], 'job');
  assert.equal(result.original, 56); assert.equal(result.changes, 23); assert.equal(result.serviceTotal, 79);
  assert.equal(result.originalCustomer, 58.8); assert.equal(result.additionalCustomer, 24.15); assert.equal(result.customerTotal, 82.95);
  assert.equal(result.commission, 7.9); assert.equal(result.net, 71.1); assert.equal(result.revenue, 11.85);
});
test('sum every paid change with decimal-safe arithmetic', () => {
  const result = summary(payment, [change, { ...change, id: 'co2', created_at: '2026-09-02', original_amount: 79 }], 'job');
  assert.equal(result.changes, 46); assert.equal(result.serviceTotal, 102); assert.equal(result.customerTotal, 107.1);
});
test('missing recorded amounts are unavailable, never assumed zero', () => {
  const result = summary(payment, [{ ...change, additional_provider_net_amount: null, additional_customer_total_amount: null, additional_customer_fee_amount: null }], 'job');
  assert.equal(result.net, null); assert.equal(result.customerTotal, null); assert.equal(result.additionalCustomer, null); assert.equal(result.serviceTotal, 79);
});
test('derive additional customer payment only from recorded amount and fee', () => {
  assert.equal(summary(payment, [{ ...change, additional_customer_total_amount: null }], 'job').customerTotal, 82.95);
});
test('already aggregated or ambiguous base is never summed again', () => {
  const result = summary({ ...payment, job_amount: 79, customer_total_amount: 82.95 }, [change], 'job');
  assert.equal(result.serviceTotal, 79); assert.equal(result.customerTotal, null); assert.equal(result.net, null); assert.equal(result.baseConfirmed, false);
});
test('no changes keeps original amounts', () => {
  const result = summary(payment, [], 'job'); assert.equal(result.changes, 0); assert.equal(result.customerTotal, 58.8);
});

const routeCode = ts.transpileModule(fs.readFileSync('app/api/admin/orders/change-orders/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function routeFixture({ role = 'admin', permission = true, valid = true, failed = false, many = false } = {}) {
  const reads = [];
  const db = { auth: { getUser: async () => ({ data: { user: valid ? { id: 'admin' } : null }, error: null }) }, from(table) {
    reads.push(table); const query = { select() { return query; }, eq(key, value) { if (table === 'change_orders') { assert.equal(key, 'request_id'); assert.equal(value, '00000000-0000-4000-8000-000000000001'); } return query; }, order() { return query; }, async maybeSingle() { return { data: table === 'profiles' ? { role, admin_role: 'super_admin' } : { id: '00000000-0000-4000-8000-000000000001' }, error: null }; }, async range(start) { return { data: many && start === 0 ? Array.from({ length: 500 }, (_, i) => ({ id: `co${i}` })) : [{ id: 'co1', status: 'accepted', payment_status: 'paid' }], error: failed ? new Error('DB failed') : null }; } }; return query;
  } };
  const exp = {};
  vm.runInNewContext(routeCode, { exports: exp, process: { env: {} }, require(name) {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, ...options }) } };
    if (name === '@supabase/supabase-js') return { createClient: () => db };
    if (name.includes('adminPermissions')) return { isAdminRole: () => true, hasAdminPermission: () => permission };
    throw Error(name);
  } });
  return { GET: exp.GET, reads };
}
const req = (token = 'Bearer valid', id = '00000000-0000-4000-8000-000000000001') => ({ headers: { get: () => token }, nextUrl: { searchParams: new URLSearchParams({ request_id: id }) } });
test('route denies unauthenticated, expired, non-admin and missing orders permission before reading jobs', async () => {
  for (const [options, token, status] of [[{}, null, 401], [{ valid: false }, 'Bearer valid', 401], [{ role: 'customer' }, 'Bearer valid', 403], [{ permission: false }, 'Bearer valid', 403]]) {
    const f = routeFixture(options); assert.equal((await f.GET(req(token))).status, status); assert.ok(!f.reads.includes('change_orders')); assert.ok(!f.reads.includes('service_requests'));
  }
});
test('route requires internal UUID, returns paginated history and explicit failures', async () => {
  const invalid = routeFixture(); assert.equal((await invalid.GET(req('Bearer valid', '#PUBLIC'))).status, 400);
  const f = routeFixture({ many: true }); const result = await f.GET(req()); assert.equal(result.status, 200); assert.equal(result.body.changeOrders.length, 500); assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal((await routeFixture({ failed: true }).GET(req())).status, 500);
});
