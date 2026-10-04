/* eslint-disable @typescript-eslint/no-require-imports -- Isolated regression harness. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function compile(source, scope = {}) {
  const testModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: testModule, exports: testModule.exports, ...scope });
  return testModule.exports;
}
const { hasProviderDocumentSession } = compile(fs.readFileSync(path.join(root, 'app/lib/providerDocumentSession.ts'), 'utf8'));
test('missing/invalid Supabase session never calls activation endpoint', async () => {
  for (const error of [null, new Error('expired')]) {
    assert.equal(await hasProviderDocumentSession({ auth: { getSession: async () => ({ data: { session: null }, error }) } }, () => assert.fail('network')), false);
  }
});
for (const status of [200, 401, 409, 500]) {
  test(`document preflight ${status}: validates bearer and never reclaims a replaced session`, async () => {
    const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic' } }, error: null }) } };
    const request = async (url, options) => {
      assert.equal(url, '/api/auth/provider/activate-session');
      assert.equal(options.method, 'GET');
      assert.equal(options.headers.Authorization, 'Bearer synthetic');
      assert.equal(options.cache, 'no-store');
      return Response.json({ active: status === 200 }, { status });
    };
    if (status === 500) await assert.rejects(hasProviderDocumentSession(client, request), /Could not verify/);
    else assert.equal(await hasProviderDocumentSession(client, request), status === 200);
  });
}
function loginFunction() {
  const source = fs.readFileSync(path.join(root, 'app/login-profesional/page.tsx'), 'utf8');
  const ast = ts.createSourceFile('login.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'handleLogin') found = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found);
  return found.getText(ast) + '\nexports.run = handleLogin;';
}
for (const documents of [[], [{ id: 'doc' }]]) {
  test(`pending provider login registers session before ${documents.length ? 'requested document screen' : 'verification redirect'}`, async () => {
    const events = [];
    const noop = () => {};
    const supabase = {
      auth: { signInWithPassword: async () => ({ data: { user: { id: 'pending-pro' } }, error: null }) },
      from(table) {
        if (table === 'provider_profiles' || table === 'provider_documents') assert.deepEqual(events, ['activate']);
        const data = table === 'profiles' ? { role: 'provider' } : table === 'provider_profiles'
          ? { active: false, verified: false, verification_status: 'pending' } : documents;
        const q = { select: () => q, eq: () => q, limit: async () => ({ data, error: null }), maybeSingle: async () => ({ data, error: null }) };
        return q;
      },
    };
    const { run } = compile(loginFunction(), {
      supabase, email: 'test@example.invalid', password: 'synthetic', text: {}, console,
      setError: (message) => { assert.equal(message, ''); }, setMensaje: noop, setCargando: noop,
      setNombreNegocio: noop, cargarSolicitudesDocumentos: async () => events.push('requests'),
      setEstadoCuenta: (state) => events.push(state), activarSesionProfesionalActual: async () => events.push('activate'),
      router: { replace: (url) => events.push(url) },
    });
    await run({ preventDefault: noop });
    assert.deepEqual(events, documents.length ? ['activate', 'requests', 'pending'] : ['activate', '/completar-verificacion']);
  });
}
