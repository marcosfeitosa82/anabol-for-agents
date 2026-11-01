#!/usr/bin/env node
'use strict';

/**
 * Summarize the opt-in local route log.
 *
 *   node scripts/route-report.js
 *   node scripts/route-report.js --structure ~/.config/opencode/skills --json
 */

const os = require('os');
const path = require('path');
const { readRouteLog, summarizeRouteLog } = require('../src/route-log');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a.startsWith('--')) {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      out[a.slice(2)] = argv[++i];
    } else {
      throw new Error(`unexpected argument: ${a}`);
    }
  }
  return out;
}

function printHuman(summary) {
  process.stdout.write(`total: ${summary.total}\n`);
  process.stdout.write(`matched: ${summary.matched}\n`);
  process.stdout.write(`noMatch: ${summary.noMatch}\n`);
  if (summary.byTop.length) {
    process.stdout.write('top matches:\n');
    for (const [id, count] of summary.byTop) process.stdout.write(`  ${id}\t${count}\n`);
  }
  const misses = summary.misses.slice(-20);
  if (misses.length) {
    process.stdout.write('last misses:\n');
    for (const miss of misses) process.stdout.write(`  ${miss.query}\n`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const structure = path.resolve(
    args.structure || process.env.ANABOL_STRUCTURE || path.join(os.homedir(), '.config/opencode', 'skills'),
  );
  const summary = summarizeRouteLog(readRouteLog(structure));
  if (args.json) process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  else printHuman(summary);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`route-report: ${err.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, main };
