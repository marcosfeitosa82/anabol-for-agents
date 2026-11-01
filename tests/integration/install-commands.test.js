'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const INSTALL = path.join(ROOT, 'scripts', 'install.sh');
const WRAPPER = path.join(ROOT, 'scripts', 'bin', 'anf');

function runInstall(args) {
  return execFileSync('sh', [INSTALL, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ANABOL_NO_DONATE: '1' },
  });
}

test('install.sh --commands refreshes an existing anf wrapper', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-install-'));
  const skills = path.join(base, 'skills');
  const bin = path.join(base, 'bin');
  try {
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, 'anf'), '#!/bin/sh\necho stale\n', 'utf8');

    runInstall(['--target', skills, '--commands', '--bin-dir', bin]);

    assert.ok(fs.existsSync(path.join(skills, 'anabol-orchestrator', 'SKILL.md')));
    assert.strictEqual(fs.readFileSync(path.join(bin, 'anf'), 'utf8'), fs.readFileSync(WRAPPER, 'utf8'));
    assert.ok(fs.existsSync(path.join(bin, 'anr')));
    assert.ok(fs.statSync(path.join(bin, 'anf')).mode & 0o111, 'anf is executable');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('install.sh leaves wrappers alone but points to install-commands.sh by default', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-install-'));
  const skills = path.join(base, 'skills');
  const bin = path.join(base, 'bin');
  try {
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, 'anf'), '#!/bin/sh\necho stale\n', 'utf8');

    const stdout = runInstall(['--target', skills]);

    assert.match(stdout, /install-commands\.sh/);
    assert.strictEqual(fs.readFileSync(path.join(bin, 'anf'), 'utf8'), '#!/bin/sh\necho stale\n');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
