const { test } = require('node:test');
const assert = require('node:assert');
const { rankEntries, scoreEntry, DEFAULT_THRESHOLD } = require('../../src/router');

const segment = {
  id: 'openapi-to-typescript',
  category: 'coding-standards',
  description: 'Generate TypeScript types from an OpenAPI spec.',
  keywords: [],
};
const category = {
  id: 'coding-standards',
  category: 'coding-standards',
  description: 'Generate TypeScript types from an OpenAPI spec.',
  keywords: [],
};

test('DEFAULT_THRESHOLD is 0.35', () => {
  assert.strictEqual(DEFAULT_THRESHOLD, 0.35);
});

test('a segment wins an exact score tie against its category', () => {
  const out = rankEntries('generate TypeScript types from an OpenAPI spec', {
    segments: [segment],
    categories: [category],
  });
  assert.strictEqual(out[0].id, 'openapi-to-typescript');
  assert.strictEqual(out[0].kind, 'segment');
});

test('a category routes when no segment matches', () => {
  const out = rankEntries('documentation readme api docs', {
    segments: [{ id: 'unrelated', category: 'docs', description: 'deploy a container', keywords: [] }],
    categories: [{ id: 'documentation', category: 'documentation', description: 'Writing documentation, READMEs, and API docs.', keywords: [] }],
  });
  assert.strictEqual(out[0].id, 'documentation');
  assert.strictEqual(out[0].kind, 'category');
});

test('a below-threshold query returns no entries', () => {
  assert.deepStrictEqual(
    rankEntries('bake a chocolate cake', { segments: [segment], categories: [category] }),
    [],
  );
});

test('threshold 0 returns the best entry', () => {
  const out = rankEntries('bake a chocolate cake', { segments: [segment], categories: [category] }, { threshold: 0 });
  assert.strictEqual(out.length, 1);
});

test('includeCategories false ignores whole categories', () => {
  const out = rankEntries('documentation readme api docs', {
    segments: [],
    categories: [{ id: 'documentation', category: 'documentation', description: 'Writing documentation, READMEs, and API docs.', keywords: [] }],
  }, { includeCategories: false });
  assert.deepStrictEqual(out, []);
});

test('limit applies after filtering and scoreEntry rounds to 4 decimals', () => {
  const out = rankEntries('alpha beta', {
    segments: [
      { id: 'b', category: 'x', description: 'alpha beta', keywords: [] },
      { id: 'a', category: 'x', description: 'alpha beta', keywords: [] },
    ],
  }, { limit: 1 });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].id, 'a');
  assert.strictEqual(out[0].score, 1);
  assert.strictEqual(scoreEntry('alpha beta', out[0]), 1);
});
