/* eslint-disable @typescript-eslint/no-require-imports -- Node integration test. */
const test = require('node:test');
const assert = require('node:assert/strict');
const terms = require('../lib/legal-terms.json');
const privacy = require('../lib/legal-privacy.json');
const base = process.env.RELYDO_LEGAL_TEST_URL;
const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

for (const [route, sections] of [['terms', terms], ['privacy', privacy]]) {
  for (const [query, language] of [['es', 'es'], ['en', 'en'], ['es&lang=en', 'es'], ['fr', 'en']]) {
    test(`${route}?lang=${query}: initial HTML contains the complete ${language} v2.0 document`, { skip: !base }, async () => {
      const response = await fetch(`${base}/${route}?lang=${query}`, { redirect: 'manual', signal: AbortSignal.timeout(45000) });
      assert.equal(response.status, 200);
      const html = await response.text();
      const main = html.match(/<main\b[\s\S]*?<\/main>/)?.[0].replace(/<!--[\s\S]*?-->/g, '');
      assert.ok(main, 'Document must be present before JavaScript runs');
      assert.ok(main.includes(`lang="${language}"`));
      assert.ok(main.includes(`${language === 'es' ? 'Versión' : 'Version'} 2.0`));
      assert.equal((main.match(/<section /g) || []).length, sections.length);
      for (const section of sections) {
        assert.ok(main.includes(escape(`${section.number}. ${section.title[language]}`)), `Missing heading ${section.number}`);
        assert.ok(main.includes(escape(section[language])), `Missing body ${section.number}`);
      }
    });
  }
}
