'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { install, reindex, readById, INDEX_DIR, INDEX_FILE } = require('../../src/pipeline');

const SOURCE = path.join(__dirname, '..', 'fixtures', 'source-assets');

function makeStructure() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-assets-int-'));
  const dir = path.join(root, 'docs');
  fs.mkdirSync(dir);
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    '---\nname: docs\ndescription: Documentation skills.\n---\n\n# Docs\n\nUse for documentation.\n',
  );
  return root;
}

function readIndex(root) {
  return JSON.parse(fs.readFileSync(path.join(root, INDEX_DIR, INDEX_FILE), 'utf8'));
}

function hashTree(root) {
  const h = crypto.createHash('sha256');
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else {
        h.update(path.relative(root, full));
        h.update(fs.readFileSync(full));
      }
    }
  };
  walk(root);
  return h.digest('hex');
}

test('install copies assets and rewrites relative references', () => {
  const root = makeStructure();
  try {
    const report = install({ sourceDir: SOURCE, structureRoot: root });
    assert.strictEqual(report.skillsBefore, 1);
    assert.strictEqual(report.skillsAfter, 1);
    assert.strictEqual(report.merged.length, 1);
    assert.strictEqual(report.merged[0].assets, 4);

    const base = path.join(root, 'docs', 'anabol-assets', 'diagram-helper');
    for (const rel of ['references/syntax.md', 'references/mistakes.md', 'scripts/render.sh', 'assets/sample.txt']) {
      assert.ok(fs.existsSync(path.join(base, rel)), `missing ${rel}`);
    }

    const body = fs.readFileSync(path.join(root, 'docs', 'SKILL.md'), 'utf8');
    assert.match(body, /\]\(anabol-assets\/diagram-helper\/references\/syntax\.md\)/);
    assert.match(body, /\]\(anabol-assets\/diagram-helper\/references\/mistakes\.md#top\)/);
    assert.match(body, /`anabol-assets\/diagram-helper\/scripts\/render\.sh`/);
    assert.ok(!body.includes('](references/syntax.md)'));
    assert.ok(body.includes('[spec](https://example.com/spec)'));

    const index = readIndex(root);
    const seg = index.segments.find((s) => s.id === 'diagram-helper');
    assert.deepStrictEqual(seg.assets, [
      'docs/anabol-assets/diagram-helper/assets/sample.txt',
      'docs/anabol-assets/diagram-helper/references/mistakes.md',
      'docs/anabol-assets/diagram-helper/references/syntax.md',
      'docs/anabol-assets/diagram-helper/scripts/render.sh',
    ]);

    const read = readById({ structureRoot: root, id: 'diagram-helper' });
    assert.strictEqual(read.segment.assets.length, 4);
    assert.ok(read.text.includes('anabol-assets/diagram-helper/references/syntax.md'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reinstall with assets is byte-identical', () => {
  const root = makeStructure();
  try {
    install({ sourceDir: SOURCE, structureRoot: root });
    const before = hashTree(root);
    install({ sourceDir: SOURCE, structureRoot: root });
    assert.strictEqual(hashTree(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reindex keeps assets in the index', () => {
  const root = makeStructure();
  try {
    install({ sourceDir: SOURCE, structureRoot: root });
    const rebuilt = reindex({ structureRoot: root, write: false });
    const seg = rebuilt.segments.find((s) => s.id === 'diagram-helper');
    assert.strictEqual(seg.assets.length, 4);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('removing an asset from the source removes it on reinstall', () => {
  const root = makeStructure();
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-assets-src-'));
  try {
    fs.cpSync(SOURCE, source, { recursive: true });
    install({ sourceDir: source, structureRoot: root });
    const asset = path.join(root, 'docs', 'anabol-assets', 'diagram-helper', 'assets', 'sample.txt');
    assert.ok(fs.existsSync(asset));

    fs.rmSync(path.join(source, 'diagram-helper', 'assets'), { recursive: true, force: true });
    install({ sourceDir: source, structureRoot: root });

    assert.ok(!fs.existsSync(asset));
    const seg = readIndex(root).segments.find((s) => s.id === 'diagram-helper');
    assert.ok(!seg.assets.some((a) => a.endsWith('sample.txt')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});
