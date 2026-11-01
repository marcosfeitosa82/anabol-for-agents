'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { indexCategory, buildIndex, decodeDesc, SEGMENT_RE } = require('../../src/indexer');

const CONTENT = [
  '---', // 1
  'name: testing', // 2
  '---', // 3
  '', // 4
  '<!-- ANABOL:TOC -->', // 5
  '<!-- /ANABOL:TOC -->', // 6
  '', // 7
  '<!-- ANABOL:SEGMENTS -->', // 8
  '', // 9
  '<!-- ANABOL:SEGMENT id=alpha desc=Alpha%20thing -->', // 10
  '## alpha', // 11
  '', // 12
  'Body alpha', // 13
  '<!-- /ANABOL:SEGMENT id=alpha -->', // 14
  '', // 15
  '<!-- ANABOL:SEGMENT id=beta -->', // 16
  '## beta', // 17
  '', // 18
  'Body beta', // 19
  '<!-- /ANABOL:SEGMENT id=beta -->', // 20
  '', // 21
  '<!-- /ANABOL:SEGMENTS -->', // 22
  '', // 23
].join('\n');

test('indexCategory finds exact ranges and anchors', () => {
  const segs = indexCategory('testing', 'testing/SKILL.md', CONTENT);
  assert.strictEqual(segs.length, 2);

  const [alpha, beta] = segs;
  assert.deepStrictEqual(alpha, {
    id: 'alpha',
    category: 'testing',
    file: 'testing/SKILL.md',
    startLine: 11,
    endLine: 13,
    anchor: '## alpha',
    description: 'Alpha thing',
    keywords: ['alpha', 'body'],
  });
  assert.strictEqual(beta.startLine, 17);
  assert.strictEqual(beta.endLine, 19);
  assert.strictEqual(beta.description, '');
  assert.deepStrictEqual(beta.keywords, ['beta', 'body']);
});

test('decodeDesc handles URL encoding and malformed input', () => {
  assert.strictEqual(decodeDesc('Hello%20world%21'), 'Hello world!');
  assert.strictEqual(decodeDesc(''), '');
  assert.strictEqual(decodeDesc(undefined), '');
  assert.strictEqual(decodeDesc('%E0%A4%A'), '%E0%A4%A');
});

test('SEGMENT_RE accepts the open marker with and without desc', () => {
  assert.ok(SEGMENT_RE.test('<!-- ANABOL:SEGMENT id=alpha -->'));
  const m = SEGMENT_RE.exec('<!-- ANABOL:SEGMENT id=alpha desc=Alpha%20thing -->');
  assert.strictEqual(m[1], 'alpha');
  assert.strictEqual(m[2], 'Alpha%20thing');
  assert.ok(!SEGMENT_RE.test('<!-- ANABOL:SEGMENT id=Alpha -->'), 'ids are lowercase kebab');
});

test('indexCategory ignores unclosed segments', () => {
  const broken = ['<!-- ANABOL:SEGMENT id=alpha -->', '## alpha', 'body'].join('\n');
  assert.deepStrictEqual(indexCategory('testing', 'testing/SKILL.md', broken), []);
});

test('buildIndex merges categories and sorts by category then line', () => {
  const index = buildIndex(
    { testing: CONTENT, security: CONTENT.replace(/alpha/g, 'gamma').replace(/beta/g, 'delta') },
    { structureRoot: '/skills' },
  );
  assert.strictEqual(index.version, 1);
  assert.strictEqual(index.structureRoot, '/skills');
  assert.strictEqual(index.segments.length, 4);
  assert.deepStrictEqual(
    index.segments.map((s) => `${s.category}:${s.id}`),
    ['security:gamma', 'security:delta', 'testing:alpha', 'testing:beta'],
  );
});

test('buildIndex uses the provided fileFor mapping', () => {
  const index = buildIndex({ testing: CONTENT }, { fileFor: (c) => `${c}/custom.md` });
  assert.strictEqual(index.segments[0].file, 'testing/custom.md');
});
