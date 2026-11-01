'use strict';

/**
 * Merge: write incoming skill content INTO an existing category skill as an
 * addressable segment. Pure functions only — no filesystem access — so the
 * behaviour is easy to test.
 *
 * Each merged segment is wrapped in a unique marker pair so its boundaries are
 * exact even if the sub-skill body itself contains markdown headings:
 *
 *   <!-- ANABOL:SEGMENT id=<id> -->
 *   ## <id>
 *
 *   <body>
 *   <!-- /ANABOL:SEGMENT id=<id> -->
 */

const { SEGMENTS_CLOSE } = require('./lib');

/** Marker helpers ------------------------------------------------------- */

function segmentOpen(id, description) {
  const desc = description ? ` desc=${encodeURIComponent(description)}` : '';
  return `<!-- ANABOL:SEGMENT id=${id}${desc} -->`;
}

function segmentClose(id) {
  return `<!-- /ANABOL:SEGMENT id=${id} -->`;
}

/**
 * Render one merged segment (with surrounding blank lines) from a sub-skill.
 * @param {{id: string, body: string, description?: string}} sub
 * @returns {string}
 */
function renderSegment(sub) {
  const body = String(sub.body || '').replace(/\r\n/g, '\n').trimEnd();
  return [
    segmentOpen(sub.id, sub.description),
    `## ${sub.id}`,
    '',
    body,
    segmentClose(sub.id),
    '',
  ].join('\n');
}

/**
 * Merge a set of sub-skills into a category skill's content.
 *
 * Segments are inserted just before the closing `ANABOL:SEGMENTS` marker. If the
 * marker is missing the content is appended at the end (best effort).
 *
 * @param {string} categoryContent  existing category SKILL.md text
 * @param {Array<{id: string, body: string}>} subs  sub-skills to add
 * @returns {string} new category content
 */
function mergeIntoCategory(categoryContent, subs) {
  const text = String(categoryContent).replace(/\r\n/g, '\n');
  if (!subs || subs.length === 0) return text;

  const rendered = subs.map(renderSegment).join('\n');
  const closeIdx = text.indexOf(SEGMENTS_CLOSE);

  if (closeIdx === -1) {
    return `${text.replace(/\s*$/, '')}\n\n${rendered}`;
  }

  const before = text.slice(0, closeIdx).replace(/\s*$/, '');
  const after = text.slice(closeIdx);
  return `${before}\n\n${rendered}${after}`;
}

/**
 * Remove a previously merged segment by id (idempotent re-install support).
 *
 * Matches the open marker with or without a `desc=` attribute, removes the
 * whole block (open marker → close marker) plus any blank lines it leaves
 * behind, and collapses the resulting gap.
 *
 * @param {string} categoryContent
 * @param {string} id
 * @returns {string}
 */
function removeSegment(categoryContent, id) {
  const text = String(categoryContent).replace(/\r\n/g, '\n');
  const openRe = new RegExp(`^<!-- ANABOL:SEGMENT id=${id}(?: desc=\\S*)? -->$`);
  const closeRe = new RegExp(`^<!-- /ANABOL:SEGMENT id=${id} -->$`);
  const lines = text.split('\n');

  const start = lines.findIndex((l) => openRe.test(l.trim()));
  if (start === -1) return text;

  let close = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (closeRe.test(lines[i].trim())) {
      close = i;
      break;
    }
  }
  if (close === -1) return text;

  let end = close + 1;
  while (end < lines.length && lines[end].trim() === '') end++;

  lines.splice(start, end - start);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Merge every assignment into its target category.
 *
 * @param {Record<string, string>} categoryContents  category id → current content
 * @param {Array<{id: string, body: string, category: string}>} subs
 * @returns {{contents: Record<string, string>, merged: Array<{id: string, category: string}>}}
 */
function mergeAll(categoryContents, subs) {
  const contents = { ...categoryContents };
  const merged = [];
  for (const sub of subs) {
    if (!(sub.category in contents)) {
      throw new Error(`unknown category: ${sub.category}`);
    }
    contents[sub.category] = mergeIntoCategory(contents[sub.category], [sub]);
    merged.push({ id: sub.id, category: sub.category });
  }
  return { contents, merged };
}

module.exports = {
  segmentOpen,
  segmentClose,
  renderSegment,
  mergeIntoCategory,
  removeSegment,
  mergeAll,
};
