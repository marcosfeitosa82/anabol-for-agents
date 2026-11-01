'use strict';

/**
 * Indexer: compute the exact line range and anchor of every merged segment in a
 * category skill. Parses the per-segment markers emitted by merge.js, so the
 * boundaries are exact regardless of the sub-skill body's own headings.
 *
 * Pure — operates on text, no filesystem access.
 */

const { parseFrontmatter, topTokens } = require('./lib');
const SEGMENT_RE = /^<!-- ANABOL:SEGMENT id=([a-z0-9-]+)(?: desc=(\S*))? -->$/;
const SEGMENT_CLOSE_RE = /^<!-- \/ANABOL:SEGMENT id=([a-z0-9-]+) -->$/;

/** The Anabol meta-skill is never a routing entry. */
const META_SKILL_ID = 'anabol-orchestrator';

/**
 * Decode an optional URL-encoded description attribute.
 * @param {string|undefined} raw
 * @returns {string}
 */
function decodeDesc(raw) {
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Strip fenced/inline code so keyword extraction favors prose concepts over
 * identifiers like `const`, `await`, or `return`.
 * @param {string} body
 * @returns {string}
 */
function proseOnly(body) {
  return String(body)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ');
}

/** Collapse YAML block scalars and stray whitespace into one display line. */
function oneLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Index all segments in one category file.
 *
 * @param {string} categoryId
 * @param {string} fileRel  path relative to the structure root
 * @param {string} content  full category SKILL.md text
 * @returns {Array<{id:string,category:string,file:string,startLine:number,endLine:number,anchor:string,description:string}>}
 */
function indexCategory(categoryId, fileRel, content) {
  const lines = String(content).replace(/\r\n/g, '\n').split('\n');
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const m = SEGMENT_RE.exec(lines[i].trim());
    if (!m) continue;
    const id = m[1];
    const description = oneLine(decodeDesc(m[2]));

    // Heading is the next non-empty line (`## <id>`).
    let headingLine = i + 1;
    while (headingLine < lines.length && lines[headingLine].trim() === '') headingLine++;
    const heading = lines[headingLine] ? lines[headingLine].trim() : `## ${id}`;

    // Find the matching close marker.
    let closeIdx = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const c = SEGMENT_CLOSE_RE.exec(lines[j].trim());
      if (c && c[1] === id) {
        closeIdx = j;
        break;
      }
    }
    if (closeIdx === -1) continue; // malformed segment — skip

    const startLine = headingLine + 1; // 1-based
    let endLine = closeIdx; // line before close marker (1-based) => closeIdx (0-based) == endLine
    // Trim trailing blank lines inside the segment.
    while (endLine > startLine && lines[endLine - 1].trim() === '') endLine--;

    const bodyText = lines.slice(startLine - 1, endLine).join('\n');
    const keywords = topTokens(proseOnly(bodyText), 40);

    out.push({
      id,
      category: categoryId,
      file: fileRel,
      startLine,
      endLine,
      anchor: heading,
      description,
      keywords,
    });
  }

  return out;
}

/**
 * Remove Anabol-generated markup from a category file: the TOC block, every
 * merged segment block, and the segment wrapper markers. The remaining text is
 * the category's own prose, which is what whole-category keywords are built
 * from (a category must not duplicate its segments' keywords).
 *
 * @param {string} text
 * @returns {string}
 */
function stripMergedBlocks(text) {
  return String(text)
    .replace(/<!-- ANABOL:TOC -->[\s\S]*?<!-- \/ANABOL:TOC -->\n?/g, '')
    .replace(/<!-- ANABOL:SEGMENT id=[a-z0-9-]+(?: desc=\S*)? -->[\s\S]*?<!-- \/ANABOL:SEGMENT id=[a-z0-9-]+ -->\n?/g, '')
    .replace(/<!-- ANABOL:SEGMENTS -->\n?/g, '')
    .replace(/<!-- \/ANABOL:SEGMENTS -->\n?/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Build one routing entry for every whole category skill.
 *
 * @param {Record<string,string>} categoryContents
 * @param {{fileFor?: (category: string) => string, excludeIds?: string[]}} [opts]
 * @returns {Array<{id:string,category:string,file:string,startLine:number,endLine:number,anchor:string,description:string,keywords:string[]}>}
 */
function indexWholeCategories(categoryContents, opts = {}) {
  const fileFor = opts.fileFor || ((c) => `${c}/SKILL.md`);
  const exclude = new Set(opts.excludeIds || []);
  exclude.add(META_SKILL_ID);

  const out = [];
  for (const [id, content] of Object.entries(categoryContents)) {
    if (exclude.has(id)) continue;
    const text = String(content).replace(/\r\n/g, '\n');
    const { frontmatter, body } = parseFrontmatter(text);
    const firstLine = text.split('\n')[0].trim();

    out.push({
      id,
      category: id,
      file: fileFor(id),
      startLine: 1,
      endLine: text.split('\n').length,
      anchor: firstLine || '---',
      description: oneLine(frontmatter.description || id.replace(/-/g, ' ')),
      keywords: topTokens(proseOnly(stripMergedBlocks(body)), 40),
    });
  }

  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/**
 * Build the full index from a map of category id → content.
 * @param {Record<string,string>} categoryContents
 * @param {{structureRoot?: string, fileFor?: (category: string) => string}} [opts]
 * @returns {{version:number, generatedAt:string, structureRoot?:string, segments:Array, categories:Array}}
 */
function buildIndex(categoryContents, opts = {}) {
  const fileFor = opts.fileFor || ((c) => `${c}/SKILL.md`);
  const segments = [];
  for (const [category, content] of Object.entries(categoryContents)) {
    // The meta-skill is infrastructure, not a routable capability. A package
    // merged into it must not leak a segment into `find`.
    if (category === META_SKILL_ID) continue;
    segments.push(...indexCategory(category, fileFor(category), content));
  }
  segments.sort((a, b) => (a.category === b.category ? a.startLine - b.startLine : a.category < b.category ? -1 : 1));

  // A category that is also a merged segment id would shadow that segment in
  // readById; the segment keeps the id and the whole-category entry is dropped.
  const categories = indexWholeCategories(categoryContents, {
    fileFor,
    excludeIds: segments.map((s) => s.id),
  });

  const index = {
    version: 2,
    generatedAt: new Date().toISOString(),
    segments,
    categories,
  };
  if (opts.structureRoot) index.structureRoot = opts.structureRoot;
  return index;
}

module.exports = {
  indexCategory,
  indexWholeCategories,
  buildIndex,
  stripMergedBlocks,
  decodeDesc,
  META_SKILL_ID,
  SEGMENT_RE,
  SEGMENT_CLOSE_RE,
};
