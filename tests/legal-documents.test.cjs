/* eslint-disable @typescript-eslint/no-require-imports -- Node's CommonJS test harness loads TS and JSON fixtures. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const terms = require('../lib/legal-terms.json');
const privacy = require('../lib/legal-privacy.json');
const metadata = require('../lib/legal-metadata.json');

for (const [name, sections, count] of [['terms', terms, 44], ['privacy', privacy, 45]]) {
  test(`${name}: complete bilingual document with data-only placeholders`, () => {
    assert.equal(sections.length, count);
    assert.equal(new Set(sections.map(s => s.title.en)).size, count);
    sections.forEach((s, i) => {
      assert.equal(s.number, i + 1);
      for (const language of ['en', 'es']) {
        assert.ok(s.title[language].trim().length > 3);
        assert.ok(s[language].trim().length > 120);
        assert.doesNotMatch(s.title[language], /PENDIENTE/);
        assert.doesNotMatch(s[language], /^\s*\[PENDIENTE\]\s*$/);
        if (s[language].includes('[PENDIENTE')) {
          assert.ok((name === 'terms' ? [2, 43, 44] : [2, 44, 45]).includes(s.number));
        }
      }
    });
    assert.doesNotMatch(JSON.stringify(sections), /Melendi|VIP Promotions/i);
  });
}

function renderDocument(language, isPrivacy, query) {
  const filename = path.resolve(__dirname, '../app/components/LegalTerms.tsx');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = id => {
    if (id === 'react' && query !== undefined) return { ...React, useSyncExternalStore: (_subscribe, snapshot) => snapshot() };
    if (id === './LanguageProvider') return { useLanguage: () => ({ language }) };
    if (id.startsWith('@/lib/')) return require(path.resolve(__dirname, '..', id.slice(2)));
    return originalRequire(id);
  };
  loaded._compile(code, filename);
  const previousWindow = global.window;
  if (query !== undefined) global.window = { location: { search: query } };
  try {
    return renderToStaticMarkup(React.createElement(isPrivacy ? loaded.exports.LegalPrivacy : loaded.exports.default));
  } finally {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }
}

test('mobile language overrides browser language; invalid language falls back automatically', () => {
  assert.ok(renderDocument('en', false, '?lang=es').includes('lang="es"'));
  assert.ok(renderDocument('es', true, '?lang=en').includes('lang="en"'));
  assert.ok(renderDocument('es', false, '?lang=fr').includes('lang="es"'));
  assert.ok(renderDocument('en', true, '').includes('lang="en"'));
});

for (const language of ['en', 'es']) {
  for (const [name, sections, isPrivacy] of [['terms', terms, false], ['privacy', privacy, true]]) {
    test(`${name}: renders every ${language} section and heading without a selector`, () => {
      const html = renderDocument(language, isPrivacy);
      assert.ok(html.includes(`lang="${language}"`));
      assert.equal((html.match(/<section /g) || []).length, sections.length);
      const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
      for (const section of sections) {
        assert.ok(html.includes(escape(section.title[language])));
        assert.ok(html.includes(escape(section[language])));
      }
      assert.ok(html.includes(metadata.version));
      assert.doesNotMatch(html, /<select|role="combobox"/);
    });
  }
}
