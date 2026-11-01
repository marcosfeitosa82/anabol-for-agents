const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { install, reindex, readById, findSegments, INDEX_DIR, INDEX_FILE } = require('../../src/pipeline');

const TARGET = path.join(__dirname, '..', 'fixtures', 'target-structure');
const SOURCE = path.join(__dirname, '..', 'fixtures', 'source-ecc');
const CLI = path.join(__dirname, '..', '..', 'src', 'cli.js');

function makeStructure() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-router-'));
  fs.cpSync(TARGET, root, { recursive: true });
  return root;
}

test('reindex creates whole-category entries and find routes to one', () => {
  const root = makeStructure();
  try {
    reindex({ structureRoot: root });
    const found = findSegments({ structureRoot: root, query: 'documentation readme api docs' });
    assert.strictEqual(found[0].id, 'documentation');
    assert.strictEqual(found[0].kind, 'category');

    const read = readById({ structureRoot: root, id: 'documentation' });
    assert.strictEqual(read.whole, true);
    assert.strictEqual(read.linesRead, fs.readFileSync(path.join(root, 'documentation', 'SKILL.md'), 'utf8').split('\n').length);
    assert.ok(read.text.startsWith('---'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a specific segment still wins over its category', () => {
  const root = makeStructure();
  try {
    install({ sourceDir: SOURCE, structureRoot: root });
    const found = findSegments({ structureRoot: root, query: 'detect SQL injection vulnerabilities' });
    assert.strictEqual(found[0].id, 'sql-injection-scan');
    assert.strictEqual(found[0].kind, 'segment');
    assert.strictEqual(readById({ structureRoot: root, id: 'sql-injection-scan' }).whole, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('find rejects an off-domain query', () => {
  const root = makeStructure();
  try {
    reindex({ structureRoot: root });
    assert.deepStrictEqual(findSegments({ structureRoot: root, query: 'bake a chocolate cake' }), []);
    assert.deepStrictEqual(
      findSegments({ structureRoot: root, query: 'bake a chocolate cake', includeCategories: false }),
      [],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a version-1 index without categories still routes segments', () => {
  const root = makeStructure();
  try {
    install({ sourceDir: SOURCE, structureRoot: root });
    const idxPath = path.join(root, INDEX_DIR, INDEX_FILE);
    const index = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    index.version = 1;
    delete index.categories;
    fs.writeFileSync(idxPath, JSON.stringify(index, null, 2) + '\n');

    const found = findSegments({ structureRoot: root, query: 'detect SQL injection vulnerabilities' });
    assert.strictEqual(found[0].id, 'sql-injection-scan');
    assert.strictEqual(found[0].kind, 'segment');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI prints NO_MATCH and [] instead of a zero-score guess', () => {
  const root = makeStructure();
  try {
    reindex({ structureRoot: root });
    const plain = execFileSync('node', [CLI, 'find', '--structure', root, '--query', 'bake a chocolate cake'], { encoding: 'utf8' });
    assert.strictEqual(plain, 'NO_MATCH\n');
    const json = execFileSync('node', [CLI, 'find', '--structure', root, '--query', 'bake a chocolate cake', '--json'], { encoding: 'utf8' });
    assert.deepStrictEqual(JSON.parse(json), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('limit and threshold are applied after ranking', () => {
  const root = makeStructure();
  try {
    install({ sourceDir: SOURCE, structureRoot: root });
    assert.strictEqual(findSegments({ structureRoot: root, query: 'testing', limit: 3 }).length, 3);
    // "testing database" covers only one of two query tokens (score 0.5), so
    // a 0.6 threshold must reject it even though a partial match exists.
    assert.deepStrictEqual(
      findSegments({ structureRoot: root, query: 'testing database', threshold: 0.6 }),
      [],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
