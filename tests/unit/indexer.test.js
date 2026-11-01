'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { indexCategory, buildIndex, decodeDesc, stripMergedBlocks, SEGMENT_RE } = require('../../src/indexer');

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
  assert.strictEqual(index.version, 2);
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

test('buildIndex adds one whole-category entry per skill and excludes the meta-skill', () => {
  const withDescription = CONTENT.replace('name: testing', 'name: testing\ndescription: Category for testing.');
  // The meta-skill carries no merged segments in practice; keep it segment-free
  // so this test isolates the category-entry shape from the segment count.
  const meta = '---\nname: anabol-orchestrator\ndescription: Meta orchestrator.\n---\n\n# meta\n';
  const index = buildIndex(
    { testing: withDescription, 'anabol-orchestrator': meta },
    { fileFor: (c) => `${c}/SKILL.md` },
  );
  assert.strictEqual(index.version, 2);
  assert.strictEqual(index.segments.length, 2);
  assert.deepStrictEqual(index.categories.map((c) => c.id), ['testing']);

  const category = index.categories[0];
  assert.strictEqual(category.category, 'testing');
  assert.strictEqual(category.file, 'testing/SKILL.md');
  assert.strictEqual(category.startLine, 1);
  assert.strictEqual(category.endLine, withDescription.split('\n').length);
  assert.strictEqual(category.anchor, '---');
  assert.strictEqual(category.description, 'Category for testing.');
  assert.ok(!category.keywords.includes('alpha'), 'segment-only keyword leaked');
  assert.ok(!category.keywords.includes('beta'), 'segment-only keyword leaked');
});

test('buildIndex never routes the meta-skill, even if it contains a segment', () => {
  const meta = [
    '---',
    'name: anabol-orchestrator',
    'description: Meta orchestrator.',
    '---',
    '',
    '<!-- ANABOL:SEGMENTS -->',
    '',
    '<!-- ANABOL:SEGMENT id=leaked desc=Leaked%20segment -->',
    '## leaked',
    '',
    'Body leaked',
    '<!-- /ANABOL:SEGMENT id=leaked -->',
    '',
    '<!-- /ANABOL:SEGMENTS -->',
    '',
  ].join('\n');
  const index = buildIndex({ 'anabol-orchestrator': meta, testing: CONTENT });
  assert.ok(!index.segments.some((s) => s.id === 'leaked'));
  assert.ok(!index.segments.some((s) => s.category === 'anabol-orchestrator'));
  assert.ok(!index.categories.some((c) => c.id === 'anabol-orchestrator'));
});

test('stripMergedBlocks removes TOC and merged segments but keeps the category prose', () => {
  const stripped = stripMergedBlocks(CONTENT);
  assert.ok(!stripped.includes('ANABOL:TOC'));
  assert.ok(!stripped.includes('ANABOL:SEGMENT'));
  assert.ok(!stripped.includes('Body alpha'));
  assert.ok(stripped.includes('name: testing'));
});
