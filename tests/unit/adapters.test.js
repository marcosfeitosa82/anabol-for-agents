'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { resolveConfigDir, resolveSkillsRoot } = require('../../src/adapters/opencode');
const { createAdapter } = require('../../src/adapters/generic');

test('OPENCODE_CONFIG_DIR wins', () => {
  const env = { OPENCODE_CONFIG_DIR: '/custom/opencode', XDG_CONFIG_HOME: '/xdg' };
  assert.strictEqual(resolveConfigDir({ env, home: '/home/u' }), '/custom/opencode');
  assert.strictEqual(resolveSkillsRoot({ env, home: '/home/u' }), path.join('/custom/opencode', 'skills'));
});

test('XDG_CONFIG_HOME is used when the explicit dir is absent', () => {
  const env = { XDG_CONFIG_HOME: '/xdg' };
  assert.strictEqual(resolveConfigDir({ env, home: '/home/u' }), '/xdg/opencode');
});

test('falls back to ~/.config/opencode', () => {
  assert.strictEqual(resolveConfigDir({ env: {}, home: '/home/u' }), path.join('/home/u', '.config', 'opencode'));
});

test('generic adapter exposes a range hint for the host read tool', () => {
  const adapter = createAdapter({ name: 'test', skillsRoot: '/skills' });
  const hint = adapter.readHint({ file: 'security/SKILL.md', startLine: 31, endLine: 35 });
  assert.deepStrictEqual(hint, { path: path.join('/skills', 'security/SKILL.md'), offset: 31, limit: 5 });
});

test('generic adapter requires a skillsRoot', () => {
  assert.throws(() => createAdapter({}), /requires skillsRoot/);
});
