'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const INSTALL = path.join(ROOT, 'scripts', 'install.sh');
const UNINSTALL = path.join(ROOT, 'scripts', 'uninstall.sh');

function run(script, args, env = {}) {
  return spawnSync('sh', [script, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
}

test('AC-005: the installer never blocks when stdin is not a TTY', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-donate-'));
  try {
    const result = run(INSTALL, ['--target', target]);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(target, 'anabol-orchestrator', 'SKILL.md')));
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('AC-005: ANABOL_NO_DONATE=1 skips the prompt and still installs', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-donate-'));
  try {
    const result = run(INSTALL, ['--target', target], { ANABOL_NO_DONATE: '1' });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(!result.stdout.includes('Donate?'));
    assert.ok(fs.existsSync(path.join(target, 'anabol-orchestrator', 'reference', 'ingest.md')));
    assert.ok(fs.existsSync(path.join(target, 'anabol-orchestrator', 'reference', 'donate.md')));
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('the installer registers exactly one skill and keeps references unregistered', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-donate-'));
  try {
    run(INSTALL, ['--target', target, '--no-donate']);
    const skillFiles = [];
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      if (entry.isDirectory() && fs.existsSync(path.join(target, entry.name, 'SKILL.md'))) {
        skillFiles.push(entry.name);
      }
    }
    assert.deepStrictEqual(skillFiles, ['anabol-orchestrator']);
    assert.ok(!fs.existsSync(path.join(target, 'anabol-orchestrator', 'reference', 'SKILL.md')));
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('--no-donate is accepted and --dry-run writes nothing', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-donate-'));
  try {
    const result = run(INSTALL, ['--target', target, '--no-donate', '--dry-run']);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('anabol-orchestrator'));
    assert.deepStrictEqual(fs.readdirSync(target), []);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('install --help exits zero', () => {
  const result = run(INSTALL, ['--help']);
  assert.strictEqual(result.status, 0);
  assert.ok(result.stdout.includes('--no-donate'));
});

test('uninstall removes the Anabol meta-skill and legacy names, preserving user skills', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-donate-'));
  try {
    run(INSTALL, ['--target', target, '--no-donate']);
    fs.mkdirSync(path.join(target, 'security'));
    fs.writeFileSync(path.join(target, 'security', 'SKILL.md'), 'keep me\n');
    // Simulate the earlier 3-skill layout.
    fs.mkdirSync(path.join(target, 'anabol-ingest'));
    fs.writeFileSync(path.join(target, 'anabol-ingest', 'SKILL.md'), 'legacy\n');
    fs.mkdirSync(path.join(target, 'anabol-donate'));
    fs.writeFileSync(path.join(target, 'anabol-donate', 'SKILL.md'), 'legacy\n');

    const result = run(UNINSTALL, ['--target', target]);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(!fs.existsSync(path.join(target, 'anabol-orchestrator')));
    assert.ok(!fs.existsSync(path.join(target, 'anabol-ingest')));
    assert.ok(!fs.existsSync(path.join(target, 'anabol-donate')));
    assert.strictEqual(fs.readFileSync(path.join(target, 'security', 'SKILL.md'), 'utf8'), 'keep me\n');
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
