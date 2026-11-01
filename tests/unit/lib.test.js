'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  parseFrontmatter,
  findMarker,
  slugify,
  overlapScore,
  tokensMatch,
  stem,
  topTokens,
} = require('../../src/lib');

test('parseFrontmatter reads flat keys and strips quotes', () => {
  const raw = '---\nname: foo\ndescription: "A quoted description"\nanabol-category: testing\n---\nBody line\n';
  const { frontmatter, body } = parseFrontmatter(raw);
  assert.strictEqual(frontmatter.name, 'foo');
  assert.strictEqual(frontmatter.description, 'A quoted description');
  assert.strictEqual(frontmatter['anabol-category'], 'testing');
  assert.strictEqual(body, 'Body line\n');
});

test('parseFrontmatter handles missing frontmatter', () => {
  const { frontmatter, body } = parseFrontmatter('just text');
  assert.deepStrictEqual(frontmatter, {});
  assert.strictEqual(body, 'just text');
});

test('parseFrontmatter folds YAML block scalars', () => {
  const raw = [
    '---',
    'name: x',
    'description: >-',
    '  folded line one',
    '  folded line two',
    '',
    '  second paragraph',
    'literal: |',
    '  keep',
    '  lines',
    'after: plain',
    '---',
    'body',
  ].join('\n');
  const { frontmatter } = parseFrontmatter(raw);
  assert.strictEqual(frontmatter.name, 'x');
  assert.strictEqual(frontmatter.description, 'folded line one folded line two\nsecond paragraph');
  assert.strictEqual(frontmatter.literal, 'keep\nlines');
  assert.strictEqual(frontmatter.after, 'plain');
});

test('findMarker returns inclusive 1-based lines', () => {
  const lines = ['a', '<!-- OPEN -->', 'b', '<!-- CLOSE -->'];
  const m = findMarker(lines, '<!-- OPEN -->', '<!-- CLOSE -->');
  assert.deepStrictEqual(m, { openLine: 2, closeLine: 4 });
});

test('slugify normalizes to kebab-case', () => {
  assert.strictEqual(slugify('SQL Injection Scan!'), 'sql-injection-scan');
  assert.strictEqual(slugify('  --foo--bar--  '), 'foo-bar');
});

test('stem handles common suffixes', () => {
  assert.strictEqual(stem('vulnerabilities'), 'vulnerability');
  assert.strictEqual(stem('testing'), 'test');
  assert.strictEqual(stem('tests'), 'test');
});

test('tokensMatch is strict about short prefixes', () => {
  assert.ok(tokensMatch('scanning', 'scanning'));
  assert.ok(!tokensMatch('doc', 'documentation'), 'short prefix must not match');
  assert.ok(tokensMatch('write', 'writer'), 'prefix rule is length-based; stopwords handle generic verbs');
  assert.ok(!tokensMatch('scan', 'scanner'), '4-char prefix is below the minimum');
});

test('overlapScore is stem-aware', () => {
  const a = 'Detect vulnerabilities in queries';
  const b = 'Security review and vulnerability detection';
  assert.ok(overlapScore(a, b) > 0);
  assert.ok(overlapScore(a, b) > overlapScore(a, 'Unrelated cooking recipes'));
});

test('topTokens ranks frequent meaningful tokens and drops stopwords', () => {
  const tokens = topTokens('SQL injection SQL injection vulnerabilities and unsafe queries', 6);
  assert.ok(tokens.includes('sql'));
  assert.ok(tokens.some((t) => t.startsWith('inject')));
  assert.ok(!tokens.includes('and'));
  assert.ok(tokens.length <= 6);
});
