'use strict';

/**
 * Shared parsing helpers for Anabol for Agents.
 *
 * Deterministic, dependency-free utilities for reading SKILL.md frontmatter and
 * locating the Anabol marker blocks inside a category skill. Everything here is
 * pure (no I/O) so it is trivial to unit test.
 */

const path = require('path');

/** Marker pair that wraps the generated table of contents. */
const TOC_OPEN = '<!-- ANABOL:TOC -->';
const TOC_CLOSE = '<!-- /ANABOL:TOC -->';

/** Marker pair that wraps all merged sub-skill bodies. */
const SEGMENTS_OPEN = '<!-- ANABOL:SEGMENTS -->';
const SEGMENTS_CLOSE = '<!-- /ANABOL:SEGMENTS -->';

/**
 * Parse YAML-ish frontmatter (flat `key: value` pairs) from a SKILL.md body.
 *
 * Handles quoted values and ignores comments/nested indentation. This is
 * intentionally a small subset — enough for `name`, `description`, and
 * `anabol-category` — not a general YAML engine.
 *
 * @param {string} raw File contents.
 * @returns {{frontmatter: Record<string,string>, body: string, bodyStartLine: number}}
 *   `bodyStartLine` is the 1-based line number of the first body line.
 */
function parseFrontmatter(raw) {
  const text = raw.replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!match) {
    return { frontmatter: {}, body: text, bodyStartLine: 1 };
  }

  const fmLines = match[1].split('\n');
  const frontmatter = {};
  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\s/.test(line)) continue; // nested/continuation line of a handled key
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();

    // YAML block scalar: >, >-, >+, |, |-, |+ (with optional indent indicator).
    if (/^[|>][+-]?\d*$/.test(value)) {
      const folded = value.startsWith('>');
      const strip = value.endsWith('-');
      const block = [];
      let indent = null;
      let j = i + 1;
      for (; j < fmLines.length; j++) {
        const l = fmLines[j];
        if (l.trim() === '') {
          block.push('');
          continue;
        }
        const m = /^(\s+)/.exec(l);
        if (!m) break; // next top-level key
        if (indent === null) indent = m[1].length;
        block.push(l.slice(Math.min(indent, m[1].length)));
      }
      i = j - 1;
      while (block.length && block[block.length - 1] === '') block.pop();
      value = folded
        ? block.join('\n').replace(/\n{2,}/g, '\u0000').replace(/\n/g, ' ').replace(/\u0000/g, '\n')
        : block.join('\n');
      if (strip) value = value.replace(/\n+$/, '');
      frontmatter[key] = value.trim();
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    frontmatter[key] = value;
  }

  const bodyStartLine = match[1].split('\n').length + 3; // '---' + fm lines + '---'
  return { frontmatter, body: match[2], bodyStartLine };
}

/**
 * Find a marker block's open/close line numbers (1-based, inclusive).
 *
 * @param {string[]} lines File split into lines.
 * @param {string} open Opening marker.
 * @param {string} close Closing marker.
 * @returns {{openLine:number, closeLine:number}|null}
 */
function findMarker(lines, open, close) {
  const openLine = lines.findIndex((l) => l.includes(open));
  if (openLine === -1) return null;
  const closeLine = lines.findIndex((l, i) => i > openLine && l.includes(close));
  if (closeLine === -1) return null;
  return { openLine: openLine + 1, closeLine: closeLine + 1 };
}

/**
 * Convert a skill name/id to a stable kebab-case id.
 * @param {string} value
 * @returns {string}
 */
function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolve a path relative to a structure root, guaranteeing it never escapes the root.
 * @param {string} root
 * @param {string} relative
 * @returns {string}
 */
function safeJoin(root, relative) {
  const abs = path.resolve(root, relative);
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
    throw new Error(`path escapes structure root: ${relative}`);
  }
  return abs;
}

/** Words too generic to help with category matching. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with', 'on', 'by',
  'is', 'are', 'this', 'that', 'it', 'as', 'at', 'be', 'use', 'using', 'skill',
  'skills', 'when', 'before', 'after', 'any', 'all', 'your', 'you',
  // generic verbs/nouns that otherwise create false matches across categories
  'write', 'writer', 'writing', 'wrote', 'read', 'reader', 'reading',
  'create', 'make', 'add', 'get', 'set', 'run', 'running', 'work', 'working',
  'thing', 'things', 'structure', 'clear', 'focus', 'focused',
]);

/**
 * Light, dependency-free stemmer. Handles the common English suffixes that make
 * otherwise-identical words miss each other (vulnerabilities/vulnerability,
 * tests/testing/test, scanning/scan). Not linguistically perfect — good enough
 * for category matching.
 * @param {string} word
 * @returns {string}
 */
function stem(word) {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('sses')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  if (w.length > 5 && w.endsWith('tion')) w = w.slice(0, -3);
  return w;
}

/**
 * Tokenize text into a de-duplicated set of meaningful, stemmed words.
 * @param {string} text
 * @returns {Set<string>}
 */
function tokenize(text) {
  const out = new Set();
  for (const word of String(text || '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length > 2 && !STOPWORDS.has(word)) out.add(stem(word));
  }
  return out;
}

/**
 * Two tokens "match" if equal, or if one is a prefix of the other (min length 4).
 * Catches scan/scanning-style variants the stemmer leaves alone.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function tokensMatch(a, b) {
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5) {
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    return long.startsWith(short) && long.length - short.length <= 2;
  }
  return false;
}

/**
 * Jaccard-ish overlap score between two text samples (0..1), stem-aware.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function overlapScore(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const wa of ta) {
    for (const wb of tb) {
      if (tokensMatch(wa, wb)) {
        shared++;
        break;
      }
    }
  }
  return shared / (ta.size + tb.size - shared);
}

/**
 * Containment score: how much of `needle` is covered by `haystack` (0..1).
 *
 * Unlike Jaccard, this is not penalised by a long haystack — which is exactly
 * what we want when matching a short incoming description against a category
 * skill whose body is long. It is used together with overlapScore so entries
 * without a body still behave like plain description matching.
 *
 * @param {string} needle
 * @param {string} haystack
 * @returns {number}
 */
function containmentScore(needle, haystack) {
  const tn = tokenize(needle);
  const th = tokenize(haystack);
  if (tn.size === 0 || th.size === 0) return 0;
  let shared = 0;
  for (const wn of tn) {
    for (const wh of th) {
      if (tokensMatch(wn, wh)) {
        shared++;
        break;
      }
    }
  }
  return shared / tn.size;
}

/**
 * Most frequent meaningful tokens in a text, best first. Used to index a
 * segment's body keywords at merge time so `find` can route terse descriptions
 * (e.g. "security review" → a body that talks about SQL injection) without
 * reading the body at task time.
 *
 * @param {string} text
 * @param {number} [limit]
 * @returns {string[]}
 */
function topTokens(text, limit = 24) {
  const counts = new Map();
  for (const word of String(text || '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length <= 2 || STOPWORDS.has(word)) continue;
    const stemmed = stem(word);
    counts.set(stemmed, (counts.get(stemmed) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, limit)
    .map(([word]) => word);
}

module.exports = {
  TOC_OPEN,
  TOC_CLOSE,
  SEGMENTS_OPEN,
  SEGMENTS_CLOSE,
  parseFrontmatter,
  findMarker,
  slugify,
  safeJoin,
  tokenize,
  stem,
  tokensMatch,
  overlapScore,
  containmentScore,
  topTokens,
};
