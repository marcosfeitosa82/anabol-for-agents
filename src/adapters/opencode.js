'use strict';

/**
 * OpenCode adapter.
 *
 * OpenCode registers every directory containing a SKILL.md under
 * `<config>/skills`. Anabol therefore merges into those directories and never
 * adds new ones. Config resolution follows OpenCode's own rules:
 *
 *   OPENCODE_CONFIG_DIR  → explicit config directory
 *   XDG_CONFIG_HOME      → $XDG_CONFIG_HOME/opencode
 *   otherwise            → ~/.config/opencode
 */

const os = require('os');
const path = require('path');
const { createAdapter } = require('./generic');

/**
 * @param {{env?: NodeJS.ProcessEnv, home?: string}} [opts]
 * @returns {string} absolute OpenCode config directory
 */
function resolveConfigDir(opts = {}) {
  const env = opts.env || process.env;
  const home = opts.home || os.homedir();

  if (env.OPENCODE_CONFIG_DIR) return path.resolve(env.OPENCODE_CONFIG_DIR);
  if (env.XDG_CONFIG_HOME) return path.resolve(env.XDG_CONFIG_HOME, 'opencode');
  return path.join(home, '.config', 'opencode');
}

/**
 * @param {{env?: NodeJS.ProcessEnv, home?: string, configDir?: string}} [opts]
 * @returns {string} absolute skills root
 */
function resolveSkillsRoot(opts = {}) {
  const configDir = opts.configDir || resolveConfigDir(opts);
  return path.join(path.resolve(configDir), 'skills');
}

/**
 * Build an Anabol adapter bound to an OpenCode skills root.
 * @param {{skillsRoot?: string, configDir?: string, env?: NodeJS.ProcessEnv, home?: string}} [opts]
 */
function createOpenCodeAdapter(opts = {}) {
  const skillsRoot = opts.skillsRoot || resolveSkillsRoot(opts);
  return createAdapter({ name: 'opencode', skillsRoot });
}

module.exports = { resolveConfigDir, resolveSkillsRoot, createOpenCodeAdapter };
