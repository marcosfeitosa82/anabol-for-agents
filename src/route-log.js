'use strict';

/**
 * Opt-in, local route log.
 *
 * `find` is read-only by default. When the caller passes `--log`, one JSON
 * line per decision is appended to `<structureRoot>/.anabol/route-log.jsonl`.
 * Nothing is sent anywhere; the file exists so descriptions and keywords can
 * be improved from real misses.
 */

const fs = require('fs');
const path = require('path');

const ROUTE_LOG = 'route-log.jsonl';

function logPath(structureRoot) {
  return path.join(structureRoot, '.anabol', ROUTE_LOG);
}

/**
 * Append one routing decision.
 * @param {string} structureRoot
 * @param {object} record
 */
function appendRouteLog(structureRoot, record) {
  const file = logPath(structureRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
}

/**
 * Read the log, ignoring malformed lines.
 * @param {string} structureRoot
 * @returns {object[]}
 */
function readRouteLog(structureRoot) {
  const file = logPath(structureRoot);
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record && typeof record === 'object') out.push(record);
    } catch {
      // A truncated or hand-edited line must not break the report.
    }
  }
  return out;
}

/**
 * Summarize routing decisions for the report.
 * @param {object[]} records
 * @returns {{total:number, matched:number, noMatch:number, byTop:Array<[string,number]>, misses:object[]}}
 */
function summarizeRouteLog(records) {
  const counts = new Map();
  let matched = 0;
  for (const record of records) {
    if (!record.matched) continue;
    matched++;
    const top = record.top;
    if (!top) continue;
    counts.set(top, (counts.get(top) || 0) + 1);
  }
  const byTop = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return {
    total: records.length,
    matched,
    noMatch: records.length - matched,
    byTop,
    misses: records.filter((record) => !record.matched),
  };
}

module.exports = { ROUTE_LOG, appendRouteLog, readRouteLog, summarizeRouteLog };
