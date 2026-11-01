'use strict';

/**
 * Ingest: discover the current skill structure and a source package's skills,
 * then decide which existing category each incoming skill should merge into.
 *
 * Pure with respect to its inputs — it takes already-parsed entries so the
 * categorization logic is unit-testable without touching the filesystem.
 */

const { slugify, overlapScore, containmentScore } = require('./lib');

/** How much of a category body to consider when matching (characters). */
const BODY_EXCERPT = 4000;

/**
 * @typedef {Object} SkillEntry
 * @property {string} id          kebab-case skill id (== directory name)
 * @property {string} file        path to SKILL.md relative to structure root
 * @property {string} [name]
 * @property {string} [description]
 * @property {string} [category]  explicit target category (from `anabol-category`)
 * @property {string} [body]      SKILL.md body, used to match rich categories
 */

/**
 * The short identity of a skill (name + description).
 * @param {SkillEntry} skill
 * @returns {string}
 */
function identityText(skill) {
  return `${skill.name || skill.id} ${skill.description || ''}`;
}

/**
 * Full matching text for a category: identity plus an excerpt of its body.
 * A category whose description is terse ("security review") can still match
 * "SQL injection" because its body talks about it.
 * @param {SkillEntry} skill
 * @returns {string}
 */
function candidateText(skill) {
  const body = String(skill.body || '').slice(0, BODY_EXCERPT);
  return body ? `${identityText(skill)} ${body}` : identityText(skill);
}

/**
 * Combined match score. Jaccard keeps short descriptions comparable; the
 * half-weighted containment term lets a long category body cover the incoming
 * concept without being penalised for its length.
 * @param {string} incomingText
 * @param {SkillEntry} candidate
 * @returns {number}
 */
function matchScore(incomingText, candidate) {
  const text = candidateText(candidate);
  return Math.max(overlapScore(incomingText, text), 0.5 * containmentScore(incomingText, text));
}

/**
 * Build a quick lookup of existing categories from the current structure.
 * @param {SkillEntry[]} existing
 * @returns {Map<string, SkillEntry>}
 */
function categoryMap(existing) {
  const map = new Map();
  for (const entry of existing) map.set(entry.id, entry);
  return map;
}

/**
 * Choose the target category for one incoming skill.
 *
 * Order of preference:
 *   1. explicit `category` on the incoming skill, if it matches an existing skill
 *   2. best description/name overlap against existing categories (>= threshold)
 *   3. null → caller decides (e.g. create the category)
 *
 * @param {SkillEntry} incoming
 * @param {SkillEntry[]} existing
 * @param {{threshold?: number}} [opts]
 * @returns {string|null} target category id
 */
function chooseCategory(incoming, existing, opts = {}) {
  const threshold = opts.threshold ?? 0.06;
  const map = categoryMap(existing);
  if (existing.length === 0) return null;

  // 1. explicit override
  if (incoming.category && map.has(incoming.category)) return incoming.category;

  // 2. overlap against each existing category's identity + body
  const incomingText = identityText(incoming);
  let best = null;
  let bestScore = 0;
  for (const candidate of existing) {
    const score = matchScore(incomingText, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate.id;
    }
  }
  if (best && bestScore >= threshold) return best;
  return null;
}

/**
 * Ingest a source package against the current structure.
 *
 * @param {SkillEntry[]} existing  current structure's skills (== categories)
 * @param {SkillEntry[]} source    incoming package's skills
 * @param {{threshold?: number}} [opts]
 * @returns {{
 *   assignments: Array<{source: SkillEntry, category: string|null}>,
 *   uncategorized: SkillEntry[],
 *   categoriesUsed: string[]
 * }}
 */
function ingest(existing, source, opts = {}) {
  const assignments = [];
  const uncategorized = [];
  const used = new Set();

  for (const incoming of source) {
    const category = chooseCategory(incoming, existing, opts);
    if (category) {
      used.add(category);
      assignments.push({ source: incoming, category });
    } else {
      uncategorized.push(incoming);
      assignments.push({ source: incoming, category: null });
    }
  }

  return { assignments, uncategorized, categoriesUsed: [...used] };
}

/**
 * Normalize a raw SKILL.md listing into a SkillEntry.
 * @param {{id: string, file: string, name?: string, description?: string, category?: string, body?: string}} o
 * @returns {SkillEntry}
 */
function toEntry(o) {
  const id = slugify(o.id);
  return {
    id,
    file: o.file,
    ...(o.name ? { name: o.name } : {}),
    ...(o.description ? { description: o.description } : {}),
    ...(o.category ? { category: slugify(o.category) } : {}),
    ...(o.body ? { body: o.body } : {}),
  };
}

/**
 * Pick the highest-overlap category regardless of threshold. Used when the
 * structure already has categories and we must NOT create new ones.
 * @param {SkillEntry} incoming
 * @param {SkillEntry[]} existing
 * @returns {string|null}
 */
function bestCategory(incoming, existing) {
  if (!existing.length) return null;
  const map = categoryMap(existing);
  if (incoming.category && map.has(incoming.category)) return incoming.category;
  const incomingText = identityText(incoming);
  let best = null;
  let bestScore = -1;
  for (const candidate of existing) {
    const score = matchScore(incomingText, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate.id;
    }
  }
  return best;
}

module.exports = { ingest, chooseCategory, bestCategory, categoryMap, toEntry };
