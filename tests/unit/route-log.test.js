const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { appendRouteLog, readRouteLog, summarizeRouteLog } = require('../../src/route-log');

test('route log appends JSONL and summarizes hits and misses', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-log-'));
  try {
    appendRouteLog(root, { query: 'detect SQL injection', top: 'security-review', score: 0.5, matched: true, kind: 'category' });
    appendRouteLog(root, { query: 'bake a cake', top: null, score: 0, matched: false, kind: null });
    fs.appendFileSync(path.join(root, '.anabol', 'route-log.jsonl'), 'not json\n');

    const records = readRouteLog(root);
    assert.strictEqual(records.length, 2);
    const summary = summarizeRouteLog(records);
    assert.strictEqual(summary.total, 2);
    assert.strictEqual(summary.matched, 1);
    assert.strictEqual(summary.noMatch, 1);
    assert.deepStrictEqual(summary.byTop, [['security-review', 1]]);
    assert.strictEqual(summary.misses.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
