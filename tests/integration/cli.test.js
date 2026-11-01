'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { install } = require('../../src/pipeline');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const TARGET = path.join(FIXTURES, 'target-structure');
const SOURCE = path.join(FIXTURES, 'source-ecc');
const CLI = path.join(__dirname, '..', '..', 'src', 'cli.js');

test('find --log appends one route-log record without changing stdout', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-cli-'));
  try {
    fs.cpSync(TARGET, root, { recursive: true });
    install({ sourceDir: SOURCE, structureRoot: root });

    const query = 'detect SQL injection vulnerabilities';
    const stdout = execFileSync(
      process.execPath,
      [CLI, 'find', '--structure', root, '--query', query, '--log'],
      { encoding: 'utf8' },
    );
    assert.match(stdout, /^sql-injection-scan\t/);

    const logPath = path.join(root, '.anabol', 'route-log.jsonl');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 1);

    const record = JSON.parse(lines[0]);
    assert.strictEqual(record.query, query);
    assert.strictEqual(record.matched, true);
    assert.strictEqual(record.top, 'sql-injection-scan');
    assert.strictEqual(record.kind, 'segment');
    assert.strictEqual(record.threshold, 0.35);
    assert.ok(record.score > 0);
    assert.ok(!Number.isNaN(Date.parse(record.at)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
