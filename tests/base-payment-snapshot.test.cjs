/* eslint-disable @typescript-eslint/no-require-imports -- Offline VM harness. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, requireMock = () => { throw Error('Unexpected dependency'); }) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, { exports, require: requireMock, process: { env: {} }, console });
  return exports;
}
const { validateBasePaymentSnapshot: validate } = load('app/lib/basePaymentSnapshot.ts');
// Execute the actual Checkout amount expressions to freeze the original rates.
function freeze(price = 100, feePercent = 10, commissionPercent = 20) {
  const source = fs.readFileSync('app/api/checkout/route.ts', 'utf8');
  const start = source.indexOf('    const customerFeeAmount = money(');
  const end = source.indexOf('    const currency = String(', start);
  const context = { professionalPrice: price, customerFeePercent: feePercent,
    providerCommissionPercent: commissionPercent, money: n => Math.round((n + Number.EPSILON) * 100) / 100 };
  vm.runInNewContext(source.slice(start, end) + '\nObject.assign(this, {customerFeeAmount,customerTotalAmount,providerCommissionAmount,providerNetAmount,platformRevenueAmount});', context);
  return { payment_type: 'initial_job', request_id: 'job1', offer_id: 'offer1', customer_id: 'customer1', professional_id: 'pro1',
    professional_price: price.toFixed(2), customer_fee_percent: feePercent.toFixed(2), provider_commission_percent: commissionPercent.toFixed(2),
    customer_fee_amount: context.customerFeeAmount.toFixed(2), customer_total: context.customerTotalAmount.toFixed(2),
    provider_commission_amount: context.providerCommissionAmount.toFixed(2), provider_net_amount: context.providerNetAmount.toFixed(2),
    platform_revenue_amount: context.platformRevenueAmount.toFixed(2), currency: 'USD' };
}
function fixture(metadata, mobile = false) {
  const state = { writes: [], reads: [], rates: { fee: 10, commission: 20 } };
  const intent = { id: 'pi1', metadata, status: 'succeeded', amount: 11000, amount_received: 11000, customer: 'cus1', currency: 'usd' };
  const session = { id: 'cs1', metadata, payment_status: 'paid', payment_intent: intent, customer: 'cus1', amount_total: 11000, currency: 'usd' };
  const db = { from(table) {
    state.reads.push(table);
    if (table === 'payment_settings') throw Error('Current rates must never be read');
    let mutation = false;
    const q = { select: () => q, eq: () => q, in: () => q, is: () => q, neq: () => q, limit: () => q, or: () => q,
      update(data) { mutation = true; state.writes.push({ table, data }); return q; },
      insert(data) { mutation = true; state.writes.push({ table, data }); return q; },
      maybeSingle: async () => ({ error: null, data: mutation ? { id: 'job1' } : table === 'offers' ? { id: 'offer1', professional_id: 'pro1', price: 100, status: 'pending' } : table === 'service_requests' ? { id: 'job1', customer_id: 'customer1', status: 'open', preferred_provider_id: null } : null }),
      then(resolve) { return Promise.resolve({ error: null }).then(resolve); } };
    return q;
  } };
  class Stripe { constructor() { this.checkout = { sessions: { retrieve: async () => session } }; this.paymentIntents = { retrieve: async () => intent }; } }
  const route = load('app/api/checkout/verify-payment/route.ts', name => {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
    if (name === 'stripe') return { default: Stripe };
    if (name === '@supabase/supabase-js') return { createClient: () => db };
    if (name.endsWith('basePaymentSnapshot')) return { validateBasePaymentSnapshot: validate };
    if (name.endsWith('serverAuth')) return { getAuthenticatedUser: async () => ({ user: { id: 'customer1' } }) };
    if (name.endsWith('serverNotifications')) return { sendRelydoNotification: async () => {} };
    if (name.endsWith('jobFinancialGuard')) return { assertReassignmentSafe: async () => {} };
    throw Error(name);
  });
  return { state, session, intent, confirm: () => route.POST({ headers: { get: () => null }, json: async () => mobile ? { paymentIntentId: 'pi1' } : { sessionId: 'cs1' } }) };
}
const keys = ['professional_price','customer_fee_percent','customer_fee_amount','customer_total','provider_commission_percent','provider_commission_amount','provider_net_amount','platform_revenue_amount'];
for (const key of keys) for (const value of [undefined, '', ' ', 'NaN', 'Infinity', '-0.01']) {
  test(`base rejects ${key}=${String(value)} before writes`, async () => {
    const metadata = { ...freeze(), [key]: value };
    const f = fixture(metadata);
    assert.equal((await f.confirm()).status, 400);
    assert.equal(f.state.writes.length, 0);
  });
}
for (const key of keys) test(`base rejects incoherent ${key}`, () => {
  const metadata = freeze(); metadata[key] = (Number(metadata[key]) + 1).toFixed(2);
  assert.throws(() => validate(metadata, 11000));
});
for (const commission of ['100.01', '101', '-1']) test(`base rejects commission ${commission}`, async () => {
  const f = fixture({ ...freeze(), provider_commission_percent: commission }, true);
  assert.equal((await f.confirm()).status, 400); assert.equal(f.state.writes.length, 0);
});
for (const mobile of [false, true]) test(`original Checkout rates survive changed settings (${mobile ? 'mobile' : 'web'})`, async () => {
  const f = fixture(freeze(), mobile);
  f.state.rates = { fee: 35, commission: 60 };
  const result = await f.confirm();
  assert.equal(result.status, 200);
  const payment = f.state.writes.find(w => w.table === 'payments').data;
  assert.equal(payment.customer_fee_percent, 10); assert.equal(payment.provider_commission_percent, 20);
  assert.equal(payment.customer_total_amount, 110); assert.equal(payment.provider_net_amount, 80);
  assert.equal(payment.platform_revenue_amount, 30); assert.ok(!f.state.reads.includes('payment_settings'));
});
test('zero rates and 100% commission are valid coherent boundaries', () => {
  assert.equal(validate(freeze(100, 0, 0), 10000).providerNetAmount, 100);
  assert.equal(validate(freeze(100, 0, 100), 10000).providerNetAmount, 0);
});
test('same Checkout rounding at fractional cent boundary', () => {
  assert.equal(validate(freeze(1, 0, 14.5), 100).providerCommissionAmount, 0.15);
});
for (const charged of [null, NaN, Infinity, 11001, 11000.1]) test(`invalid Stripe amount ${charged}`, () => assert.throws(() => validate(freeze(), charged)));
test('sub-cent snapshot and legacy fee fallback cannot hide invalid data', () => {
  assert.throws(() => validate({ ...freeze(), customer_fee_amount: '10.001' }, 11000));
  assert.throws(() => validate({ ...freeze(), customer_fee_amount: '', service_fee: '10.00' }, 11000));
});
test('commission over 100% is rejected even when rounding leaves a nonnegative coherent net', () => {
  const metadata = freeze(0.01, 0, 100.01);
  assert.equal(metadata.provider_net_amount, '0.00');
  assert.throws(() => validate(metadata, 1));
});
test('missing entire financial metadata fails closed', () => assert.throws(() => validate(null, 11000)));
