/* eslint-disable @typescript-eslint/no-require-imports -- Local Node test harness; evaluates payloads without external services. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Evaluate the actual payload expressions from both production branches.
// This is a payload contract test, not an end-to-end POST/Stripe integration test.
const filename = path.join(__dirname, '../app/api/admin/claims/resolve/route.ts');
const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
const updates = [], notifications = [];
function visit(node) {
  if (ts.isCallExpression(node)) {
    if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'update' &&
        ts.isCallExpression(node.expression.expression) &&
        node.expression.expression.arguments[0]?.text === 'job_claims') updates.push(node.arguments[0]);
    if (ts.isIdentifier(node.expression) && node.expression.text === 'sendRelydoNotification') notifications.push(node.arguments[0]);
  }
  ts.forEachChild(node, visit);
}
visit(source);
const partials = updates.filter(node => node.properties.some(p => p.name?.getText(source) === 'resolution_type' && p.initializer?.text === 'partial'));
const evaluate = (node, context) => JSON.parse(JSON.stringify(vm.runInNewContext(`(${node.getText(source)})`, context)));

test('both partial resolution producers and notification calls remain covered', () => {
  assert.equal(partials.length, 2);
  assert.equal(updates.length, 6);
  assert.equal(notifications.length, 10);
});

for (const [branch, node] of partials.entries()) {
  for (const [providerAwardAmount, customerRefundAmount] of [[12.34, 56.78], [0, 40], [30, 0], [0.01, 0.02]]) {
    test(`partial producer ${branch + 1}: Unicode and unchanged payload at ${providerAwardAmount}/${customerRefundAmount}`, () => {
      const notes = 'Nota original: áéíóú — [RESOLUCI\u00c3\u201cN PARCIAL]\nNo transformar texto del administrador.';
      const timestamp = '2026-09-24T12:00:00.000Z';
      class FixedDate extends Date { constructor() { super(timestamp); } }
      const payload = evaluate(node, { providerAwardAmount, customerRefundAmount, notes, user: { id: 'admin-test' }, Date: FixedDate });
      assert.deepEqual(payload, {
        status: 'resolved', resolution_type: 'partial',
        provider_award_amount: providerAwardAmount, customer_refund_amount: customerRefundAmount,
        resolution_notes: `[RESOLUCIÓN PARCIAL]\nProfesional: $${providerAwardAmount.toFixed(2)}\nCliente: $${customerRefundAmount.toFixed(2)}\n${notes}`,
        resolved_at: timestamp, resolved_by: 'admin-test', updated_at: timestamp,
      });
    });
  }
}

for (const [index, node] of notifications.entries()) {
  for (const finalReview of [false, true]) {
    test(`notification ${index + 1}: Unicode with final review ${finalReview}`, () => {
      const payload = evaluate(node, {
        claim: { customer_id: 'customer-test', provider_id: 'provider-test', request_id: 'job-test' },
        serviceRequest: { title: 'Trabajo de prueba' }, trabajoEnRevisionFinal: finalReview,
        providerAwardAmount: 12.34, customerRefundAmount: 56.78, totalProviderNet: 75, totalRefunded: 60,
      });
      assert.doesNotMatch(payload.message, /[\u00c3\u00c2\ufffd]|\u00e2\u20ac/);
      assert.equal(payload.type, 'claim_resolved');
      assert.equal(payload.requestId, 'job-test');
      assert.ok(['customer-test', 'provider-test'].includes(payload.userId));
      assert.ok(payload.message.endsWith('Trabajo de prueba.'));
      if (payload.message.includes('Reembolso para ti:')) assert.ok(payload.message.includes('$56.78'));
      if (payload.message.includes('Compensación para ti:')) assert.ok(payload.message.includes('$12.34'));
    });
  }
}
