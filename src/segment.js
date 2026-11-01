'use strict';

/**
 * Segment reader: return ONLY the lines of a merged sub-skill, using the index's
 * line range as the fast path and falling back to marker/anchor lookup when the
 * file has changed and the stored lines are stale.
 *
 * This is the token-saving core: a task reads ~N lines of one segment instead of
 * the whole category file.
 */

const fs = require('fs');

const SEGMENT_OPEN_RE = /^<!-- ANABOL:SEGMENT id=([a-z0-9-]+)(?: desc=(\S*))? -->$/;
const SEGMENT_CLOSE_RE = /^<!-- \/ANABOL:SEGMENT id=([a-z0-9-]+) -->$/;

/**
 * Locate a segment's [startLine, endLine] (1-based, inclusive) by its markers.
 * @param {string[]} lines
 * @param {string} id
 * @returns {{startLine:number,endLine:number}|null}
 */
function locateByMarkers(lines, id) {
  for (let i = 0; i < lines.length; i++) {
    const m = SEGMENT_OPEN_RE.exec(lines[i].trim());
    if (!m || m[1] !== id) continue;
    let heading = i + 1;
    while (heading < lines.length && lines[heading].trim() === '') heading++;
    for (let j = i + 1; j < lines.length; j++) {
      const c = SEGMENT_CLOSE_RE.exec(lines[j].trim());
      if (c && c[1] === id) {
        let end = j;
        while (end > heading && lines[end - 1].trim() === '') end--;
        return { startLine: heading + 1, endLine: end };
      }
    }
  }
  return null;
}

/**
 * Read a segment from full content.
 *
 * @param {string} content  full category file text
 * @param {{id:string,startLine:number,endLine:number,anchor:string}} segment
 * @returns {{text:string,startLine:number,endLine:number,usedFallback:boolean,linesRead:number}}
 */
function readSegment(content, segment) {
  const lines = String(content).replace(/\r\n/g, '\n').split('\n');
  const anchorLine = lines[segment.startLine - 1];
  const anchorMatches = typeof anchorLine === 'string' && anchorLine.trim() === segment.anchor.trim();

  let range = null;
  let usedFallback = false;

  if (anchorMatches && segment.endLine >= segment.startLine) {
    range = { startLine: segment.startLine, endLine: segment.endLine };
  } else {
    range = locateByMarkers(lines, segment.id);
    usedFallback = true;
  }

  if (!range) {
    throw new Error(`segment not found: ${segment.id}`);
  }

  const text = lines.slice(range.startLine - 1, range.endLine).join('\n');
  return {
    text,
    startLine: range.startLine,
    endLine: range.endLine,
    usedFallback,
    linesRead: range.endLine - range.startLine + 1,
  };
}

/**
 * Read a segment directly from a file.
 * @param {string} filePath
 * @param {{id:string,startLine:number,endLine:number,anchor:string}} segment
 */
function readSegmentFile(filePath, segment) {
  return readSegment(fs.readFileSync(filePath, 'utf8'), segment);
}

module.exports = { readSegment, readSegmentFile, locateByMarkers };
