'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { ingest, chooseCategory, bestCategory, categoryMap, toEntry } = require('../../src/ingest');

const EXISTING = [
  toEntry({ id: 'security', file: 'security/SKILL.md', name: 'security', description: 'Security review, vulnerability detection, secret scanning, and safe coding practices.' }),
  toEntry({ id: 'testing', file: 'testing/SKILL.md', name: 'testing', description: 'Test-driven development, unit and integration testing, coverage, and verification before completion.' }),
  toEntry({ id: 'documentation', file: 'documentation/SKILL.md', name: 'documentation', description: 'Writing and maintaining documentation, READMEs, API docs, and commit messages.' }),
];

test('toEntry slugifies ids and keeps optional fields', () => {
  const entry = toEntry({ id: 'SQL Injection Scan', file: 'x/SKILL.md', name: 'sql', description: 'd', category: 'Security' });
  assert.strictEqual(entry.id, 'sql-injection-scan');
  assert.strictEqual(entry.category, 'security');
  assert.deepStrictEqual(toEntry({ id: 'plain', file: 'p/SKILL.md' }), { id: 'plain', file: 'p/SKILL.md' });
});

test('categoryMap indexes existing skills by id', () => {
  const map = categoryMap(EXISTING);
  assert.strictEqual(map.size, 3);
  assert.strictEqual(map.get('testing').file, 'testing/SKILL.md');
});

test('chooseCategory honours an explicit category', () => {
  const incoming = toEntry({ id: 'anything', file: 'x/SKILL.md', description: 'unrelated words', category: 'testing' });
  assert.strictEqual(chooseCategory(incoming, EXISTING), 'testing');
});

test('chooseCategory routes by description overlap', () => {
  const sql = toEntry({
    id: 'sql-injection-scan',
    file: 'x/SKILL.md',
    description: 'Detect SQL injection vulnerabilities and unsafe query construction.',
  });
  const coverage = toEntry({
    id: 'coverage-gate',
    file: 'y/SKILL.md',
    description: 'Enforce a coverage threshold before merging and report missing lines.',
  });
  const api = toEntry({
    id: 'api-doc-writer',
    file: 'z/SKILL.md',
    description: 'Document API endpoints, request/response schemas, and error codes.',
  });
  assert.strictEqual(chooseCategory(sql, EXISTING), 'security');
  assert.strictEqual(chooseCategory(coverage, EXISTING), 'testing');
  assert.strictEqual(chooseCategory(api, EXISTING), 'documentation');
});

test('chooseCategory returns null when nothing overlaps enough', () => {
  const incoming = toEntry({ id: 'sourdough', file: 'x/SKILL.md', description: 'Bake bread with a wild yeast starter.' });
  assert.strictEqual(chooseCategory(incoming, EXISTING), null);
});

test('chooseCategory returns null when there are no existing categories', () => {
  assert.strictEqual(chooseCategory(toEntry({ id: 'a', file: 'a/SKILL.md' }), []), null);
});

test('bestCategory always returns the closest category', () => {
  const incoming = toEntry({ id: 'sourdough', file: 'x/SKILL.md', description: 'Bake bread.' });
  assert.ok(EXISTING.some((e) => e.id === bestCategory(incoming, EXISTING)));
  assert.strictEqual(bestCategory(incoming, []), null);
});

test('chooseCategory can use the category body when its description is terse', () => {
  const terse = [
    toEntry({
      id: 'security-review',
      file: 'security-review/SKILL.md',
      name: 'security-review',
      description: 'Review code for security issues.',
      body: '# Security Review\n\n## Input Validation\n\nAlways prevent SQL injection with parameterized queries.',
    }),
    toEntry({
      id: 'git-workflow',
      file: 'git-workflow/SKILL.md',
      name: 'git-workflow',
      description: 'Branching, rebasing, and commit conventions.',
      body: '# Git Workflow\n\nUse feature branches and rebase before merging.',
    }),
  ];
  const incoming = toEntry({
    id: 'sql-injection-scan',
    file: 'x/SKILL.md',
    description: 'Detect SQL injection vulnerabilities in queries.',
  });
  assert.strictEqual(chooseCategory(incoming, terse), 'security-review');
});

test('ingest separates categorized and uncategorized skills', () => {
  const source = [
    toEntry({ id: 'secret-scanning', file: 'a/SKILL.md', description: 'Scan for leaked API keys, tokens, and credentials.' }),
    toEntry({ id: 'sourdough', file: 'b/SKILL.md', description: 'Bake bread with a wild yeast starter.' }),
  ];
  const result = ingest(EXISTING, source);
  assert.strictEqual(result.assignments.length, 2);
  assert.deepStrictEqual(result.assignments.map((a) => a.category), ['security', null]);
  assert.deepStrictEqual(result.uncategorized.map((s) => s.id), ['sourdough']);
  assert.deepStrictEqual(result.categoriesUsed, ['security']);
});

test('ingest returns an empty result for an empty source', () => {
  assert.deepStrictEqual(ingest(EXISTING, []), { assignments: [], uncategorized: [], categoriesUsed: [] });
});
