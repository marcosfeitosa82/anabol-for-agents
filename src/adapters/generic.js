'use strict';

/**
 * Generic adapter — the host-agnostic contract.
 *
 * An orchestrator only needs three things from Anabol:
 *   1. a skills root that contains one directory per registered skill;
 *   2. install(source) → merge, never add skills;
 *   3. read(id) → only the lines of that segment.
 *
 * Host-specific adapters (OpenCode, Claude, …) are thin wrappers around this.
 */

const fs = require('fs');
const path = require('path');
const { install, reindex, readById, INDEX_DIR, INDEX_FILE } = require('../pipeline');

/**
 * @param {{name?: string, skillsRoot: string, indexDir?: string, indexFile?: string}} opts
 */
function createAdapter(opts) {
  if (!opts || !opts.skillsRoot) throw new Error('createAdapter requires skillsRoot');

  const skillsRoot = path.resolve(opts.skillsRoot);
  const indexDir = path.join(skillsRoot, opts.indexDir || INDEX_DIR);
  const indexFile = path.join(indexDir, opts.indexFile || INDEX_FILE);

  return {
    name: opts.name || 'generic',
    skillsRoot,
    indexDir,
    indexFile,

    /** Merge a package into the existing structure. */
    install(sourceDir, installOpts = {}) {
      return install({ sourceDir, structureRoot: skillsRoot, ...installOpts });
    },

    /** Rebuild the line index after manual edits. */
    index() {
      return reindex({ structureRoot: skillsRoot });
    },

    /** List indexed segments (empty when there is no index yet). */
    list() {
      if (!fs.existsSync(indexFile)) return [];
      return JSON.parse(fs.readFileSync(indexFile, 'utf8')).segments;
    },

    /** Read one segment's text, with stale-index fallback. */
    read(id) {
      return readById({ structureRoot: skillsRoot, id });
    },

    /**
     * Native "read only this range" hint for hosts with offset/limit reads.
     * @param {{file:string,startLine:number,endLine:number}} segment
     */
    readHint(segment) {
      return {
        path: path.join(skillsRoot, segment.file),
        offset: segment.startLine,
        limit: segment.endLine - segment.startLine + 1,
      };
    },
  };
}

module.exports = { createAdapter };
