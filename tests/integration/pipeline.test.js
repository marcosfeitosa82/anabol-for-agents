'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install, reindex, readById, findSegments, INDEX_DIR, INDEX_FILE } = require('../../src/pipeline');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const TARGET = path.join(FIXTURES, 'target-structure');
const SOURCE = path.join(FIXTURES, 'source-ecc');

/** Create a throwaway copy of the fixture structure. */
function makeStructure() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-it-'));
  fs.cpSync(TARGET, dir, { recursive: true });
  return dir;
}

function readIndex(root) {
  return JSON.parse(fs.readFileSync(path.join(root, INDEX_DIR, INDEX_FILE), 'utf8'));
}

function skillDirs(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && fs.existsSync(path.join(root, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}

test('AC-001: installing a package never grows the skill count', () => {
  const root = makeStructure();
  try {
    const before = skillDirs(root);
    const report = install({ sourceDir: SOURCE, structureRoot: root });
    const after = skillDirs(root);
    assert.strictEqual(before.length, 3);
    assert.deepStrictEqual(after, before);
    assert.strictEqual(report.skillsBefore, 3);
    assert.strictEqual(report.skillsAfter, 3);
    assert.strictEqual(report.countUnchanged, true);
    assert.strictEqual(report.merged.length, 8);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('AC-002: every merged skill is indexed with a range and anchor', () => {
  const root = makeStructure();
  try {
    install({ sourceDir: SOURCE, structureRoot: root });
    const index = readIndex(root);
    assert.strictEqual(index.version, 2);
    assert.strictEqual(index.segments.length, 8);
    for (const seg of index.segments) {
      assert.ok(seg.startLine >= 1, `${seg.id} startLine`);
      assert.ok(seg.endLine >= seg.startLine, `${seg.id} endLine`);
      assert.ok(seg.anchor.startsWith('## '), `${seg.id} anchor`);
      assert.ok(fs.existsSync(path.join(root, seg.file)), `${seg.id} file exists`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('AC-003: reading a segment returns only its lines (fast path, no fallback)', () => {
  const root = makeStructure();
  try {
    install({ sourceDir: SOURCE, structureRoot: root });
    const result = readById({ structureRoot: root, id: 'sql-injection-scan' });
    assert.strictEqual(result.usedFallback, false);
    assert.ok(result.text.includes('SQL injection scan'));
    assert.ok(!result.text.includes('Secret scanning'));

    const wholeFile = fs.readFileSync(path.join(root, 'security', 'SKILL.md'), 'utf8').split('\n').length;
    assert.ok(result.linesRead < wholeFile, `${result.linesRead} < ${wholeFile}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('find routes a task query to the best segment', () => {
  const root = makeStructure();
  try {
    install({ sourceDir: SOURCE, structureRoot: root });

    const sql = findSegments({ structureRoot: root, query: 'detect SQL injection vulnerabilities' });
    assert.strictEqual(sql[0].id, 'sql-injection-scan');
    assert.ok(sql[0].startLine >= 1);
    assert.ok(sql[0].endLine >= sql[0].startLine);
    assert.ok(sql[0].score > 0);

    const coverage = findSegments({ structureRoot: root, query: 'coverage threshold before merging' });
    assert.strictEqual(coverage[0].id, 'coverage-gate');

    const top3 = findSegments({ structureRoot: root, query: 'testing', limit: 3 });
    assert.strictEqual(top3.length, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('AC-004: a stale index falls back to markers and still reads the right segment', () => {
  const root = makeStructure();
  try {
    install({ sourceDir: SOURCE, structureRoot: root });
    const file = path.join(root, 'testing', 'SKILL.md');
    const original = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, '# shifted by an editor\n\n\n\n\n' + original, 'utf8');

    const result = readById({ structureRoot: root, id: 'unit-test-writer' });
    assert.strictEqual(result.usedFallback, true);
    assert.ok(result.text.includes('# Unit test writer'));
    assert.ok(!result.text.includes('# E2E testing'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('AC-006: re-installing the same package is idempotent', () => {
  const root = makeStructure();
  try {
    install({ sourceDir: SOURCE, structureRoot: root });
    const snapshot = () => {
      const files = {};
      const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full);
          else files[path.relative(root, full)] = fs.readFileSync(full, 'utf8');
        }
      };
      walk(root);
      return files;
    };
    const before = snapshot();

    install({ sourceDir: SOURCE, structureRoot: root });
    const after = snapshot();

    const index = readIndex(root);
    assert.strictEqual(index.segments.length, 8);
    assert.strictEqual(new Set(index.segments.map((s) => s.id)).size, 8);

    // A no-op reinstall must not rewrite anything, including index.generatedAt.
    assert.deepStrictEqual(after, before);

    const testing = fs.readFileSync(path.join(root, 'testing', 'SKILL.md'), 'utf8');
    assert.strictEqual((testing.match(/<!-- ANABOL:SEGMENT id=unit-test-writer /g) || []).length, 1);
    assert.strictEqual((testing.match(/<!-- \/ANABOL:SEGMENT id=unit-test-writer -->/g) || []).length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('dry run reports the plan without touching the structure', () => {
  const root = makeStructure();
  try {
    const before = fs.readFileSync(path.join(root, 'testing', 'SKILL.md'), 'utf8');
    const report = install({ sourceDir: SOURCE, structureRoot: root, dryRun: true });
    assert.strictEqual(report.dryRun, true);
    assert.strictEqual(report.merged.length, 8);
    assert.strictEqual(fs.readFileSync(path.join(root, 'testing', 'SKILL.md'), 'utf8'), before);
    assert.ok(!fs.existsSync(path.join(root, INDEX_DIR)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reindex repairs the fast path after manual edits', () => {
  const root = makeStructure();
  try {
    install({ sourceDir: SOURCE, structureRoot: root });
    const file = path.join(root, 'testing', 'SKILL.md');
    fs.writeFileSync(file, '# shifted\n\n' + fs.readFileSync(file, 'utf8'), 'utf8');

    reindex({ structureRoot: root });
    const result = readById({ structureRoot: root, id: 'e2e-testing' });
    assert.strictEqual(result.usedFallback, false);
    assert.ok(result.text.includes('# E2E testing'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a source skill whose id is already a category is skipped, not self-merged', () => {
  const root = makeStructure();
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-self-'));
  try {
    fs.mkdirSync(path.join(source, 'security'));
    fs.writeFileSync(
      path.join(source, 'security', 'SKILL.md'),
      '---\nname: security\ndescription: Security skill.\n---\n# security\nDuplicate body.\n',
      'utf8',
    );

    const report = install({ sourceDir: source, structureRoot: root });

    assert.strictEqual(report.skillsAfter, 3);
    assert.strictEqual(report.merged.length, 0);
    assert.deepStrictEqual(report.skipped, [{ id: 'security', reason: 'already installed as a category' }]);
    assert.strictEqual(report.index.length, 0);
    const after = fs.readFileSync(path.join(root, 'security', 'SKILL.md'), 'utf8');
    assert.ok(!after.includes('Duplicate body.'), 'source body was not merged into itself');
    assert.ok(!after.includes('ANABOL:SEGMENT id=security'), 'no self-segment was created');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('install rewrites only the categories it touched', () => {
  const root = makeStructure();
  try {
    const securityFile = path.join(root, 'security', 'SKILL.md');
    const documentationFile = path.join(root, 'documentation', 'SKILL.md');
    const beforeSecurity = fs.readFileSync(securityFile, 'utf8');
    const beforeDocumentation = fs.readFileSync(documentationFile, 'utf8');

    install({ sourceDir: path.join(SOURCE, 'coverage-gate'), structureRoot: root });

    assert.strictEqual(fs.readFileSync(securityFile, 'utf8'), beforeSecurity);
    assert.strictEqual(fs.readFileSync(documentationFile, 'utf8'), beforeDocumentation);
    assert.ok(fs.readFileSync(path.join(root, 'testing', 'SKILL.md'), 'utf8').includes('id=coverage-gate'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('readById refuses an index path that escapes the structure root', () => {
  const root = makeStructure();
  const outside = path.join(root, '..', `${path.basename(root)}-escaped.md`);
  try {
    install({ sourceDir: SOURCE, structureRoot: root });
    fs.writeFileSync(outside, 'escaped content\n', 'utf8');

    const index = readIndex(root);
    const target = index.segments[0];
    target.file = `../${path.basename(outside)}`;
    fs.writeFileSync(path.join(root, INDEX_DIR, INDEX_FILE), JSON.stringify(index), 'utf8');

    assert.throws(
      () => readById({ structureRoot: root, id: target.id }),
      /path escapes structure root/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { force: true });
  }
});

test('the index schema stays v2 with the documented entry shape', () => {
  const root = makeStructure();
  try {
    install({ sourceDir: SOURCE, structureRoot: root });
    const index = readIndex(root);

    assert.deepStrictEqual(
      Object.keys(index).sort(),
      ['categories', 'generatedAt', 'segments', 'structureRoot', 'version'].sort(),
    );
    assert.strictEqual(index.version, 2);
    assert.ok(!Number.isNaN(Date.parse(index.generatedAt)));
    assert.strictEqual(path.resolve(index.structureRoot), path.resolve(root));

    const entryKeys = ['anchor', 'category', 'description', 'endLine', 'file', 'id', 'keywords', 'startLine'];
    for (const entry of [...index.segments, ...index.categories]) {
      assert.deepStrictEqual(Object.keys(entry).sort(), entryKeys.slice().sort());
      assert.strictEqual(typeof entry.id, 'string');
      assert.strictEqual(typeof entry.category, 'string');
      assert.strictEqual(typeof entry.file, 'string');
      assert.ok(Number.isInteger(entry.startLine) && entry.startLine >= 1);
      assert.ok(Number.isInteger(entry.endLine) && entry.endLine >= entry.startLine);
      assert.strictEqual(typeof entry.anchor, 'string');
      assert.strictEqual(typeof entry.description, 'string');
      assert.ok(Array.isArray(entry.keywords) && entry.keywords.every((k) => typeof k === 'string'));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('readById prefers a segment when a category shares its id', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-shadow-'));
  try {
    fs.mkdirSync(path.join(root, 'shadow'));
    const content = [
      '---',
      'name: shadow',
      'description: Shadow category.',
      '---',
      '',
      '<!-- ANABOL:SEGMENTS -->',
      '',
      '<!-- ANABOL:SEGMENT id=shadow desc=Segment%20shadow -->',
      '## shadow',
      '',
      'Segment body',
      '<!-- /ANABOL:SEGMENT id=shadow -->',
      '',
      '<!-- /ANABOL:SEGMENTS -->',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(root, 'shadow', 'SKILL.md'), content, 'utf8');

    reindex({ structureRoot: root });
    const result = readById({ structureRoot: root, id: 'shadow' });
    assert.strictEqual(result.whole, false);
    assert.ok(result.text.includes('Segment body'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('first install on an empty structure creates categories for the source', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-empty-'));
  try {
    const report = install({ sourceDir: SOURCE, structureRoot: root });
    assert.strictEqual(report.skillsBefore, 0);
    assert.strictEqual(report.skillsAfter, 8);
    assert.strictEqual(report.merged.every((m) => m.created), true);
    assert.strictEqual(readIndex(root).segments.length, 8);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
