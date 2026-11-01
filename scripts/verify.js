#!/usr/bin/env node
'use strict';

/**
 * End-to-end verification of an installed Anabol structure.
 *
 * It never modifies the structure you point at. It:
 *
 *   1. dry-runs a package install against the real structure and proves the
 *      structure is byte-identical afterwards;
 *   2. merges the same package into a temp copy and checks that the registered
 *      skill count does not grow;
 *   3. verifies every indexed line range points at exactly its segment;
 *   4. verifies each segment id appears exactly once;
 *   5. routes task queries with `find` and reads only the winning segment;
 *   6. verifies a reinstall is byte-identical (including index.generatedAt);
 *   7. verifies a stale index falls back to markers;
 *   8. verifies reindex reproduces the same ranges;
 *   9. verifies the real structure was not touched.
 *
 * Usage:
 *   node scripts/verify.js
 *   node scripts/verify.js --structure ~/.config/opencode/skills
 *   node scripts/verify.js --structure DIR --source PKG   # real package
 *   node scripts/verify.js --json
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const { install, reindex, readById, findSegments } = require(path.join(ROOT, 'src/pipeline'));
const { discoverSkills, discoverSource } = require(path.join(ROOT, 'src/discover'));
const { appendRouteLog, readRouteLog } = require(path.join(ROOT, 'src/route-log'));

const META = 'anabol-orchestrator';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
    else throw new Error(`unexpected argument: ${a}`);
  }
  return out;
}

function usage() {
  console.log(`Usage: node scripts/verify.js [options]

  --structure DIR   installed skills root (default: $OPENCODE_CONFIG_DIR/skills
                    or ~/.config/opencode/skills)
  --source DIR      package to install (default: the structure's own skills,
                    renamed pkg1-<id>, so nothing collides)
  --json            print machine-readable results
`);
}

function hashTree(root) {
  const h = crypto.createHash('sha256');
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        h.update(path.relative(root, full));
        h.update(fs.readFileSync(full));
      }
    }
  };
  walk(root);
  return h.digest('hex');
}

function hashSkills(root) {
  const h = crypto.createHash('sha256');
  for (const s of discoverSkills(root).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    h.update(s.id);
    h.update(fs.readFileSync(s.file));
  }
  return h.digest('hex');
}

/**
 * Remove Anabol's TOC and merged segments, restoring the plain skill body.
 * Used to build a clean baseline for the verification run, so a structure that
 * already has merged segments does not produce nested segment markers.
 *
 * @param {string} text
 * @returns {string}
 */
function stripAnabol(text) {
  return text
    .replace(/<!-- ANABOL:TOC -->[\s\S]*?<!-- \/ANABOL:TOC -->\n?/g, '')
    .replace(/<!-- ANABOL:SEGMENT id=[a-z0-9-]+(?: desc=\S*)? -->[\s\S]*?<!-- \/ANABOL:SEGMENT id=[a-z0-9-]+ -->\n?/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

function verify(opts) {
  const results = [];
  const check = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });

  const structure = opts.structure;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-verify-'));
  const pkg = path.join(work, 'package');
  const copy = path.join(work, 'structure');
  fs.mkdirSync(pkg, { recursive: true });
  fs.mkdirSync(copy, { recursive: true });

  try {
    const baseSkills = discoverSkills(structure).filter((s) => s.id !== META);
    for (const s of baseSkills) {
      const stripped = stripAnabol(fs.readFileSync(s.file, 'utf8'));
      const dir = path.join(copy, s.id);
      fs.cpSync(path.dirname(s.file), dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), stripped, 'utf8');
      const dst = path.join(pkg, `pkg1-${s.id}`);
      fs.mkdirSync(dst, { recursive: true });
      fs.writeFileSync(path.join(dst, 'SKILL.md'), stripped, 'utf8');
    }

    const liveCount = discoverSkills(structure).length;

    // 1. dry run
    const liveIndex = path.join(structure, '.anabol', 'index.json');
    const indexBefore = fs.existsSync(liveIndex) ? fs.readFileSync(liveIndex, 'utf8') : null;
    const liveBefore = hashTree(structure);
    const dry = install({ sourceDir: pkg, structureRoot: structure, dryRun: true });
    const liveAfter = hashTree(structure);
    const indexAfter = fs.existsSync(liveIndex) ? fs.readFileSync(liveIndex, 'utf8') : null;
    check('dry-run reports ok', dry.ok === true);
    check('dry-run keeps the skill count', dry.skillsBefore === liveCount && dry.skillsAfter === liveCount,
      `${dry.skillsBefore} -> ${dry.skillsAfter}`);
    check('dry-run would merge every incoming skill', dry.merged.length === baseSkills.length,
      `${dry.merged.length}/${baseSkills.length}`);
    check('dry-run does not touch the structure', liveBefore === liveAfter);
    check('dry-run does not modify the index', indexBefore === indexAfter);

    // 2. real merge into a copy
    const copyBefore = hashSkills(copy);
    const report = install({ sourceDir: pkg, structureRoot: copy });
    const copyAfter = hashSkills(copy);
    check('install reports ok', report.ok === true);
    check('registered skills do not grow', report.skillsBefore === baseSkills.length && report.skillsAfter === baseSkills.length,
      `${report.skillsBefore} -> ${report.skillsAfter}`);
    check('countUnchanged is true', report.countUnchanged === true);
    check('one segment per incoming skill', report.index.length === baseSkills.length, `${report.index.length}`);
    check('merge changed the category files', copyBefore !== copyAfter);
    check('index written to the copy', fs.existsSync(path.join(copy, '.anabol', 'index.json')));

    const index = JSON.parse(fs.readFileSync(path.join(copy, '.anabol', 'index.json'), 'utf8'));

    // 3. exact ranges
    for (const seg of index.segments) {
      const lines = fs.readFileSync(path.join(copy, seg.file), 'utf8').split('\n');
      const first = (lines[seg.startLine - 1] || '').trim();
      const last = (lines[seg.endLine - 1] || '').trim();
      const after = lines.slice(seg.endLine, seg.endLine + 3).join('\n');
      const ok = first === seg.anchor && last !== '' && new RegExp(`<!-- /ANABOL:SEGMENT id=${seg.id} -->`).test(after);
      check(`range ${seg.id} ${seg.startLine}-${seg.endLine}`, ok);
    }

    // 4. uniqueness
    const allText = discoverSkills(copy).map((s) => fs.readFileSync(s.file, 'utf8')).join('\n');
    for (const seg of index.segments) {
      const n = (allText.match(new RegExp(`<!-- ANABOL:SEGMENT id=${seg.id}(?: |-->)`, 'g')) || []).length;
      check(`single copy of ${seg.id}`, n === 1, `${n} occurrence(s)`);
    }

    // 5. find + read for every segment
    for (const seg of index.segments) {
      const query = seg.description || seg.id.replace(/-/g, ' ');
      const top = findSegments({ structureRoot: copy, query, limit: 1, threshold: 0, includeCategories: false })[0];
      check(`find("${query.slice(0, 50)}")`, top && top.id === seg.id, `-> ${top ? top.id : 'none'}`);
      if (top) {
        const r = readById({ structureRoot: copy, id: top.id });
        check(`read(${top.id}) exact lines`, r.linesRead === top.endLine - top.startLine + 1,
          `${r.linesRead} lines, fallback=${r.usedFallback}`);
      }
    }

    // 5b. whole-category entries
    check('one whole-category entry per base skill', index.categories.length === baseSkills.length,
      `${index.categories.length}/${baseSkills.length}`);
    for (const cat of index.categories) {
      const file = path.join(copy, cat.file);
      const lineCount = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').length : 0;
      check(`category range ${cat.id} 1-${cat.endLine}`,
        fs.existsSync(file) && cat.startLine === 1 && cat.endLine === lineCount,
        `${cat.endLine} vs ${lineCount}`);
      const r = readById({ structureRoot: copy, id: cat.id });
      check(`read whole category ${cat.id}`, r.whole === true && r.linesRead === lineCount,
        `whole=${r.whole}, ${r.linesRead} lines`);
      const top = findSegments({ structureRoot: copy, query: cat.description, limit: 1 })[0];
      check(`route category ${cat.id}`,
        !!top && (top.id === cat.id || top.category === cat.id),
        `-> ${top ? `${top.id} (${top.kind})` : 'none'}`);
    }
    check('off-domain query has no match',
      findSegments({ structureRoot: copy, query: 'bake a chocolate cake' }).length === 0);

    // 5c. opt-in route log (on the copy only)
    appendRouteLog(copy, { query: 'verify route log', top: null, score: 0, matched: false, kind: null });
    check('route log appends and reads back', readRouteLog(copy).length === 1);

    // 6. idempotency
    const before = hashTree(copy);
    install({ sourceDir: pkg, structureRoot: copy });
    check('reinstall is byte-identical', hashTree(copy) === before);

    // 7. stale index
    const target = index.segments[0];
    const targetFile = path.join(copy, target.file);
    const original = fs.readFileSync(targetFile, 'utf8');
    fs.writeFileSync(targetFile, `<!-- injected -->\n${original}`);
    const stale = readById({ structureRoot: copy, id: target.id });
    check('stale index falls back to markers', stale.usedFallback === true && stale.text.includes(target.anchor));
    fs.writeFileSync(targetFile, original);

    // 8. reindex
    const rebuilt = reindex({ structureRoot: copy, write: false });
    check('reindex reproduces the ranges',
      rebuilt.segments.length === index.segments.length &&
      rebuilt.segments.every((s, i) => s.startLine === index.segments[i].startLine && s.endLine === index.segments[i].endLine) &&
      rebuilt.categories.length === index.categories.length &&
      rebuilt.categories.every((c, i) => c.id === index.categories[i].id && c.startLine === 1 && c.endLine === index.categories[i].endLine));

    // 9. structure untouched
    check('structure byte-identical end-to-end', hashTree(structure) === liveBefore);
    check('structure skill count unchanged', discoverSkills(structure).length === liveCount);
    // Assets referenced by merged segments must exist on disk, and category
    // bodies must not contain links to files that are not there.
    const dangling = [];
    for (const skill of discoverSkills(structure)) {
      const body = fs.readFileSync(skill.file, 'utf8');
      // Links in the body resolve relative to the category SKILL.md.
      const base = path.dirname(skill.file);
      for (const m of body.matchAll(/anabol-assets\/[a-z0-9-]+\/[^\s)\]"'\`]+/g)) {
        if (!fs.existsSync(path.join(base, m[0]))) dangling.push(`${skill.id}: ${m[0]}`);
      }
    }
    check('no dangling asset links', dangling.length === 0, dangling.slice(0, 3).join(', '));

    if (fs.existsSync(liveIndex)) {
      const liveStored = JSON.parse(fs.readFileSync(liveIndex, 'utf8'));
      const missing = [];
      for (const seg of liveStored.segments) {
        for (const rel of seg.assets || []) {
          if (!fs.existsSync(path.join(structure, rel))) missing.push(rel);
        }
      }
      check('indexed assets exist on disk', missing.length === 0, missing.slice(0, 3).join(', '));
    }

    if (fs.existsSync(liveIndex)) {
      const stored = JSON.parse(fs.readFileSync(liveIndex, 'utf8'));
      const fresh = reindex({ structureRoot: structure, write: false });
      check('structure index is up to date',
        JSON.stringify(stored.segments) === JSON.stringify(fresh.segments) &&
        JSON.stringify(stored.categories || []) === JSON.stringify(fresh.categories || []),
        `${stored.segments.length} segments, ${(stored.categories || []).length} categories`);
    } else {
      check('structure has no index yet (no packages installed)', true);
    }

    return {
      structure,
      liveSkills: liveCount,
      incoming: baseSkills.length,
      segments: index.segments.length,
      categories: index.categories.length,
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  const structure = path.resolve(
    args.structure || path.join(process.env.OPENCODE_CONFIG_DIR || path.join(os.homedir(), '.config', 'opencode'), 'skills'),
  );
  const out = verify({ structure });

  if (args.json) {
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } else {
    console.log(`Anabol verify — ${out.structure}`);
    console.log(`live skills: ${out.liveSkills} | incoming: ${out.incoming} | segments: ${out.segments} | categories: ${out.categories}\n`);
    for (const r of out.results) {
      console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    }
    console.log(`\n${out.failed === 0 ? 'RESULT: PASS' : `RESULT: FAIL (${out.failed})`}  ${out.passed}/${out.results.length} checks`);
  }
  process.exitCode = out.failed === 0 ? 0 : 1;
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`verify: ${err.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { verify };
