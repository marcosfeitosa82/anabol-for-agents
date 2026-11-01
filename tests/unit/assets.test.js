'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { collectAssets, rewriteAssetRefs, assetDir } = require('../../src/assets');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'source-assets', 'diagram-helper');

test('collectAssets lists shipped files and skips SKILL.md/README.md', () => {
  const assets = collectAssets(FIXTURE);
  assert.deepStrictEqual(assets, [
    'assets/sample.txt',
    'references/mistakes.md',
    'references/syntax.md',
    'scripts/render.sh',
  ]);
});

test('collectAssets skips README.md at the skill root only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-assets-'));
  try {
    fs.writeFileSync(path.join(dir, 'SKILL.md'), 'x');
    fs.writeFileSync(path.join(dir, 'README.md'), 'x');
    fs.mkdirSync(path.join(dir, 'references'));
    fs.writeFileSync(path.join(dir, 'references', 'README.md'), 'keep');
    assert.deepStrictEqual(collectAssets(dir), ['references/README.md']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('assetDir is category-relative', () => {
  assert.strictEqual(assetDir('c4'), 'anabol-assets/c4');
});

test('rewriteAssetRefs rewrites markdown links, fragments, titles and ./ forms', () => {
  const body = [
    '[syntax](references/syntax.md)',
    '[mistakes](./references/mistakes.md#top)',
    '[titled](references/syntax.md "Syntax")',
    '![preview](assets/sample.txt)',
  ].join('\n');
  const out = rewriteAssetRefs(body, 'c4', ['references/syntax.md', 'references/mistakes.md', 'assets/sample.txt']);
  assert.match(out, /\]\(anabol-assets\/c4\/references\/syntax\.md\)/);
  assert.match(out, /\]\(anabol-assets\/c4\/references\/mistakes\.md#top\)/);
  assert.match(out, /\]\(anabol-assets\/c4\/references\/syntax\.md "Syntax"\)/);
  assert.match(out, /!\[preview\]\(anabol-assets\/c4\/assets\/sample\.txt\)/);
});

test('rewriteAssetRefs rewrites inline code and HTML attributes', () => {
  const body = 'run `scripts/render.sh` or <img src="assets/sample.txt">';
  const out = rewriteAssetRefs(body, 'c4', ['scripts/render.sh', 'assets/sample.txt']);
  assert.strictEqual(out, 'run `anabol-assets/c4/scripts/render.sh` or <img src="anabol-assets/c4/assets/sample.txt">');
});

test('rewriteAssetRefs leaves unknown, absolute and external paths alone', () => {
  const body = '[a](references/unknown.md) [b](https://example.com/x) [c](/etc/hosts)';
  const out = rewriteAssetRefs(body, 'c4', ['references/syntax.md']);
  assert.strictEqual(out, body);
});

test('rewriteAssetRefs is not applied twice', () => {
  const once = rewriteAssetRefs('[a](references/syntax.md)', 'c4', ['references/syntax.md']);
  const twice = rewriteAssetRefs(once, 'c4', ['references/syntax.md']);
  assert.strictEqual(twice, once);
  assert.strictEqual((twice.match(/anabol-assets\/c4/g) || []).length, 1);
});
