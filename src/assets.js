'use strict';

/**
 * Assets: a merged skill may ship files next to its SKILL.md (`references/`,
 * `scripts/`, `assets/`, templates, ...). Merging only the body would leave
 * those links dangling, so install copies them into the category and rewrites
 * the relative references to the new location:
 *
 *   <category>/anabol-assets/<segment-id>/<original-relative-path>
 *
 * Pure path/regex helpers plus a thin filesystem layer. No dependencies.
 */

const fs = require('fs');
const path = require('path');
const { safeJoin } = require('./lib');

const ASSET_ROOT = 'anabol-assets';
const SKIP_TOP_LEVEL = new Set(['SKILL.md', 'README.md']);

/**
 * List every file shipped with a source skill, relative to its directory,
 * excluding the top-level SKILL.md and README.md.
 *
 * @param {string} skillDir absolute path of the skill directory
 * @returns {string[]} POSIX-style relative paths, sorted
 */
function collectAssets(skillDir) {
  const out = [];
  if (!fs.existsSync(skillDir)) return out;

  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name.startsWith('.')) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!prefix && SKIP_TOP_LEVEL.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile()) out.push(rel);
    }
  };

  walk(skillDir, '');
  return out;
}

/**
 * Where a segment's assets live inside its category directory.
 * @param {string} segmentId
 * @returns {string} category-relative directory
 */
function assetDir(segmentId) {
  return `${ASSET_ROOT}/${segmentId}`;
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite relative references to shipped assets so they resolve from the
 * category SKILL.md. Only paths that exist in `assets` are touched.
 *
 * Handles markdown links/images (`[x](references/a.md)`, fragments and titles),
 * inline code (`` `scripts/run.sh` ``), and HTML `src`/`href` attributes.
 *
 * @param {string} body
 * @param {string} segmentId
 * @param {string[]} assets
 * @returns {string}
 */
function rewriteAssetRefs(body, segmentId, assets) {
  if (!assets || assets.length === 0) return body;
  const prefix = `${assetDir(segmentId)}/`;
  let text = String(body);

  for (const asset of assets) {
    const target = `${prefix}${asset}`;
    for (const form of [asset, `./${asset}`]) {
      const re = escapeRe(form);

      text = text.replace(
        new RegExp(`\\]\\(${re}(#[^)\\s]*)?(\\s+"[^"]*")?\\)`, 'g'),
        (_m, frag = '', title = '') => `](${target}${frag}${title})`,
      );

      text = text.replace(new RegExp('`' + re + '`', 'g'), '`' + target + '`');

      text = text.replace(
        new RegExp(`((?:src|href)=["'])${re}(["'])`, 'g'),
        (_m, open, close) => `${open}${target}${close}`,
      );
    }
  }

  return text;
}

/**
 * Copy a skill's assets into its category and return the category-relative
 * paths for the index. Replaces any previous copy, so reinstalls are clean.
 *
 * @param {string} structureRoot
 * @param {string} category
 * @param {string} segmentId
 * @param {string} skillDir
 * @param {string[]} assets
 * @returns {string[]} category-relative asset paths
 */
function copyAssets(structureRoot, category, segmentId, skillDir, assets) {
  const relDir = assetDir(segmentId);
  const destRoot = safeJoin(structureRoot, `${category}/${relDir}`);
  fs.rmSync(destRoot, { recursive: true, force: true });
  if (!assets || assets.length === 0) return [];

  for (const rel of assets) {
    const src = safeJoin(skillDir, rel);
    const dst = safeJoin(destRoot, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }

  return assets.map((rel) => `${category}/${relDir}/${rel}`);
}

/**
 * Remove a segment's assets from a category directory (if any).
 * @param {string} structureRoot
 * @param {string} category
 * @param {string} segmentId
 */
function removeAssets(structureRoot, category, segmentId) {
  const dest = safeJoin(structureRoot, `${category}/${assetDir(segmentId)}`);
  fs.rmSync(dest, { recursive: true, force: true });
}

/**
 * List the assets currently on disk for a segment.
 * @param {string} structureRoot
 * @param {string} category
 * @param {string} segmentId
 * @returns {string[]} structure-relative paths
 */
function listAssets(structureRoot, category, segmentId) {
  const relDir = assetDir(segmentId);
  const root = safeJoin(structureRoot, `${category}/${relDir}`);
  if (!fs.existsSync(root)) return [];

  const out = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name.startsWith('.')) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else if (entry.isFile()) out.push(`${category}/${relDir}/${rel}`);
    }
  };
  walk(root, '');
  return out;
}

/**
 * Attach an `assets` array to each index segment, using a resolver. Segments
 * without assets stay unchanged.
 *
 * @param {{segments:Array}} index
 * @param {(segment:object)=>string[]} resolver
 * @returns {{segments:Array}} the same index, mutated
 */
function attachAssets(index, resolver) {
  for (const segment of index.segments) {
    const assets = resolver(segment) || [];
    if (assets.length > 0) segment.assets = assets;
    else delete segment.assets;
  }
  return index;
}

module.exports = {
  ASSET_ROOT,
  collectAssets,
  assetDir,
  rewriteAssetRefs,
  copyAssets,
  removeAssets,
  listAssets,
  attachAssets,
};
