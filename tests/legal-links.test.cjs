/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const directory = fs.existsSync(path.join(root, 'lib/legal-links.ts')) ? 'lib' : 'src/legal';
const filename = path.join(root, directory, 'legal-links.ts');
const loaded = new Module(filename, module);
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020}}).outputText, filename);
const { splitLegalLinks } = loaded.exports;
test('links only email addresses without changing punctuation or web URLs', () => {
  const text = 'Contacto: empresa@relydo.co, other+tag@example.org; (www.relydo.co). https://example.org/a_(b)?x=1&y=2.';
  const parts = splitLegalLinks(text);
  assert.equal(parts.map(p => p.text).join(''), text);
  assert.deepEqual(parts.filter(p => p.href).map(p => p.href), ['mailto:empresa@relydo.co', 'mailto:other%2Btag@example.org']);
});
test('keeps web URLs, schemes and embedded addresses as plain text', () => {
  for (const text of ['javascript:alert(1)', 'data:text/html,evil', 'https://user:pass@example.org', 'https://', 'https://localhost', 'javascript:www.relydo.co', 'http://example.org', 'https://example.org/path/hello@example.org', 'www.example.org/hello@example.org', 'https://example.org/?email=hello@example.org', 'data:hello@example.org']) {
    assert.equal(splitLegalLinks(text).filter(p => p.href).length, 0, text);
  }
  assert.equal(splitLegalLinks('').length, 0);
});
test('all canonical EN/ES sections round-trip exactly and every email becomes clickable', () => {
  for (const name of ['terms', 'privacy']) for (const section of require(path.join(root, directory, `legal-${name}.json`))) for (const language of ['en','es']) {
    for (const text of [section.title[language], section[language]]) {
      const parts = splitLegalLinks(text);
      assert.equal(parts.map(p => p.text).join(''), text);
      const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
      for (const email of emails) assert.ok(parts.some(p => p.text === email && p.href?.startsWith('mailto:')), email);
      for (const part of parts) if (part.href) assert.match(part.href, /^mailto:/);
    }
  }
});
