'use strict';

/**
 * Filesystem discovery for Anabol for Agents.
 *
 * - discoverSkills(root): the category skills already installed in a structure.
 * - discoverSource(dir):  the skills inside a package the user wants to install.
 *
 * A "skill" is a directory containing a SKILL.md. Its id is the directory name
 * (slugified). Frontmatter `name`, `description`, and `anabol-category` are read.
 */

const fs = require('fs');
const path = require('path');
const { parseFrontmatter, slugify } = require('./lib');

/**
 * @typedef {Object} DiscoveredSkill
 * @property {string} id
 * @property {string} file      absolute path to SKILL.md
 * @property {string} relFile   path relative to the scanned root
 * @property {string} [name]
 * @property {string} [description]
 * @property {string} [category]
 * @property {string} body
 */

/**
 * Read one SKILL.md into a DiscoveredSkill (without id/relFile yet).
 * @param {string} filePath
 * @returns {{name?:string,description?:string,category?:string,body:string}}
 */
function readSkill(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(raw);
  return {
    ...(frontmatter.name ? { name: frontmatter.name } : {}),
    ...(frontmatter.description ? { description: frontmatter.description } : {}),
    ...(frontmatter['anabol-category'] ? { category: slugify(frontmatter['anabol-category']) } : {}),
    body,
  };
}

/**
 * List immediate sub-directories that contain a SKILL.md.
 * @param {string} root
 * @returns {DiscoveredSkill[]}
 */
function discoverSkills(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const file = path.join(root, entry.name, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    out.push({ id: slugify(entry.name), file, relFile: path.posix.join(entry.name, 'SKILL.md'), ...readSkill(file) });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Recursively find every SKILL.md under a source directory and treat each as an
 * incoming skill. The id is the parent directory name.
 * @param {string} dir
 * @returns {DiscoveredSkill[]}
 */
function discoverSource(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;

  /** @type {string[]} */
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        const parent = path.basename(current);
        out.push({
          id: slugify(parent),
          file: full,
          relFile: path.relative(dir, full),
          ...readSkill(full),
        });
      }
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Make ids unique within a list by suffixing `-2`, `-3`, ... on collisions.
 * @param {DiscoveredSkill[]} skills
 * @returns {DiscoveredSkill[]}
 */
function dedupeIds(skills) {
  const seen = new Map();
  return skills.map((s) => {
    const n = (seen.get(s.id) || 0) + 1;
    seen.set(s.id, n);
    return n === 1 ? s : { ...s, id: `${s.id}-${n}` };
  });
}

module.exports = { discoverSkills, discoverSource, readSkill, dedupeIds };
