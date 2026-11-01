'use strict';

/**
 * Anabol for Agents — library entry point.
 *
 * Pure modules:
 *   lib        parsing helpers (frontmatter, markers, similarity)
 *   ingest     categorize incoming skills against existing categories
 *   merge      merge sub-skills into category skills as addressable segments
 *   indexer    compute exact line ranges + anchors
 *   segment    read only a segment (with stale-index fallback)
 *   discover   filesystem discovery of skills
 *   pipeline   install / reindex / readById orchestration
 */

const lib = require('./lib');
const ingest = require('./ingest');
const merge = require('./merge');
const indexer = require('./indexer');
const segment = require('./segment');
const discover = require('./discover');
const pipeline = require('./pipeline');
const router = require('./router');
const routeLog = require('./route-log');

module.exports = { lib, ingest, merge, indexer, segment, discover, pipeline, router, routeLog };
