/* eslint-disable @typescript-eslint/no-require-imports -- Local route/guard mocks only. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.join(__dirname, '..');
const moduleMock = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'app/lib/jobFinancialGuard.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: moduleMock, exports: moduleMock.exports, Date });
const guard = moduleMock.exports;
const route = fs.readFileSync(path.join(root, 'app/api/admin/claims/resolve/route.ts'), 'utf8');
// Execute the actual full-refund source planning, reconciliation and all three
// closure writes. No production imports, environment files or external services.
const start = route.indexOf('      const refundSources:');
const fragment = route.slice(start, route.indexOf('      try {', start));
const code = ts.transpileModule(`async function run() { ${fragment} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture() {
  const state = { refunds: [], steps: new Map(), creates: [], writes: [], status: 'succeeded' };
  const stripe = {
    paymentIntents: { retrieve: async id => ({ latest_charge: id.replace('pi_', 'ch_') }) },
    refunds: {
      list: async ({ charge }) => ({ data: state.refunds.filter(r => r.charge === charge), has_more: !!state.hasMore }),
      create: async params => {
        state.creates.push(structuredClone(params));
        if (state.failCreate) throw Error('Stripe unavailable');
        const refund = { ...structuredClone(params), id: `re_${state.creates.length}`, charge: params.payment_intent.replace('pi_', 'ch_'), currency: 'usd', status: state.status };
        state.refunds.push(refund); return refund;
      },
    },
  };
  const db = {
    rpc: async (name, args) => {
      const fail = () => ({ error: { message: 'conflict' } });
      if (state.owner && state.owner !== args.p_owner) return fail();
      if (name === 'reserve_job_financial_resolution') {
        state.owner = args.p_owner;
        return { data: { pending_steps: [...state.steps.values()].filter(s => !s.receipt).map(s => ({ kind: 'refund', params: s.params })) } };
      }
      if (name === 'reserve_job_financial_step') {
        assert.equal(state.owner, args.p_owner);
        let step = state.steps.get(args.p_charge_id);
        if (step && JSON.stringify(step.params) !== JSON.stringify(args.p_params)) return fail();
        if (!step) { step = { id: `step_${args.p_charge_id}`, params: structuredClone(args.p_params), created_at: new Date().toISOString() }; state.steps.set(args.p_charge_id, step); }
        return { data: structuredClone(step) };
      }
      if (name === 'record_job_financial_step') {
        if (state.failSave) return fail();
        const step = [...state.steps.values()].find(s => s.id === args.p_step_id);
        assert.equal(args.p_receipt.status, 'succeeded');
        step.receipt = structuredClone(args.p_receipt); return { data: { recorded: true } };
      }
      assert.equal(name, 'apply_job_financial_update');
      assert.ok([...state.steps.values()].every(s => s.receipt));
      state.writes.push(['service_requests', args.p_patch]); return { data: {}, error: null };
    },
    from: table => ({ update: payload => ({ eq: async () => { state.writes.push([table, payload]); return { error: null }; } }) }),
  };
  const context = {
    stripe, supabaseAdmin: db, settlement: guard.financialStripe(stripe, db, 'claim:claim1'),
    applyFinancialJobUpdate: guard.applyFinancialJobUpdate,
    esPagoReasignado: false, reassignmentSources: [], changeOrders: [], jobAmount: 100, totalCustomerFee: 10,
    payment: { id: 'base', provider_payment_id: 'pi_base', refunded_amount: 0 },
    claim: { id: 'claim1', request_id: 'job1', status: 'reviewing' }, claimId: 'claim1', user: { id: 'admin' }, notes: 'test',
    NextResponse: { json: (body, options) => ({ body, ...options }) }, dinero: n => Math.round(n * 100) / 100,
  };
  vm.createContext(context); vm.runInContext(code, context);
  return { state, stripe, context, run: async () => {
    await guard.reserveJobResolution(db, 'job1', 'claim:claim1', { action: 'refund_customer' }, stripe);
    return context.run();
  } };
}
function historical(status) {
  return { id: 'historical', charge: 'ch_base', amount: 10000, currency: 'usd', status,
    metadata: { request_id: 'job1', claim_id: 'claim1', resolution: 'refund_customer', protected_customer_fee: '10.00', payment_id: 'base' } };
}
for (const status of ['succeeded', 'pending', 'in_progress', 'requires_action', null, 'failed', 'canceled']) {
  test(`historical ${status} without durable identity requires reconciliation and never closes or duplicates`, async () => {
    const f = fixture(); f.state.refunds.push(historical(status));
    for (let i = 0; i < 2; i++) await assert.rejects(f.run(), e => e.status === 409);
    assert.equal(f.state.creates.length, 0); assert.equal(f.state.writes.length, 0);
    assert.equal(f.state.steps.size, 1); assert.equal([...f.state.steps.values()][0].receipt, undefined);
  });
}
test('DB refunded_amount alone cannot close; guard still requires full Stripe evidence', async () => {
  const f = fixture(); f.context.payment.refunded_amount = 100; f.state.failCreate = true;
  await assert.rejects(f.run(), /Stripe unavailable/);
  assert.equal(f.state.creates[0].amount, 10000); assert.equal(f.state.writes.length, 0);
});
test('guard-created pending refund blocks retry until succeeded and receipt is saved; never duplicates', async () => {
  const f = fixture(); f.state.status = 'pending';
  await assert.rejects(f.run(), e => e.status === 409);
  await assert.rejects(f.run(), e => e.status === 409);
  assert.equal(f.state.creates.length, 1); assert.equal(f.state.writes.length, 0);
  f.state.refunds[0].status = 'succeeded'; f.state.failSave = true;
  await assert.rejects(f.run(), e => e.status === 409); assert.equal(f.state.writes.length, 0);
  f.state.failSave = false; await f.run(); await f.run();
  assert.equal(f.state.creates.length, 1);
  assert.equal(f.state.writes.length, 6);
  assert.equal(f.state.writes[2][1].status, 'resolved');
  assert.equal(f.state.writes[2][1].customer_refund_amount, 100);
});
for (const defect of ['charge', 'metadata', 'amount', 'failed', 'canceled', 'pagination', 'duplicate']) {
  test(`guard recovery rejects ${defect} before any closure`, async () => {
    const f = fixture(); f.state.failSave = true; await assert.rejects(f.run()); f.state.failSave = false;
    const refund = f.state.refunds[0];
    if (defect === 'charge') { refund.charge = 'wrong'; f.stripe.refunds.list = async () => ({ data: [refund], has_more: false }); }
    if (defect === 'metadata') refund.metadata.claim_id = 'other';
    if (defect === 'amount') refund.amount = 9999;
    if (['failed', 'canceled'].includes(defect)) refund.status = defect;
    if (defect === 'pagination') f.state.hasMore = true;
    if (defect === 'duplicate') f.state.refunds.push({ ...refund, id: 'duplicate' });
    await assert.rejects(f.run(), e => e.status === 409);
    assert.equal(f.state.creates.length, 1); assert.equal(f.state.writes.length, 0);
  });
}
test('later historical CO refund blocks before creating a base refund', async () => {
  const f = fixture(); f.context.changeOrders = [{ id: 'co1', stripe_payment_intent_id: 'pi_co', additional_amount: 50 }];
  f.state.refunds.push({ ...historical('pending'), charge: 'ch_co', amount: 5000 });
  await assert.rejects(f.run(), e => e.status === 409);
  assert.equal(f.state.creates.length, 0); assert.equal(f.state.writes.length, 0);
});
test('owner exclusion remains enforced', async () => {
  const f = fixture(); f.state.owner = 'automatic_release';
  await assert.rejects(f.run(), e => e.status === 409);
  assert.equal(f.state.steps.size, 0); assert.equal(f.state.writes.length, 0);
});
