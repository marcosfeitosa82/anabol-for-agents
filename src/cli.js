#!/usr/bin/env node
'use strict';

/**
 * Anabol for Agents — command line.
 *
 *   anabol install --source <pkg-dir> --structure <skills-root> [--dry-run]
 *   anabol reindex --structure <skills-root>
 *   anabol read --structure <skills-root> --id <segment-id>
 *   anabol list --structure <skills-root>
 */

const { install, reindex, readById, findSegments, INDEX_DIR, INDEX_FILE } = require('./pipeline');
const { appendRouteLog } = require('./route-log');
const { DEFAULT_THRESHOLD } = require('./router');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (key === 'dry-run' || key === 'json' || key === 'log' || key === 'segments-only') {
        out[key] = true;
      } else {
        out[key] = argv[++i];
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function print(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  const structure = args.structure || process.cwd();

  try {
    if (command === 'install') {
      if (!args.source) throw new Error('install requires --source <pkg-dir>');
      const report = install({ sourceDir: args.source, structureRoot: structure, dryRun: !!args['dry-run'] });
      print(
        {
          ok: report.ok,
          dryRun: report.dryRun,
          skillsBefore: report.skillsBefore,
          skillsAfter: report.skillsAfter,
          countUnchanged: report.countUnchanged,
          merged: report.merged,
          skipped: report.skipped,
          segments: report.index.length,
          categories: (report.categories || []).length,
        },
        true,
      );
      return;
    }

    if (command === 'reindex') {
      const index = reindex({ structureRoot: structure, write: !args['dry-run'] });
      print({ ok: true, segments: index.segments.length, categories: (index.categories || []).length });
      return;
    }

    if (command === 'read') {
      if (!args.id) throw new Error('read requires --id <segment-id>');
      const r = readById({ structureRoot: structure, id: args.id });
      if (args.json) {
        print({
          id: args.id,
          category: r.segment.category,
          file: r.segment.file,
          startLine: r.startLine,
          endLine: r.endLine,
          usedFallback: r.usedFallback,
          linesRead: r.linesRead,
          whole: r.whole,
          assets: r.segment.assets || [],
          text: r.text,
        });
      } else {
        process.stdout.write(r.text + '\n');
      }
      return;
    }

    if (command === 'find') {
      if (!args.query) throw new Error('find requires --query <text>');
      let threshold;
      if (args.threshold !== undefined) {
        threshold = Number(args.threshold);
        if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
          throw new Error('--threshold must be a number in [0, 1]');
        }
      }
      const results = findSegments({
        structureRoot: structure,
        query: args.query,
        limit: args.limit ? Number(args.limit) : 1,
        threshold,
        includeCategories: !args['segments-only'],
        log: !!args.log,
      });
      if (args.log) {
        appendRouteLog(structure, {
          at: new Date().toISOString(),
          query: args.query,
          threshold: threshold === undefined ? DEFAULT_THRESHOLD : threshold,
          top: results[0]?.id || null,
          score: results[0]?.score || 0,
          matched: results.length > 0,
          kind: results[0]?.kind || null,
        });
      }
      if (args.json) {
        print(results);
      } else if (results.length === 0) {
        process.stdout.write('NO_MATCH\n');
      } else {
        for (const r of results) {
          process.stdout.write(`${r.id}\t${r.file}\t${r.startLine}-${r.endLine}\t${r.description || ''}\t${r.score}\n`);
        }
      }
      return;
    }

    if (command === 'list') {
      const idxPath = path.join(structure, INDEX_DIR, INDEX_FILE);
      if (!fs.existsSync(idxPath)) throw new Error(`no index at ${idxPath}; run "anabol reindex" first`);
      const index = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
      for (const s of index.segments) {
        process.stdout.write(`${s.id}\t${s.category}\t${s.startLine}-${s.endLine}\t${s.description || ''}\n`);
      }
      return;
    }

    process.stderr.write(
      'usage: anabol <install|reindex|find|read|list> [--source DIR] [--structure DIR] [--query TEXT] [--id ID] [--limit N] [--dry-run] [--json]\n',
    );
    process.exitCode = 1;
  } catch (err) {
    process.stderr.write(`anabol: ${err.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { parseArgs, main };
