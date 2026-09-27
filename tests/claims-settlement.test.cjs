/* eslint-disable @typescript-eslint/no-require-imports -- Isolated route/guard tests, no external services. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleMock = { exports: {} };
vm.runInNewContext(compile(read('app/lib/jobFinancialGuard.ts')), {
  module: moduleMock, exports: moduleMock.exports,
  require: name => { throw Error('Unexpected dependency: ' + name); }, Date,
});
const guard = moduleMock.exports;
const route = read('app/api/admin/claims/resolve/route.ts');

for (const response of [
  { error: { message: 'missing RPC' }, data: null },
  { data: null }, { data: {} },
  { data: { settled: false, state: 'reconciliation_required' } },
  { data: { settled: 'true' } },
  { data: { settled: true }, error: { message: 'database failure' } },
]) test('settlement fails closed for ' + JSON.stringify(response), async () => {
  await assert.rejects(guard.settleJobResolution({ rpc: async () => response }, 'job1', 'claim:claim1'),
    e => e instanceof guard.FinancialGuardError && e.status === 409);
});

test('settlement forwards the exact owner and request and accepts repeated confirmation', async () => {
  const calls = [];
  const db = { rpc: async (name, args) => {
    calls.push([name, args.p_request_id, args.p_owner]);
    return { data: { settled: true, state: 'settled' } };
  } };
  for (let i = 0; i < 2; i++) assert.equal((await guard.settleJobResolution(db, 'job1', 'claim:claim1')).settled, true);
  assert.deepEqual(calls, Array(2).fill(['settle_job_financial_resolution', 'job1', 'claim:claim1']));
});

// Execute the actual closure through notifications and the success response.
// The only injected dependencies are local mocks; Stripe is intentionally absent.
function fixture(kind, { working = false, finalReview = false } = {}) {
  const markers = {
    pay_provider: ['      const transferId = transferIds[0]', '    // 7B.'],
    refund_customer: ['      const refundRecordedAt =', '    // 7C.'],
    partial: ['      const baseRefundedCents =', '  } catch (error) {'],
    continue_work: ['        const reserva = await reservarDecisionEconomica(', '      // REVISI'],
  };
  const [startMarker, endMarker] = markers[kind];
  const start = route.indexOf(startMarker);
  const end = route.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start);
  // Remove the enclosing branch's closing brace and trailing section comments.
  let fragment = route.slice(start, end);
  fragment = fragment.slice(0, fragment.lastIndexOf('}'));
  const state = { calls: [], fail: null, settled: false };
  const error = name => state.fail === name ? { message: 'simulated failure' } : null;
  const db = {
    rpc: async (name, args) => {
      assert.equal(args.p_request_id, 'job1');
      assert.equal(args.p_owner, 'claim:claim1');
      state.calls.push(name);
      if (name === 'settle_job_financial_resolution') {
        if (state.fail === 'settle') return { data: { settled: false, state: 'reconciliation_required' } };
        state.settled = true;
        return { data: { settled: true, state: 'settled' } };
      }
      assert.equal(name, 'apply_job_financial_update');
      return { data: {}, error: error('service_requests') };
    },
    from: table => ({ update: () => ({ eq: async () => {
      state.calls.push(table); return { error: error(table) };
    } }) }),
  };
  const context = {
    supabaseAdmin: db, ...guard, Date,
    claim: { id: 'claim1', request_id: 'job1' }, claimId: 'claim1', user: { id: 'admin' }, notes: 'test',
    payment: { id: 'base' }, serviceRequest: {}, trabajoIniciado: working, trabajoEnRevisionFinal: finalReview,
    transferIds: ['tr_base'], activeTransfers: [], totalProviderNet: 80, totalRefunded: 100,
    baseRefundedTotal: 100, jobAmount: 100, totalJobAmount: 100, totalCustomerFee: 10,
    stripeRefundIds: ['re_base'], reconciliandoResolucion: false,
    sourcePlan: [{ basePayment: true, refundCents: 4000 }], partialTransferIds: ['tr_partial'], partialRefundIds: ['re_partial'],
    providerAwardAmount: 40, customerRefundAmount: 40, firstRefundStatus: 'succeeded',
    existingPartialRefundCents: 4000, expectedRefundCents: 4000, existingPartialTransferCents: 4000, expectedProviderCents: 4000,
    dinero: n => Math.round(n * 100) / 100,
    reservarDecisionEconomica: async () => ({ ok: true }),
    sendRelydoNotification: async () => { state.calls.push('notification'); },
    NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) },
  };
  vm.createContext(context);
  vm.runInContext(compile(`async function run() { ${fragment} }`), context);
  return { state, run: () => context.run() };
}

for (const [kind, options, writes] of [
  ['pay_provider', {}, ['payments', 'job_claims']],
  ['pay_provider', { finalReview: true }, ['payments', 'apply_job_financial_update', 'job_claims']],
  ['refund_customer', {}, ['payments', 'apply_job_financial_update', 'job_claims']],
  ['partial', {}, ['payments', 'job_claims']],
  ['partial', { finalReview: true }, ['payments', 'apply_job_financial_update', 'job_claims']],
  ['partial', { working: true }, ['payments', 'job_claims', 'apply_job_financial_update']],
]) {
  const label = kind + ' ' + JSON.stringify(options);
  test(label + ': settle after all writes, before notifications, including retries', async () => {
    const f = fixture(kind, options);
    for (let i = 0; i < 2; i++) {
      f.state.calls.length = 0;
      assert.equal((await f.run()).body.success, true);
      assert.deepEqual(f.state.calls, [...writes, 'settle_job_financial_resolution', 'notification', 'notification']);
      assert.equal(f.state.settled, true);
    }
  });
  test(label + ': unconfirmed settlement prevents success and notifications; retry recovers', async () => {
    const f = fixture(kind, options); f.state.fail = 'settle';
    await assert.rejects(f.run(), e => e.status === 409);
    assert.deepEqual(f.state.calls, [...writes, 'settle_job_financial_resolution']);
    f.state.fail = null;
    assert.equal((await f.run()).body.success, true);
  });
  for (const write of writes) test(label + ': failed ' + write + ' never reaches explicit settlement', async () => {
    const f = fixture(kind, options);
    f.state.fail = write === 'apply_job_financial_update' ? 'service_requests' : write;
    assert.equal((await f.run()).status, 500);
    assert.ok(!f.state.calls.includes('settle_job_financial_resolution'));
    assert.ok(!f.state.calls.includes('notification'));
  });
}

test('continue_work closes without settlement, including a repeat', async () => {
  const f = fixture('continue_work', { working: true });
  for (let i = 0; i < 2; i++) {
    const result = await f.run();
    assert.equal(result.body.success, true);
    assert.equal(result.body.paymentReleased, false);
    assert.equal(result.body.workUnlocked, true);
  }
  assert.ok(!f.state.calls.includes('settle_job_financial_resolution'));
});
