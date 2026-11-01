'use strict';

/**
 * Router: pure ranking over indexed segments and whole categories.
 *
 * No filesystem access and no dependencies. The indexer produces the entries;
 * the pipeline decides where they come from, and the CLI decides how to print
 * the result. Keeping the ranking here makes the threshold and the
 * segment-before-category rule unit-testable without a structure on disk.
 */

const { overlapScore, containmentScore } = require('./lib');

/** Default confidence below which a query is treated as off-domain. */
const DEFAULT_THRESHOLD = 0.35;

/**
 * Score one entry against a query.
 *
 * @param {string} query
 * @param {{id?:string, description?:string, keywords?:string[]}} entry
 * @returns {number} 0..1, rounded to 4 decimals
 */
function scoreEntry(query, entry) {
  const text = `${entry.id || ''} ${entry.description || ''} ${(entry.keywords || []).join(' ')}`;
  const score = Math.max(overlapScore(query, text), containmentScore(query, text));
  return Number(score.toFixed(4));
}

/**
 * Rank segments and whole categories for a query.
 *
 * @param {string} query
 * @param {{segments?: object[], categories?: object[]}} entries
 * @param {{threshold?: number, limit?: number, includeCategories?: boolean}} [opts]
 * @returns {Array<object>} entries with `score` and `kind`, best first
 */
function rankEntries(query, entries, opts = {}) {
  const threshold = opts.threshold === undefined ? DEFAULT_THRESHOLD : Number(opts.threshold);
  const includeCategories = opts.includeCategories !== false;

  const candidates = [];
  for (const entry of entries.segments || []) {
    candidates.push({ ...entry, kind: 'segment' });
  }
  if (includeCategories) {
    for (const entry of entries.categories || []) {
      candidates.push({ ...entry, kind: 'category' });
    }
  }

  const scored = candidates
    .map((entry) => ({ ...entry, score: scoreEntry(query, entry) }))
    .filter((entry) => entry.score >= threshold);

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.kind === b.kind ? 0 : a.kind === 'segment' ? -1 : 1) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  return scored.slice(0, Math.max(1, Number(opts.limit) || 1));
}

module.exports = { DEFAULT_THRESHOLD, scoreEntry, rankEntries };
