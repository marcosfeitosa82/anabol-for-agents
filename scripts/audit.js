#!/usr/bin/env node
'use strict';

/**
 * Anabol audit / benchmark.
 *
 * Compares a conventional install (copy every package skill as a new skill)
 * with Anabol (merge the same package into existing categories) and measures:
 *
 *   - registered skill count
 *   - always-on context (name + description bytes)
 *   - total SKILL.md bytes
 *   - index size
 *   - per-task read cost: baseline skill vs Anabol segment vs whole category
 *   - install time
 *
 * The source package is copied under synthetic ids (`pkg1-<id>`, ...) so it
 * never collides with the target categories and can be installed repeatedly.
 *
 * Usage:
 *   node scripts/audit.js --source <pkg> --target <skills-root> --packages 1
 *   node scripts/audit.js ... --packages 5 --json
 *   node scripts/audit.js ... --meta-skill skills/anabol-orchestrator/SKILL.md
 *
 * No dependencies. Everything runs in a temp directory.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { discoverSkills, discoverSource } = require('../src/discover');
const { install, readById, findSegments } = require('../src/pipeline');
const { parseFrontmatter } = require('../src/lib');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--keep') out.keep = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
    else throw new Error(`unexpected argument: ${a}`);
  }
  return out;
}

function usage() {
  console.log(`Usage: node scripts/audit.js [options]

  --source DIR       package with one or more skills
                     (default: tests/fixtures/source-ecc)
  --target DIR       existing skills root (default: tests/fixtures/target-structure)
  --packages N       number of copies of the package to install (default: 1)
  --query TEXT       task used for the per-task read measurement
  --meta-skill FILE  count this Anabol meta-skill as always-on context
  --json             print JSON only
  --keep             keep the temp work directory
`);
}

function skillStats(root) {
  const skills = discoverSkills(root);
  let descriptionBytes = 0;
  let totalSkillBytes = 0;
  for (const s of skills) {
    const raw = fs.readFileSync(s.file, 'utf8');
    const { frontmatter } = parseFrontmatter(raw);
    descriptionBytes += Buffer.byteLength(`${frontmatter.name || s.id} ${frontmatter.description || ''}`);
    totalSkillBytes += Buffer.byteLength(raw);
  }
  return { skills: skills.length, descriptionBytes, totalSkillBytes };
}

function metaStats(file) {
  if (!file) return { skills: 0, descriptionBytes: 0, totalSkillBytes: 0 };
  const raw = fs.readFileSync(file, 'utf8');
  const { frontmatter } = parseFrontmatter(raw);
  return {
    skills: 1,
    descriptionBytes: Buffer.byteLength(`${frontmatter.name || 'anabol'} ${frontmatter.description || ''}`),
    totalSkillBytes: Buffer.byteLength(raw),
  };
}

function lineCount(file) {
  return fs.readFileSync(file, 'utf8').split('\n').length;
}

function buildSyntheticPackages(work, sourceDir, packages) {
  const source = discoverSource(sourceDir);
  if (source.length === 0) throw new Error(`no SKILL.md found in ${sourceDir}`);

  const packageDirs = [];
  for (let p = 1; p <= packages; p++) {
    const pkgDir = path.join(work, 'packages', `pkg${p}`);
    fs.mkdirSync(pkgDir, { recursive: true });
    for (const skill of source) {
      const id = `pkg${p}-${skill.id}`;
      const dst = path.join(pkgDir, id);
      fs.mkdirSync(dst, { recursive: true });
      fs.copyFileSync(skill.file, path.join(dst, 'SKILL.md'));
    }
    packageDirs.push(pkgDir);
  }
  return { source, packageDirs };
}

function pct(before, after) {
  if (before === 0) return 0;
  return Number((((before - after) / before) * 100).toFixed(1));
}

function run(opts) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-audit-'));
  try {
    const baseline = path.join(work, 'baseline');
    const anabol = path.join(work, 'anabol');
    fs.cpSync(opts.target, baseline, { recursive: true });
    fs.cpSync(opts.target, anabol, { recursive: true });

    const { source, packageDirs } = buildSyntheticPackages(work, opts.source, opts.packages);

    // Conventional install: copy every package skill into the target.
    const t0 = process.hrtime.bigint();
    for (const pkgDir of packageDirs) {
      for (const entry of fs.readdirSync(pkgDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        fs.cpSync(path.join(pkgDir, entry.name), path.join(baseline, entry.name), { recursive: true });
      }
    }
    const baselineMs = Number(process.hrtime.bigint() - t0) / 1e6;

    // Anabol install: merge each package into existing categories.
    const t1 = process.hrtime.bigint();
    const reports = packageDirs.map((pkgDir) => install({ sourceDir: pkgDir, structureRoot: anabol }));
    const anabolMs = Number(process.hrtime.bigint() - t1) / 1e6;

    const meta = metaStats(opts.metaSkill);
    const b = skillStats(baseline);
    const a = skillStats(anabol);
    a.skills += meta.skills;
    a.descriptionBytes += meta.descriptionBytes;
    a.totalSkillBytes += meta.totalSkillBytes;

    const indexFile = path.join(anabol, '.anabol', 'index.json');
    const indexBytes = fs.statSync(indexFile).size;
    const indexLines = lineCount(indexFile);
    const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));

    const query = opts.query || 'detect SQL injection vulnerabilities and unsafe query construction';
    const found = findSegments({ structureRoot: anabol, query, limit: 1, threshold: 0, includeCategories: false })[0];
    if (!found) throw new Error('no segment found for the audit query');

    const read = readById({ structureRoot: anabol, id: found.id });
    const baselineSkillFile = path.join(baseline, found.id, 'SKILL.md');
    const baselineSkillBytes = fs.statSync(baselineSkillFile).size;
    const baselineSkillLines = lineCount(baselineSkillFile);

    const categoryFile = path.join(anabol, found.file);
    const wholeCategoryBytes = fs.statSync(categoryFile).size;
    const wholeCategoryLines = lineCount(categoryFile);

    const findOutput = `${found.id}\t${found.file}\t${found.startLine}-${found.endLine}\t${found.description || ''}\t${found.score}\n`;
    const findOutputBytes = Buffer.byteLength(findOutput);
    const segmentBytes = Buffer.byteLength(read.text);

    const baselineTaskBytes = b.descriptionBytes + baselineSkillBytes;
    const anabolTaskBytes = a.descriptionBytes + findOutputBytes + segmentBytes;
    const naiveIndexTaskBytes = a.descriptionBytes + indexBytes + segmentBytes;

    return {
      packages: opts.packages,
      sourceSkills: source.length,
      query,
      baseline: {
        ...b,
        installMs: Number(baselineMs.toFixed(2)),
      },
      anabol: {
        ...a,
        segments: index.segments.length,
        indexBytes,
        indexLines,
        installMs: Number(anabolMs.toFixed(2)),
        reports: reports.map((r) => ({
          skillsBefore: r.skillsBefore,
          skillsAfter: r.skillsAfter,
          merged: r.merged.length,
          skipped: r.skipped.length,
        })),
      },
      read: {
        segmentId: found.id,
        segmentCategory: found.category,
        segmentBytes,
        segmentLines: read.linesRead,
        baselineSkillBytes,
        baselineSkillLines,
        wholeCategoryBytes,
        wholeCategoryLines,
        indexBytes,
        indexLines,
        findOutputBytes,
        naiveIndexTaskBytes,
      },
      task: {
        baselineTaskBytes,
        anabolTaskBytes,
        anabolTaskWithNaiveIndexBytes: naiveIndexTaskBytes,
        ratio: Number((anabolTaskBytes / baselineTaskBytes).toFixed(3)),
        estimatedBaselineTokens: Math.ceil(baselineTaskBytes / 4),
        estimatedAnabolTokens: Math.ceil(anabolTaskBytes / 4),
      },
      savings: {
        skillCountPct: pct(b.skills, a.skills),
        alwaysOnPct: pct(b.descriptionBytes, a.descriptionBytes),
        totalBytesPct: pct(b.totalSkillBytes, a.totalSkillBytes),
        taskPct: pct(baselineTaskBytes, anabolTaskBytes),
        estimatedTokensPerTask: Math.ceil(baselineTaskBytes / 4) - Math.ceil(anabolTaskBytes / 4),
      },
      workDir: opts.keep ? work : undefined,
    };
  } finally {
    if (!opts.keep) fs.rmSync(work, { recursive: true, force: true });
  }
}

function printHuman(result) {
  const b = result.baseline;
  const a = result.anabol;
  const r = result.read;
  const t = result.task;
  const s = result.savings;

  console.log(`\nAnabol audit — ${result.packages} package(s) × ${result.sourceSkills} skills\n`);
  console.log('Metric                              Conventional      Anabol       Delta');
  console.log('-----------------------------------  --------------  ----------  ----------');
  console.log(`Registered skills                   ${String(b.skills).padEnd(16)}${String(a.skills).padEnd(12)}${s.skillCountPct}% fewer`);
  console.log(`Always-on name+description bytes    ${String(b.descriptionBytes).padEnd(16)}${String(a.descriptionBytes).padEnd(12)}${s.alwaysOnPct}% smaller`);
  console.log(`Total SKILL.md bytes                ${String(b.totalSkillBytes).padEnd(16)}${String(a.totalSkillBytes).padEnd(12)}${s.totalBytesPct}% smaller`);
  console.log(`Install time (ms)                   ${String(b.installMs).padEnd(16)}${String(a.installMs).padEnd(12)}${(a.installMs - b.installMs).toFixed(2)} ms`);
  console.log('');
  console.log(`Per-task query: "${result.query}"`);
  console.log(`  baseline skill file               ${r.baselineSkillBytes} bytes / ${r.baselineSkillLines} lines`);
  console.log(`  Anabol segment                    ${r.segmentBytes} bytes / ${r.segmentLines} lines`);
  console.log(`  whole merged category             ${r.wholeCategoryBytes} bytes / ${r.wholeCategoryLines} lines`);
  console.log(`  index.json (naive path)           ${r.indexBytes} bytes / ${r.indexLines} lines`);
  console.log(`  find output (routing)             ${r.findOutputBytes} bytes`);
  console.log('');
  console.log(`  baseline task bytes               ${t.baselineTaskBytes}`);
  console.log(`  Anabol task bytes (find + read)   ${t.anabolTaskBytes}`);
  console.log(`  Anabol naive (+ whole index)      ${t.anabolTaskWithNaiveIndexBytes}`);
  console.log(`  ratio Anabol/baseline             ${t.ratio}`);
  console.log(`  estimated tokens saved per task   ${s.estimatedTokensPerTask}`);
  console.log('');
  console.log(`Anabol index: ${a.segments} segments, ${a.indexBytes} bytes`);
  for (const rep of a.reports) {
    console.log(`  install: ${rep.skillsBefore} -> ${rep.skillsAfter} skills, ${rep.merged} merged, ${rep.skipped} skipped`);
  }
  if (result.workDir) console.log(`\nwork dir kept: ${result.workDir}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const opts = {
    source: path.resolve(args.source || path.join(ROOT, 'tests', 'fixtures', 'source-ecc')),
    target: path.resolve(args.target || path.join(ROOT, 'tests', 'fixtures', 'target-structure')),
    packages: Math.max(1, Number(args.packages || 1)),
    query: args.query,
    metaSkill: args['meta-skill'] ? path.resolve(args['meta-skill']) : null,
    keep: !!args.keep,
  };

  const result = run(opts);
  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    printHuman(result);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`audit: ${err.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { run, skillStats, buildSyntheticPackages, parseArgs };
