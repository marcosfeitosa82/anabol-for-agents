#!/usr/bin/env node
'use strict';

/**
 * Routing eval: measure top-1 accuracy and off-domain rejection.
 *
 *   node scripts/eval-routing.js
 *   node scripts/eval-routing.js --segments-only --threshold 0   # old baseline
 *   node scripts/eval-routing.js --self
 *   node scripts/eval-routing.js --min-accuracy 1 --json
 *
 * The structure defaults to $ANABOL_STRUCTURE or ~/.config/opencode/skills.
 * The index must already exist (run `anabol reindex` first).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { findSegments, INDEX_DIR, INDEX_FILE } = require('../src/pipeline');
const { DEFAULT_THRESHOLD } = require('../src/router');

const CASES_FILE = path.join(__dirname, 'routing-cases.json');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json' || a === '--self' || a === '--segments-only') {
      out[a.slice(2)] = true;
    } else if (a.startsWith('--')) {
      const key = a.slice(2);
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      out[key] = argv[++i];
    } else {
      out._.push(a);
    }
  }
  return out;
}

function pct(hit, total) {
  if (total === 0) return 0;
  return Math.round((hit / total) * 100);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const structure = path.resolve(
    args.structure || process.env.ANABOL_STRUCTURE || path.join(os.homedir(), '.config/opencode', 'skills'),
  );
  const threshold = args.threshold === undefined ? DEFAULT_THRESHOLD : Number(args.threshold);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error('--threshold must be a number in [0, 1]');
  }
  const includeCategories = !args['segments-only'];
  const cases = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8'));

  const topFor = (query) =>
    findSegments({ structureRoot: structure, query, limit: 1, threshold, includeCategories })[0] || null;

  const runCase = (c) => {
    const top = topFor(c.query);
    const hit = c.expect === 'NO_MATCH' ? !top : !!top && top.id === c.expect;
    return { query: c.query, expect: c.expect, top, hit };
  };

  const labeled = cases.cases.map(runCase);
  const offDomain = cases.offDomain.map((query) => {
    const top = topFor(query);
    return { query, top, rejected: !top };
  });
  const tasks = (cases.taskQueries || []).map(runCase);

  const top1 = labeled.filter((r) => r.hit).length;
  const rejected = offDomain.filter((r) => r.rejected).length;
  const taskHits = tasks.filter((r) => r.hit).length;
  const scores = labeled.filter((r) => r.top).map((r) => r.top.score);
  const lowestWinning = scores.length ? Math.min(...scores) : 0;

  let self = null;
  if (args.self) {
    const index = JSON.parse(fs.readFileSync(path.join(structure, INDEX_DIR, INDEX_FILE), 'utf8'));
    const entries = [
      ...(index.segments || []).map((entry) => ({ ...entry, kind: 'segment' })),
      ...(includeCategories ? (index.categories || []).map((entry) => ({ ...entry, kind: 'category' })) : []),
    ];
    const results = entries.map((entry) => {
      const query = entry.description || entry.id.replace(/-/g, ' ');
      const top = topFor(query);
      const hit = !!top && (top.id === entry.id || (entry.kind === 'category' && top.category === entry.id));
      return { id: entry.id, kind: entry.kind, query, top, hit };
    });
    self = { hit: results.filter((r) => r.hit).length, total: results.length, results };
  }

  const summary = {
    top1: `${top1}/${labeled.length}`,
    top1Pct: pct(top1, labeled.length),
    offDomain: `${rejected}/${offDomain.length}`,
    taskRouting: `${taskHits}/${tasks.length}`,
    lowestWinningScore: Number(lowestWinning.toFixed(4)),
    self: self ? `${self.hit}/${self.total}` : null,
    threshold,
    includeCategories,
  };

  if (args.json) {
    process.stdout.write(
      JSON.stringify({ summary, cases: labeled, offDomain, taskQueries: tasks, self }, null, 2) + '\n',
    );
  } else {
    for (const r of labeled) {
      const top = r.top ? `${r.top.id} (${r.top.score})` : 'NO_MATCH';
      process.stdout.write(`${r.hit ? 'HIT ' : 'MISS'} ${r.query} -> ${top} [expect ${r.expect}]\n`);
    }
    for (const r of offDomain) {
      const top = r.top ? `${r.top.id} (${r.top.score})` : 'NO_MATCH';
      process.stdout.write(`${r.rejected ? 'HIT ' : 'MISS'} off-domain: ${r.query} -> ${top}\n`);
    }
    for (const r of tasks) {
      const top = r.top ? `${r.top.id} (${r.top.score})` : 'NO_MATCH';
      process.stdout.write(`${r.hit ? 'HIT ' : 'MISS'} task: ${r.query} -> ${top} [expect ${r.expect}]\n`);
    }
    process.stdout.write(`top-1: ${summary.top1} (${summary.top1Pct}%)\n`);
    process.stdout.write(`off-domain rejected: ${summary.offDomain}\n`);
    process.stdout.write(`task-routing: ${summary.taskRouting}\n`);
    if (self) process.stdout.write(`self-routing: ${summary.self}\n`);
    process.stdout.write(`lowest winning score: ${summary.lowestWinningScore}\n`);
  }

  let min = args['min-accuracy'] === undefined ? 0 : Number(args['min-accuracy']);
  if (!Number.isFinite(min) || min < 0) throw new Error('--min-accuracy must be a non-negative number');
  if (min > 1) min /= 100; // accept 100 as well as 1
  const accuracy = labeled.length ? top1 / labeled.length : 0;
  if (accuracy < min) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`eval-routing: ${err.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, main };
