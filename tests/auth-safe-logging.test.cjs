/* eslint-disable @typescript-eslint/no-require-imports -- Offline CommonJS test harness with isolated VM dependencies. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const routes = [
  ['app/api/stripe/connect/status/route.ts', 'GET', 'RELYDO Stripe status auth', 'No pudimos verificar tu sesión en este momento. Inténtalo nuevamente.', 'Tu sesión no es válida o expiró.'],
  ['app/api/auth/provider/activate-session/route.ts', 'GET', 'RELYDO provider auth check', 'Could not verify the authentication session.', 'The session is no longer valid.'],
  ['app/api/auth/provider/activate-session/route.ts', 'POST', 'RELYDO provider auth check', 'Could not verify the authentication session.', 'The session is no longer valid.'],
];
const secret = 'SYNTHETIC_SECRET_DO_NOT_LOG';
function sensitiveError(status) {
  return Object.assign(new Error(`Bearer ${secret}; https://example.invalid/?token=${secret}`), {
    status, statusCode: status, token: secret,
    headers: { authorization: `Bearer ${secret}`, cookie: `session=${secret}` },
    credentials: { password: secret }, payload: { access_token: secret },
  });
}
function fixture(file, outcomes) {
  const state = { calls: 0, profiles: 0, delays: [], warn: [], error: [] };
  const db = {
    auth: { async getUser(token) {
      assert.equal(token, secret);
      const outcome = outcomes[Math.min(state.calls++, outcomes.length - 1)];
      return { data: { user: outcome.user || null }, error: outcome.error || null };
    } },
    from(table) {
      assert.equal(table, 'profiles');
      state.profiles++;
      const query = {
        select() { return query; }, eq() { return query; },
        async maybeSingle() { return { data: { id: 'user', role: 'customer' }, error: null }; },
      };
      return query;
    },
  };
  const filename = path.resolve(__dirname, '..', file);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(source, {
    module: testModule, exports: testModule.exports,
    require(name) {
      if (name === '@supabase/supabase-js') return { createClient: () => db };
      if (name === 'next/server') return { NextResponse: { json: (body, options) => Response.json(body, options) } };
      if (name === 'stripe') return function Stripe() {
        return { accounts: { retrieve() { assert.fail('Stripe must not be called'); } } };
      };
      throw Error(`Unmocked dependency: ${name}`);
    },
    process: { env: {} },
    console: { warn: (...args) => state.warn.push(args), error: (...args) => state.error.push(args) },
    setTimeout(callback, delay) { state.delays.push(delay); callback(); },
    Buffer,
  }, { filename });
  return {
    state,
    run: (method, token = secret) => testModule.exports[method]({ headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}) }),
  };
}
function assertSafe(state, body) {
  for (const args of [...state.warn, ...state.error]) {
    assert.equal(args.length, 1, 'Logs must contain only the generic operational message');
    assert.equal(typeof args[0], 'string');
    assert.ok(!args[0].includes(secret));
  }
  assert.ok(!JSON.stringify(body).includes(secret));
}
for (const [file, method, flow, failureMessage, invalidMessage] of routes) {
  for (const status of [503, `503 ${secret}`, 987654321]) {
    test(`${file} ${method}: sensitive auth failure with status ${typeof status}/${status === 503 ? 'HTTP' : 'untrusted'}`, async () => {
      const f = fixture(file, [{ error: sensitiveError(status) }]);
      const response = await f.run(method);
      const body = await response.json();
      assert.equal(response.status, 500);
      assert.deepEqual(body, { error: failureMessage });
      assert.equal(f.state.calls, 3);
      assert.equal(f.state.profiles, 0);
      assert.deepEqual(f.state.delays, [250, 600]);
      assert.deepEqual(f.state.warn, [1, 2, 3].map(n => [`${flow} temporary failure (${n}/3):`]));
      assert.deepEqual(f.state.error, [[`${flow} failed after retries:`]]);
      assertSafe(f.state, body);
    });
  }
  test(`${file} ${method}: 401 stays immediate and does not expose its message`, async () => {
    const f = fixture(file, [{ error: sensitiveError(401) }]);
    const response = await f.run(method);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.deepEqual(body, { error: invalidMessage });
    assert.equal(f.state.calls, 1);
    assert.equal(f.state.profiles, 0);
    assert.deepEqual(f.state.delays, []);
    assert.deepEqual(f.state.error, []);
    assert.deepEqual(f.state.warn, file.includes('activate-session') ? [['RELYDO provider auth session invalid:']] : []);
    assertSafe(f.state, body);
  });
  test(`${file} ${method}: retry recovery continues to the unchanged role check`, async () => {
    const f = fixture(file, [{ error: sensitiveError(503) }, { user: { id: 'user' } }]);
    const response = await f.run(method);
    assert.equal(response.status, 403);
    assert.equal(f.state.calls, 2);
    assert.equal(f.state.profiles, 1);
    assert.deepEqual(f.state.delays, [250]);
    assert.deepEqual(f.state.warn, [[`${flow} temporary failure (1/3):`]]);
    assert.deepEqual(f.state.error, []);
    assertSafe(f.state, await response.json());
  });
  test(`${file} ${method}: missing user stays 401 without retry`, async () => {
    const f = fixture(file, [{}]);
    const response = await f.run(method);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: invalidMessage });
    assert.equal(f.state.calls, 1);
    assert.equal(f.state.profiles, 0);
    assert.deepEqual(f.state.delays, []);
    assert.deepEqual(f.state.warn, []);
    assert.deepEqual(f.state.error, []);
  });
}
