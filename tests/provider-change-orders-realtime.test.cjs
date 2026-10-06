/* eslint-disable @typescript-eslint/no-require-imports -- Offline realtime harness. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
test('paid/confirmed additions refresh provider panel; existing listeners and cleanup remain', async () => {
  const calls = [];
  // Share mutable effect state with the callback through its VM context.
  const source = fs.readFileSync('app/panel-profesional/page.tsx','utf8');
  const start = source.indexOf('.channel("panel-profesional-service-requests")');
  const end = source.indexOf(';', source.indexOf('.subscribe(',start));
  const bindings=[];
  const channel={on(type,filter,callback){bindings.push({type,filter,callback});return this;},subscribe(){return this;}};
  const scope=vm.createContext({supabase:{channel:()=>channel},console,userId:'pro1',mounted:true,cargarPanel:async spinner => calls.push(spinner)});
  vm.runInContext(ts.transpileModule('supabase'+source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,scope);
  const orders=bindings.find(b=>b.filter.table==='change_orders');
  assert.equal(orders.type,'postgres_changes');
  assert.equal(orders.filter.event,'*');
  assert.equal(orders.filter.filter,'provider_id=eq.pro1');
  for(const patch of [{payment_status:'paid'},{additional_provider_net_amount:20.2},{released_at:'2026-10-06'}]) await orders.callback({eventType:'UPDATE',new:patch});
  assert.deepEqual(calls,[false,false,false]);
  scope.mounted=false;
  await orders.callback({eventType:'UPDATE',new:{payment_status:'paid'}});
  assert.equal(calls.length,3);
  assert.deepEqual(bindings.map(b=>b.filter.table),['change_orders','service_requests','payments','offers','job_claims','provider_documents','provider_document_requests','job_reassignment_history']);
  assert.match(source,/mounted = false;\s+supabase.removeChannel\(channel\)/);
});
