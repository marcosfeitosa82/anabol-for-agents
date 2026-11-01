# Anabol Router Eval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `find` route to every installed skill — merged segments *and* whole category skills — with a confidence threshold, a measurable eval harness, and an opt-in local feedback log, without growing the skill count or the hot path.

**Architecture:** Keep `index.segments` exactly as it is and add a sibling `index.categories` array with one entry per base category skill (meta-skill excluded). A new pure `src/router.js` ranks both kinds, prefers a segment on a tie, and rejects scores below `0.35`. `readById` reads a whole category when the winner is a category entry. The eval harness measures top-1 accuracy before/after on the live structure; the route log is opt-in and local.

**Tech Stack:** Node.js >= 18, CommonJS, `node:test`, no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-01-anabol-router-eval-design.md`

## Global Constraints

- No runtime dependencies; Node built-ins only.
- `find` plain output stays one line per result with the same five columns: `id`, `file`, `startLine-endLine`, `description`, `score`. The index never enters the model context.
- `index.segments` keeps its current meaning: one entry per merged sub-skill. Whole categories go in `index.categories`.
- The meta-skill `anabol-orchestrator` is never a routing entry.
- Default threshold is `0.35`; `--threshold` accepts a number in `[0, 1]`.
- A query below the threshold prints `NO_MATCH` (plain) or `[]` (`--json`) and exits `0`.
- Reinstall and reindex remain byte-identical when nothing changed (`generatedAt` preserved).
- Host-agnostic: changes live in `src/`, not in the OpenCode adapter.
- Live structure changes require a backup first; never restart the OpenCode service hosting this session.
- Test on a `/tmp` copy before touching `~/.config/opencode/skills`.
- The repository is not a git repo yet. Before Task 1, initialize it locally and set a local identity so the per-task commits work. Do **not** push; publishing is a separate, blocked step.

```bash
cd /root/anabol-for-agents
git rev-parse --is-inside-work-tree 2>/dev/null || git init
git config user.name "Anabol"
git config user.email "anabol@localhost"
```

Create the two execution artifacts before Task 1:

```bash
mkdir -p docs/measurements
[ -f docs/superpowers/plans/2026-11-01-anabol-router-eval-progress.md ] || cat > docs/superpowers/plans/2026-11-01-anabol-router-eval-progress.md <<'EOF'
# Router Eval — Progress

Status: not started
Current task: 1
Last commit: none
Decisions: none yet
Test evidence: none yet
Next task: 1 — Pure router
EOF
touch docs/measurements/2026-11-01-router-execution.jsonl
```

## Execution Protocol (Anabol-native)

This plan is also a test of Anabol's token discipline. The rules below apply to every task.

**1. Route before reading a skill, then check relevance.** Before a task, run `anf "<task intent>"`. If it returns a segment, read only that segment with `anr <id>`. If it returns `NO_MATCH` (or a score below `0.35` before the threshold exists), do **not** read a low-confidence segment; use the task packet and the listed source files. If it returns a whole category, read it only when the task is category-level; otherwise try `anf "<intent>" --limit 3` and prefer a segment.

A score above `0.35` is necessary but not sufficient. Before reading, ask: **does this skill directly answer this task?** If not, record `routeStatus: "rejected"` with the reason and use the task packet. This prevents a 0.50 `requirements-clarity` hit from becoming a 9 KB irrelevant read. The router is advisory; the task packet is the fallback.

If the accepted route is a category larger than 20 KB (`tdd-workflow` is 41.7 KB), do not read the whole file. List its headings with `grep -n '^##' <category>/SKILL.md`, pick the matching section, and read only that line range. Record this manual section read in the execution JSONL; it is the evidence for the Phase 2 section-indexing decision.

**2. Read a task packet, not the whole plan.** Extract only the current task section:

```bash
awk -v t="### Task 3:" '$0 ~ t {p=1} p && /^---$/ {exit} p' \
  docs/superpowers/plans/2026-11-01-anabol-router-eval.md
```

A packet is: that section, the spec section it references, the files listed in the task, the routed skill segment (if any), and the progress file. Never load the whole ~47 KB plan or the index (15.7 KB before the router, 28,663 B in the v2 shape) per task.

**3. Hand off between tasks.** After each task, update `docs/superpowers/plans/2026-11-01-anabol-router-eval-progress.md` with: status, commit, files changed, commands and test results, the `anf` route used, and the next task. A fresh subagent reads only this file plus its task packet. This follows the `session-handoff` segment that `anf` routes to for context-heavy work.

**4. Bound reviewer context.** A reviewer gets the task's acceptance criteria, `git diff HEAD~1`, the test output, and the task's file list. It does not get the whole plan or the whole repository.

**5. Measure the execution, not only the feature.** Append one JSON line per task to `docs/measurements/2026-11-01-router-execution.jsonl`:

```json
{"task":3,"anf":"route find to whole categories","route":"NO_MATCH","routeStatus":"no_match","score":0,"anfBytes":12,"anrBytes":0,"filesRead":["src/pipeline.js","src/cli.js"],"tests":"6/6"}
{"task":6,"anf":"verify end to end and update documentation","route":"requirements-clarity","routeStatus":"rejected","reason":"not relevant to Anabol verification","score":0.5,"anfBytes":496,"anrBytes":0,"filesRead":["scripts/verify.js"],"tests":"PASS"}
```

Task 7 summarizes this file. The point is to prove that the plan's own execution used Anabol instead of loading whole categories.

**6. Subagent policy.** Default to native execution: the tasks are sequential and share interfaces. Use subagents only for independent review: Task 2 (index shape), Task 3 (router/read), Task 5 (log privacy), Task 6 (end-to-end), and one final diff review. Do **not** run one implementer subagent per task; that multiplies the plan/spec context by seven and is the expensive pattern this section avoids.

### Task packet template

```text
Task: <n> — <title>
Plan section: <output of the awk command>
Spec: docs/superpowers/specs/2026-11-01-anabol-router-eval-design.md, section <name>
Routed skill: <anf output> -> <anr id or NO_MATCH>
Files: <the task's Files list>
Progress: docs/superpowers/plans/2026-11-01-anabol-router-eval-progress.md
Acceptance: <the task's test commands and expected results>
```

### Anabol routing map for the tasks

These intents were simulated against the live entries plus whole-category entries on 2026-11-01. The router is not a general task router: most of this plan is meta-work about Anabol itself, so the correct action for six of the seven intents is to reject the route and use the task packet.

| Task | `anf` intent | Simulated route | Action |
| ---: | --- | --- | --- |
| 1 | `write failing unit tests first TDD for a pure router module` | `tdd-workflow` (0.63) | read the category; it is directly relevant |
| 2 | `index whole category entries and exclude the meta skill` | `NO_MATCH` | task packet |
| 3 | `route find to whole categories and read a whole category file` | `NO_MATCH` | task packet |
| 4 | `measure routing accuracy with an eval harness` | `NO_MATCH` | task packet |
| 5 | `add an opt-in local route log and report` | `production-audit` (0.40) | **reject** — not relevant; task packet |
| 6 | `verify end to end and update documentation` | `requirements-clarity` (0.50) | **reject** — not relevant; task packet |
| 7 | `measure final results and write the report` | `qa-test-planner` (0.50) | **reject** — not relevant; task packet |

The current router (before this plan) demonstrates why the threshold matters, and why the relevance check is still required:

| Intent | Current route | Bytes if followed | After this plan |
| --- | --- | ---: | --- |
| `index whole category entries and exclude the meta skill` | `database-schema-designer` (0.1667) | 17,327 | `NO_MATCH` below 0.35 |
| `measure routing accuracy with an eval harness` | `backend-to-frontend-handoff-docs` (0) | 4,991 | `NO_MATCH` |
| `add an opt-in local route log and report` | `mermaid-diagrams` (0.2) | 6,940 | `NO_MATCH` below 0.35; a different wrong route at 0.40 must still be rejected by relevance |
| `verify end to end and update documentation` | `requirements-clarity` (0.5) | 9,003 | still 0.50; reject by relevance and use the task packet |

### Token budget (measured on 2026-11-01)

Already measured for package installs (the reduction this plan must not lose):

| Scenario | Registered skills | Always-on context | Task context |
| --- | ---: | ---: | ---: |
| 1 package | 20 → **11** (−45.0%) | 7,004 → **3,819 B** (−45.5%) | 29,506 → **26,292 B** (−10.9%) |
| 5 packages | 60 → **11** (−81.7%) | 21,012 → **3,819 B** (−81.8%) | 43,514 → **26,292 B** (−39.6%) |
| 4 asset-bearing skills | 15 → **11** (−26.7%) | 5,880 → **3,829 B** (−34.9%) | segment vs whole category: 46–86% smaller |

Per-read budget:

| Item | Bytes | Notes |
| --- | ---: | --- |
| Always-on skill descriptions (live) | 3,829 | 11 skills |
| Index (live) | 15,733 | never enters context |
| `anf` output | ~500 | one line |
| `session-handoff` segment | 5,758 | example segment read |
| `qa-test-planner` segment | 18,889 | example segment read |
| `tdd-workflow` category | 41,701 | whole-category fallback |
| `coding-standards` category | 30,387 | whole-category fallback |
| `change-impact` category | 48,358 | whole-category fallback |
| This plan | ~47,000 | whole plan; a task packet is a fraction of it |
| Spec | 5,013 | |
| In-scope source files | ~30,400 | `pipeline`, `cli`, `indexer`, `verify` |

The target is **≤ 20 KB per task packet** (plan section + spec section + 1–3 source files + routed skill segment). Without packets, a fresh subagent can pay ~80 KB per task (whole plan + spec + all source files); with packets, the same work reads only the relevant slice. If a task routes to a whole category larger than 20 KB (`tdd-workflow`, `coding-standards`, `change-impact`), record the overage in the execution JSONL; that is the evidence for the Phase 2 section-indexing decision. Measure the actuals in Task 7 rather than trusting this estimate.

### Quality gates

| Gate | Command | Pass condition |
| --- | --- | --- |
| Unit/integration | `npm test` | 0 failures |
| End-to-end | `npm run verify` | 100% checks |
| Routing | `npm run eval:routing` | 12/12, off-domain 4/4 |
| Holdout | `npm run eval:routing:holdout` | ≥ 7/8, off-domain 4/4 (frozen; never tuned) |
| Baseline | `npm run eval:routing -- --segments-only --threshold 0` | 6/12, off-domain 0/4 |
| Self-routing | `npm run eval:routing -- --self` | 100% of entries route to themselves or a child segment |
| Audit | `npm run audit` | no regression against `docs/audit-results.json` |
| Latency | `anf` 10 runs | p50 ≤ 600 ms |
| Hot path | `anf "..." \| wc -c` | ≤ 1 KB |
| Index size | `stat .anabol/index.json` | ≤ 32 KB (v2; the 25 KB estimate predates category entries; measured 28,663 B) |
| Idempotency | `npm run verify` | byte-identical reinstall |

### Rollback

- Backup before touching the live structure: `/root/anabol-backups/skills-before-<stamp>.tar.gz`.
- Restore:

```bash
rm -rf ~/.config/opencode/skills
tar -xzf /root/anabol-backups/skills-before-<stamp>.tar.gz -C ~/.config/opencode
```

- Code rollback: `git revert <commit>` for a single task, or `git reset --hard <last-good>` only if the user approves.
- If `npm run verify` fails after the live reindex: restore the backup, check out the last good commit, run `node src/cli.js reindex --structure ~/.config/opencode/skills`, and re-run verify.
- Never restart the OpenCode service hosting this session.

### Phase 2 candidate (not in this plan)

Whole-category fallback reads can still be large: `tdd-workflow` 41.7 KB, `coding-standards` 30.4 KB, `change-impact` 48.4 KB. After Task 7, if the execution measurement shows category reads are a meaningful share of task tokens, write a follow-up spec to index H2/H3 **sections** of base categories (a `sections` array with line ranges) so `anr <category>#<section>` reads only the relevant part. Keep the current plan shippable first; do not expand it now.

## Review Focus

- **Below-threshold query:** a task like "bake a chocolate cake" must return no entry, not a zero-score guess.
- **Category and segment both match:** a specific segment must win an exact score tie; the category is the fallback, not the default.
- **Category with no merged segments:** it must still be routable, and `anr <category-id>` must return the whole category file.
- **Meta-skill leakage:** `anabol-orchestrator` must never appear in `find` results or `index.categories`.
- **Reinstall/reindex stability:** adding categories must not change `segments`, duplicate ids, or break byte-identical reinstalls.
- **Wrong low-confidence read:** a task intent scoring below `0.35` must produce `NO_MATCH`, not a 17 KB irrelevant segment read (the current `database-schema-designer` case).
- **Plausible but irrelevant route:** a 0.40–0.50 match (`requirements-clarity` for a verification task) must be rejected by the relevance check, not read; the router is advisory.
- **Fresh-context continuation:** a subagent must be able to finish a task from the task packet plus the progress file, without reading the whole ~47 KB plan.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/router.js` | Pure scoring, threshold, segment-before-category tie-break, limit. |
| `src/indexer.js` | Add `indexWholeCategories`, `stripMergedBlocks`, `META_SKILL_ID`; `buildIndex` returns `version: 2`, `segments`, `categories`. |
| `src/pipeline.js` | `findSegments` delegates to the router; `readById` handles whole categories; `writeIndexIfChanged` compares categories too. |
| `src/cli.js` | `find --threshold/--log/--segments-only`, `NO_MATCH`, `read` reports `whole`, `reindex` reports category count. |
| `src/route-log.js` | Opt-in append-only JSONL log and summary helpers. |
| `scripts/bin/anf` | Pass through `--threshold`, `--log`, `--segments-only`. |
| `scripts/routing-cases.json` | Labeled queries and off-domain queries for the eval harness. |
| `scripts/eval-routing.js` | Top-1 and off-domain report; `--segments-only` reproduces the old baseline. |
| `scripts/route-report.js` | Summarize `.anabol/route-log.jsonl`. |
| `scripts/verify.js` | End-to-end checks for categories, whole reads, threshold, and route log. |
| `templates/index.schema.json` | Version 2 with `categories`. |
| `.github/workflows/ci.yml` | Run the end-to-end verify against the fixture structure. |
| `docs/superpowers/plans/2026-11-01-anabol-router-eval-progress.md` | Compact handoff between tasks; the only file a fresh subagent needs besides its task packet. |
| `docs/measurements/2026-11-01-router-execution.jsonl` | One line per task: route, score, bytes, files, tests. |
| `docs/measurements/2026-11-01-router-eval.json` | Final before/after measurement artifact. |
| `docs/` + `README.md` + `skills/anabol-orchestrator/SKILL.md` | Document routing behavior and measurements. |

---

### Task 1: Pure router

**Files:**
- Create: `src/router.js`
- Test: `tests/unit/router.test.js`

**Interfaces:**
- Produces: `DEFAULT_THRESHOLD = 0.35`
- Produces: `scoreEntry(query: string, entry: object): number` — `max(overlapScore, containmentScore)`, rounded to 4 decimals.
- Produces: `rankEntries(query: string, entries: {segments?: object[], categories?: object[]}, opts?: {threshold?: number, limit?: number, includeCategories?: boolean}): Array<object>` — each result is `{...entry, score: number, kind: 'segment' | 'category'}`, sorted by score desc, then `kind` (segment first), then `id` asc; entries below `threshold` are removed; `limit` applies after filtering; `includeCategories: false` ignores `entries.categories`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/router.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { rankEntries, scoreEntry, DEFAULT_THRESHOLD } = require('../../src/router');

const segment = {
  id: 'openapi-to-typescript',
  category: 'coding-standards',
  description: 'Generate TypeScript types from an OpenAPI spec.',
  keywords: [],
};
const category = {
  id: 'coding-standards',
  category: 'coding-standards',
  description: 'Generate TypeScript types from an OpenAPI spec.',
  keywords: [],
};

test('DEFAULT_THRESHOLD is 0.35', () => {
  assert.strictEqual(DEFAULT_THRESHOLD, 0.35);
});

test('a segment wins an exact score tie against its category', () => {
  const out = rankEntries('generate TypeScript types from an OpenAPI spec', {
    segments: [segment],
    categories: [category],
  });
  assert.strictEqual(out[0].id, 'openapi-to-typescript');
  assert.strictEqual(out[0].kind, 'segment');
});

test('a category routes when no segment matches', () => {
  const out = rankEntries('documentation readme api docs', {
    segments: [{ id: 'unrelated', category: 'docs', description: 'deploy a container', keywords: [] }],
    categories: [{ id: 'documentation', category: 'documentation', description: 'Writing documentation, READMEs, and API docs.', keywords: [] }],
  });
  assert.strictEqual(out[0].id, 'documentation');
  assert.strictEqual(out[0].kind, 'category');
});

test('a below-threshold query returns no entries', () => {
  assert.deepStrictEqual(
    rankEntries('bake a chocolate cake', { segments: [segment], categories: [category] }),
    [],
  );
});

test('threshold 0 returns the best entry', () => {
  const out = rankEntries('bake a chocolate cake', { segments: [segment], categories: [category] }, { threshold: 0 });
  assert.strictEqual(out.length, 1);
});

test('includeCategories false ignores whole categories', () => {
  const out = rankEntries('documentation readme api docs', {
    segments: [],
    categories: [{ id: 'documentation', category: 'documentation', description: 'Writing documentation, READMEs, and API docs.', keywords: [] }],
  }, { includeCategories: false });
  assert.deepStrictEqual(out, []);
});

test('limit applies after filtering and scoreEntry rounds to 4 decimals', () => {
  const out = rankEntries('alpha beta', {
    segments: [
      { id: 'b', category: 'x', description: 'alpha beta', keywords: [] },
      { id: 'a', category: 'x', description: 'alpha beta', keywords: [] },
    ],
  }, { limit: 1 });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].id, 'a');
  assert.strictEqual(out[0].score, 1);
  assert.strictEqual(scoreEntry('alpha beta', out[0]), 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/router.test.js`
Expected: FAIL — `Cannot find module '../../src/router'`.

- [ ] **Step 3: Implement `src/router.js`**

Import `overlapScore` and `containmentScore` from `./lib`. `scoreEntry` returns `Number(Math.max(...).toFixed(4))`. `rankEntries` maps segments to `kind: 'segment'` and categories to `kind: 'category'` (only when `includeCategories !== false`), scores, filters `score >= threshold`, sorts `b.score - a.score || (a.kind === b.kind ? 0 : a.kind === 'segment' ? -1 : 1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)`, then slices to `Math.max(1, Number(limit) || 1)`. Export `DEFAULT_THRESHOLD`, `scoreEntry`, `rankEntries`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/unit/router.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/router.js tests/unit/router.test.js \
  docs/superpowers/plans/2026-11-01-anabol-router-eval-progress.md \
  docs/measurements/2026-11-01-router-execution.jsonl
git commit -m "feat(router): rank segments and whole categories with a threshold"
```

---

### Task 2: Whole-category index entries

**Files:**
- Modify: `src/indexer.js`
- Modify: `tests/unit/indexer.test.js`
- Modify: `tests/integration/pipeline.test.js` (version assertion only)

**Interfaces:**
- Produces: `META_SKILL_ID = 'anabol-orchestrator'`
- Produces: `stripMergedBlocks(text: string): string` — removes `<!-- ANABOL:TOC -->...<!-- /ANABOL:TOC -->` and every `<!-- ANABOL:SEGMENT ... -->...<!-- /ANABOL:SEGMENT ... -->` block.
- Produces: `indexWholeCategories(categoryContents: Record<string,string>, opts?: {fileFor?: (category: string) => string, excludeIds?: string[]}): Array<object>`
- Changes: `buildIndex(...)` returns `{ version: 2, generatedAt, structureRoot?, segments, categories }`; `categories` is sorted by `id`, excludes `META_SKILL_ID` and any id already present in `segments`.

Whole entry shape:

```js
{
  id,          // category id
  category,    // same as id
  file,        // fileFor(id)
  startLine: 1,
  endLine,     // content.split('\n').length
  anchor,      // first line, trimmed, or '---'
  description, // frontmatter.description, else id.replace(/-/g, ' ')
  keywords,    // topTokens(proseOnly(stripMergedBlocks(frontmatter.body)), 40)
}
```

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/indexer.test.js`:

```js
test('buildIndex adds one whole-category entry per skill and excludes the meta-skill', () => {
  const withDescription = CONTENT.replace('name: testing', 'name: testing\ndescription: Category for testing.');
  const index = buildIndex(
    { testing: withDescription, 'anabol-orchestrator': withDescription },
    { fileFor: (c) => `${c}/SKILL.md` },
  );
  assert.strictEqual(index.version, 2);
  assert.strictEqual(index.segments.length, 2);
  assert.deepStrictEqual(index.categories.map((c) => c.id), ['testing']);

  const category = index.categories[0];
  assert.strictEqual(category.category, 'testing');
  assert.strictEqual(category.file, 'testing/SKILL.md');
  assert.strictEqual(category.startLine, 1);
  assert.strictEqual(category.endLine, withDescription.split('\n').length);
  assert.strictEqual(category.anchor, '---');
  assert.strictEqual(category.description, 'Category for testing.');
  assert.ok(!category.keywords.includes('alpha'), 'segment-only keyword leaked');
  assert.ok(!category.keywords.includes('beta'), 'segment-only keyword leaked');
});

test('stripMergedBlocks removes TOC and merged segments but keeps the category prose', () => {
  const stripped = stripMergedBlocks(CONTENT);
  assert.ok(!stripped.includes('ANABOL:TOC'));
  assert.ok(!stripped.includes('ANABOL:SEGMENT'));
  assert.ok(!stripped.includes('Body alpha'));
  assert.ok(stripped.includes('name: testing'));
});
```

Update the two existing assertions `assert.strictEqual(index.version, 1)` to `2` in `tests/unit/indexer.test.js` and `tests/integration/pipeline.test.js`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/unit/indexer.test.js tests/integration/pipeline.test.js`
Expected: FAIL — `stripMergedBlocks is not a function` / `index.categories` is undefined / version mismatch.

- [ ] **Step 3: Implement `indexWholeCategories` and `stripMergedBlocks`**

Import `parseFrontmatter` from `./lib`. `stripMergedBlocks` uses the same block regexes as `scripts/verify.js:stripAnabol`. `indexWholeCategories` iterates `Object.entries(categoryContents)`, skips `opts.excludeIds` plus `META_SKILL_ID`, parses frontmatter, computes the fields above, and sorts by `id`. In `buildIndex`, build `segments` as today, build `categories`, drop categories whose id is in `segments`, set `version: 2`, and include `categories` in the returned object.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/unit/indexer.test.js tests/integration/pipeline.test.js`
Expected: PASS. `npm test` still passes (the old `segments` assertions are unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/indexer.js tests/unit/indexer.test.js tests/integration/pipeline.test.js \
  docs/superpowers/plans/2026-11-01-anabol-router-eval-progress.md \
  docs/measurements/2026-11-01-router-execution.jsonl
git commit -m "feat(index): add whole-category routing entries"
```

---

### Task 3: Route and read whole categories

**Files:**
- Modify: `src/pipeline.js`
- Modify: `src/cli.js`
- Modify: `src/index.js`
- Modify: `scripts/bin/anf`
- Modify: `scripts/audit.js`
- Test: `tests/integration/router.test.js` (create)

**Interfaces:**
- `findSegments({ structureRoot, query, limit = 1, threshold = DEFAULT_THRESHOLD, includeCategories = true })` — loads the index, returns `rankEntries(query, index, { threshold, limit, includeCategories })`. Missing `index.categories` is treated as `[]`.
- `readById({ structureRoot, id })` — searches `index.segments` first, then `index.categories`. A category result returns `{ text, startLine: 1, endLine: lineCount, usedFallback: false, linesRead: lineCount, whole: true, segment: entry }`; a segment result returns `whole: false`.
- `writeIndexIfChanged` preserves `generatedAt` only when both `segments` and `categories` are unchanged.
- CLI `find` flags: `--threshold N`, `--segments-only`, `--log`. Invalid threshold (non-finite or outside `[0, 1]`) throws.
- CLI `read --json` includes `whole: boolean`.
- `anf` forwards `--threshold`, `--segments-only`, and `--log`.

- [ ] **Step 1: Write the failing integration tests**

Create `tests/integration/router.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { install, reindex, readById, findSegments, INDEX_DIR, INDEX_FILE } = require('../../src/pipeline');

const TARGET = path.join(__dirname, '..', 'fixtures', 'target-structure');
const SOURCE = path.join(__dirname, '..', 'fixtures', 'source-ecc');
const CLI = path.join(__dirname, '..', '..', 'src', 'cli.js');

function makeStructure() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-router-'));
  fs.cpSync(TARGET, root, { recursive: true });
  return root;
}

test('reindex creates whole-category entries and find routes to one', () => {
  const root = makeStructure();
  try {
    reindex({ structureRoot: root });
    const found = findSegments({ structureRoot: root, query: 'documentation readme api docs' });
    assert.strictEqual(found[0].id, 'documentation');
    assert.strictEqual(found[0].kind, 'category');

    const read = readById({ structureRoot: root, id: 'documentation' });
    assert.strictEqual(read.whole, true);
    assert.strictEqual(read.linesRead, fs.readFileSync(path.join(root, 'documentation', 'SKILL.md'), 'utf8').split('\n').length);
    assert.ok(read.text.startsWith('---'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a specific segment still wins over its category', () => {
  const root = makeStructure();
  try {
    install({ sourceDir: SOURCE, structureRoot: root });
    const found = findSegments({ structureRoot: root, query: 'detect SQL injection vulnerabilities' });
    assert.strictEqual(found[0].id, 'sql-injection-scan');
    assert.strictEqual(found[0].kind, 'segment');
    assert.strictEqual(readById({ structureRoot: root, id: 'sql-injection-scan' }).whole, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('find rejects an off-domain query', () => {
  const root = makeStructure();
  try {
    reindex({ structureRoot: root });
    assert.deepStrictEqual(findSegments({ structureRoot: root, query: 'bake a chocolate cake' }), []);
    assert.deepStrictEqual(
      findSegments({ structureRoot: root, query: 'bake a chocolate cake', includeCategories: false }),
      [],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a version-1 index without categories still routes segments', () => {
  const root = makeStructure();
  try {
    install({ sourceDir: SOURCE, structureRoot: root });
    const idxPath = path.join(root, INDEX_DIR, INDEX_FILE);
    const index = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    index.version = 1;
    delete index.categories;
    fs.writeFileSync(idxPath, JSON.stringify(index, null, 2) + '\n');

    const found = findSegments({ structureRoot: root, query: 'detect SQL injection vulnerabilities' });
    assert.strictEqual(found[0].id, 'sql-injection-scan');
    assert.strictEqual(found[0].kind, 'segment');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI prints NO_MATCH and [] instead of a zero-score guess', () => {
  const root = makeStructure();
  try {
    reindex({ structureRoot: root });
    const plain = execFileSync('node', [CLI, 'find', '--structure', root, '--query', 'bake a chocolate cake'], { encoding: 'utf8' });
    assert.strictEqual(plain, 'NO_MATCH\n');
    const json = execFileSync('node', [CLI, 'find', '--structure', root, '--query', 'bake a chocolate cake', '--json'], { encoding: 'utf8' });
    assert.deepStrictEqual(JSON.parse(json), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('limit and threshold are applied after ranking', () => {
  const root = makeStructure();
  try {
    install({ sourceDir: SOURCE, structureRoot: root });
    assert.strictEqual(findSegments({ structureRoot: root, query: 'testing', limit: 3 }).length, 3);
    // "testing database" covers only one of two query tokens (score 0.5), so
    // a 0.6 threshold must reject it even though a partial match exists.
    assert.deepStrictEqual(
      findSegments({ structureRoot: root, query: 'testing database', threshold: 0.6 }),
      [],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/integration/router.test.js`
Expected: FAIL — `findSegments` returns no category, `readById` says `unknown segment: documentation`, CLI prints a zero-score line.

- [ ] **Step 3: Implement pipeline and CLI changes**

In `src/pipeline.js`, import `{ rankEntries, DEFAULT_THRESHOLD }` from `./router`. Replace the scoring body of `findSegments` with the delegate call. Update `readById` as described. In `writeIndexIfChanged`, add `JSON.stringify(previous.categories || []) === JSON.stringify(index.categories || [])` to the preservation condition. Add `categories: index.categories` to the `install` report.

In `src/cli.js`, parse `--log` and `--segments-only` as booleans in `parseArgs` (alongside `--dry-run`/`--json`), and pass `--threshold` through as a number. `find` prints `NO_MATCH` when `results.length === 0` in plain mode; `--json` prints `[]` automatically. Include `whole: r.whole` in `read --json`. `reindex` prints `{ ok: true, segments, categories }`.

In `src/index.js`, add `const router = require('./router');` and export it. Task 5 adds `routeLog` separately.

In `scripts/audit.js`, change its `findSegments` call to `{ ..., threshold: 0, includeCategories: false }` so the audit keeps measuring segment-only reads.

In `scripts/bin/anf`, add `--threshold`, `--log`, and `--segments-only` to the argument loop and forward them in the final `set --` block.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/integration/router.test.js`
Expected: PASS, 6 tests.

Run: `npm test`
Expected: PASS, 74+ tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline.js src/cli.js src/index.js scripts/bin/anf scripts/audit.js tests/integration/router.test.js \
  docs/superpowers/plans/2026-11-01-anabol-router-eval-progress.md \
  docs/measurements/2026-11-01-router-execution.jsonl
git commit -m "feat(find): route to whole categories and reject low-confidence queries"
```

---

### Task 4: Eval harness and labeled cases

**Files:**
- Create: `scripts/routing-cases.json`
- Create: `scripts/eval-routing.js`
- Modify: `package.json`

**Interfaces:**
- `routing-cases.json` shape: `{ "cases": [{ "query": string, "expect": string }], "offDomain": string[], "taskQueries": [{ "query": string, "expect": string }] }`; `expect` is an id or the literal `NO_MATCH`.
- `eval-routing.js` flags: `--structure DIR` (default `$ANABOL_STRUCTURE` or `~/.config/opencode/skills`), `--threshold N` (default `0.35`), `--segments-only`, `--self`, `--json`, `--min-accuracy N` (default `0`). Exit `1` only when top-1 accuracy is below `--min-accuracy`.
- Output lines: `HIT`/`MISS` per case with `top.id` and `score`, then `top-1: X/N (P%)`, `off-domain rejected: X/N`, `lowest winning score: S`. `--self` adds `self-routing: X/N`; the task queries add `task-routing: X/N` as a reported diagnostic, not a hard gate.

- [ ] **Step 1: Write the cases and harness**

Use these 12 labeled cases (measured against the live structure on 2026-11-01):

```json
{
  "cases": [
    { "query": "detect SQL injection vulnerabilities", "expect": "security-review" },
    { "query": "write a failing test before implementation", "expect": "tdd-workflow" },
    { "query": "resolve a git merge conflict and rebase", "expect": "git-workflow" },
    { "query": "design a database schema with indexes", "expect": "database-schema-designer" },
    { "query": "generate TypeScript types from an OpenAPI spec", "expect": "openapi-to-typescript" },
    { "query": "document the architecture with C4 diagrams", "expect": "c4-architecture" },
    { "query": "review staged changes for a commit message", "expect": "conventional-commit-review" },
    { "query": "handle errors and retries in TypeScript", "expect": "error-handling" },
    { "query": "run a production readiness audit", "expect": "production-audit" },
    { "query": "hand off session context to another agent", "expect": "session-handoff" },
    { "query": "clarify ambiguous requirements before coding", "expect": "requirements-clarity" },
    { "query": "suggest better variable names", "expect": "naming-analyzer" }
  ],
  "offDomain": [
    "bake a chocolate cake",
    "translate this poem to French",
    "what is the weather today",
    "book a flight to Lisbon"
  ],
  "taskQueries": [
    { "query": "write failing unit tests first TDD for a pure router module", "expect": "tdd-workflow" },
    { "query": "index whole category entries and exclude the meta skill", "expect": "NO_MATCH" },
    { "query": "route find to whole categories and read a whole category file", "expect": "NO_MATCH" },
    { "query": "measure routing accuracy with an eval harness", "expect": "NO_MATCH" },
    { "query": "add an opt-in local route log and report", "expect": "NO_MATCH" },
    { "query": "verify end to end and update documentation", "expect": "NO_MATCH" },
    { "query": "measure final results and write the report", "expect": "NO_MATCH" }
  ]
}
```

`eval-routing.js` loads the cases, calls `findSegments({ structureRoot, query, limit: 1, threshold, includeCategories: !args['segments-only'] })`, and compares `results[0]?.id` with `expect`. When `expect` is `NO_MATCH`, the case passes only when `results.length === 0`. Off-domain cases pass when `results.length === 0`. Print `NO_MATCH` in the table for empty results. The `taskQueries` are diagnostics for the plan's own routing map; report them but do not fail the run on them. A `MISS` on tasks 5–7 is expected: the router returns a plausible but irrelevant skill at 0.40–0.50, and the execution protocol's relevance check is what prevents the read. With `--self`, iterate `index.segments` and `index.categories`: a segment passes when its description routes to itself; a category passes when the top result is the category or a segment whose `category` is that category. Add `"eval:routing": "node scripts/eval-routing.js"` to `package.json`.

- [ ] **Step 2: Run the baseline on a temp copy**

```bash
rm -rf /tmp/anabol-router-live
cp -a ~/.config/opencode/skills /tmp/anabol-router-live
node src/cli.js reindex --structure /tmp/anabol-router-live
node scripts/eval-routing.js --structure /tmp/anabol-router-live --segments-only --threshold 0
```

Expected: `top-1: 6/12 (50%)` and `off-domain rejected: 0/4` — the current segment-only router with no threshold, which is the behavior being replaced.

- [ ] **Step 3: Run the new router on the same copy**

```bash
node scripts/eval-routing.js --structure /tmp/anabol-router-live
```

Expected: `top-1: 12/12 (100%)`, `off-domain rejected: 4/4`, lowest winning score `>= 0.35`.

Calibrate the threshold before committing to 0.35:

```bash
for t in 0.30 0.35 0.40; do
  node scripts/eval-routing.js --structure /tmp/anabol-router-live --threshold "$t"
done
```

The plan keeps `0.35` as the design decision. Use this calibration as evidence: if `0.35` fails `12/12` or `4/4`, choose the lowest threshold that passes and update `DEFAULT_THRESHOLD` plus the Task 1 test. Do not change the threshold without recording the before/after numbers in the measurement artifact.

- [ ] **Step 4: Run the self-routing check**

```bash
node scripts/eval-routing.js --structure /tmp/anabol-router-live --self
```

Expected: `self-routing: 20/20` (10 segments + 10 categories) and `task-routing` reported for the four plan intents. If a category's description routes to one of its own segments, that counts as a pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/routing-cases.json scripts/eval-routing.js package.json \
  docs/superpowers/plans/2026-11-01-anabol-router-eval-progress.md \
  docs/measurements/2026-11-01-router-execution.jsonl
git commit -m "feat(eval): measure routing top-1 and off-domain rejection"
```

---

### Task 5: Opt-in route log and report

**Files:**
- Create: `src/route-log.js`
- Create: `scripts/route-report.js`
- Modify: `src/cli.js` (write a record when `--log` is passed)
- Modify: `src/index.js`
- Modify: `package.json`
- Test: `tests/unit/route-log.test.js`

**Interfaces:**
- `ROUTE_LOG = 'route-log.jsonl'`
- `appendRouteLog(structureRoot: string, record: object): void` — writes one JSON line to `<structureRoot>/.anabol/route-log.jsonl`, creating `.anabol` if needed.
- `readRouteLog(structureRoot: string): object[]` — parses valid JSON lines, ignores malformed ones.
- `summarizeRouteLog(records: object[]): { total, matched, noMatch, byTop: Array<[id, count]>, misses: object[] }`.
- CLI record: `{ at, query, threshold, top, score, matched, kind }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/route-log.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { appendRouteLog, readRouteLog, summarizeRouteLog } = require('../../src/route-log');

test('route log appends JSONL and summarizes hits and misses', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anabol-log-'));
  try {
    appendRouteLog(root, { query: 'detect SQL injection', top: 'security-review', score: 0.5, matched: true, kind: 'category' });
    appendRouteLog(root, { query: 'bake a cake', top: null, score: 0, matched: false, kind: null });
    fs.appendFileSync(path.join(root, '.anabol', 'route-log.jsonl'), 'not json\n');

    const records = readRouteLog(root);
    assert.strictEqual(records.length, 2);
    const summary = summarizeRouteLog(records);
    assert.strictEqual(summary.total, 2);
    assert.strictEqual(summary.matched, 1);
    assert.strictEqual(summary.noMatch, 1);
    assert.deepStrictEqual(summary.byTop, [['security-review', 1]]);
    assert.strictEqual(summary.misses.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/route-log.test.js`
Expected: FAIL — `Cannot find module '../../src/route-log'`.

- [ ] **Step 3: Implement the log and report**

Implement `src/route-log.js` with `fs.mkdirSync`, `fs.appendFileSync`, `fs.readFileSync`, and a `try/catch` per line. In `src/cli.js`, after a `find` call with `args.log`, append `{ at: new Date().toISOString(), query: args.query, threshold, top: results[0]?.id || null, score: results[0]?.score || 0, matched: results.length > 0, kind: results[0]?.kind || null }`. Add `route:report` to `package.json` running `node scripts/route-report.js`. `scripts/route-report.js` accepts `--structure` and `--json`; prints `total`, `matched`, `noMatch`, the top matched ids, and the last 20 misses.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/unit/route-log.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/route-log.js scripts/route-report.js src/cli.js src/index.js package.json tests/unit/route-log.test.js \
  docs/superpowers/plans/2026-11-01-anabol-router-eval-progress.md \
  docs/measurements/2026-11-01-router-execution.jsonl
git commit -m "feat(log): add opt-in local routing feedback log"
```

---

### Task 6: Verify, schema, docs, and live install

**Files:**
- Modify: `scripts/verify.js`
- Modify: `templates/index.schema.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/how-it-works.md`
- Modify: `docs/architecture.md`
- Modify: `docs/audit-comparative.md`
- Modify: `README.md`
- Modify: `skills/anabol-orchestrator/SKILL.md`

**Interfaces:**
- `verify.js` new checks:
  - `index.categories.length === baseSkills.length` after install into the copy.
  - every category entry: `startLine === 1`, `endLine === lineCount`, `file` exists.
  - `readById(category.id)` returns `whole === true` and `linesRead === lineCount`.
  - `findSegments` for each category description returns a result whose `id` is the category or whose `category` is the category.
  - an off-domain query returns `[]`.
  - `appendRouteLog` + `readRouteLog` work on the copy.
- Existing per-segment `find` check uses `threshold: 0, includeCategories: false` to keep testing segment indexing; the new category checks cover the router.

- [ ] **Step 1: Add the verify checks**

Insert the category checks after the existing exact-range checks and before the idempotency check. Use `baseSkills` (already excludes `META`). For the route-log check, append one record to the copy and read it back; do not touch the live structure.

- [ ] **Step 2: Update the schema and the CI gate**

In `templates/index.schema.json`: set `version.const` to `2`; add `categories` to the top-level `required` list; add a `categories` array property (required: `id`, `category`, `file`, `startLine`, `endLine`, `anchor`, `description`; optional `keywords`; `additionalProperties: false`). Keep `segments` required fields unchanged.

In `.github/workflows/ci.yml`, add a step after the test suite:

```yaml
      - name: Verify end to end (fixture)
        run: node scripts/verify.js --structure tests/fixtures/target-structure
```

This keeps the new router checks CI-gated without requiring a live `~/.config/opencode/skills` on the runner.

- [ ] **Step 3: Update the docs**

- `docs/how-it-works.md`: add a "Routing" section explaining `segments` vs `categories`, the 0.35 threshold, `NO_MATCH`, the segment-before-category tie-break, and the opt-in route log.
- `docs/architecture.md`: add `src/router.js` and `src/route-log.js` to the module table; note `index.categories`.
- `README.md`: show `anf` returning `NO_MATCH`, `anf ... --threshold 0.5`, and `npm run eval:routing`.
- `skills/anabol-orchestrator/SKILL.md`: in the read path, say `anf` may return a category entry; when it does, `anr <category-id>` reads the whole category, and that is the fallback when no segment matches. Document `NO_MATCH` and `--threshold`.
- `docs/audit-comparative.md`: add the router measurement section (fill the numbers in Task 7).

- [ ] **Step 4: Reinstall the meta-skill and reindex the live structure**

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
tar -czf "/root/anabol-backups/skills-before-$STAMP.tar.gz" -C ~/.config/opencode skills
cd /root/anabol-for-agents
ANABOL_NO_DONATE=1 ./scripts/install.sh
node src/cli.js reindex --structure ~/.config/opencode/skills
```

Expected: `skills: 11`, `segments: 10`, `categories: 10` (the meta-skill is excluded).

- [ ] **Step 5: Run tests and verify**

```bash
npm test
npm run verify
```

Expected: `npm test` 80+ pass, 0 fail; `npm run verify` all checks PASS, including the new category checks.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify.js templates/index.schema.json .github/workflows/ci.yml docs README.md skills/anabol-orchestrator/SKILL.md \
  docs/superpowers/plans/2026-11-01-anabol-router-eval-progress.md \
  docs/measurements/2026-11-01-router-execution.jsonl
git commit -m "docs(router): document whole-category routing and verify it end to end"
```

---

### Task 7: Final measurement and report

**Files:**
- Create: `docs/measurements/2026-11-01-router-eval.json`
- Modify: `docs/superpowers/plans/2026-11-01-anabol-router-eval-progress.md`
- Modify: `docs/audit-comparative.md` (numbers)
- Modify: `docs/superpowers/specs/2026-11-01-anabol-router-eval-design.md` (status: implemented)

- [ ] **Step 1: Run the full verification set**

```bash
cd /root/anabol-for-agents
npm test
npm run verify
npm run eval:routing
npm run eval:routing -- --self
npm run eval:routing -- --segments-only --threshold 0
npm run audit
```

Expected: tests PASS; verify PASS; default eval `12/12 (100%)` and `off-domain rejected: 4/4`; self-routing `20/20`; segments-only eval `6/12 (50%)` and `off-domain rejected: 0/4`; audit still reports the segment-only numbers.

- [ ] **Step 2: Measure index, hot path, and latency**

```bash
python3 - <<'PY'
import json, os, statistics, subprocess, time
root = os.path.expanduser('~/.config/opencode/skills')
idx = json.load(open(root + '/.anabol/index.json'))
print('segments', len(idx['segments']), 'categories', len(idx['categories']))
print('index bytes', os.path.getsize(root + '/.anabol/index.json'))
times = []
for _ in range(10):
    t = time.perf_counter()
    subprocess.run(['anf', 'document the architecture with C4 diagrams'], stdout=subprocess.DEVNULL, check=True)
    times.append((time.perf_counter() - t) * 1000)
print('anf p50', round(statistics.median(times)), 'ms', 'p95', round(sorted(times)[-1]), 'ms')
PY
anf "document the architecture with C4 diagrams" | wc -c
```

Record the new index size (expected ≤ 32 KB for the v2 shape), `anf` p50 (expected ≤ 600 ms), and the `find` output bytes (expected ≤ 1 KB).

- [ ] **Step 3: Write the measurement artifact**

Create `docs/measurements/2026-11-01-router-eval.json`:

```json
{
  "date": "2026-11-01",
  "environment": {"node": "24.22.1", "platform": "linux-aarch64"},
  "before": {"top1": "6/12", "offDomain": "0/4", "indexBytes": 15733},
  "after": {"top1": "12/12", "offDomain": "4/4", "selfRouting": "20/20", "indexBytes": 0},
  "latency": {"anfP50Ms": 0, "anfP95Ms": 0},
  "hotPathBytes": 0,
  "commands": [
    "npm test",
    "npm run verify",
    "npm run eval:routing",
    "npm run eval:routing -- --self",
    "npm run eval:routing -- --segments-only --threshold 0",
    "npm run audit"
  ]
}
```

Fill the zeros from Step 2. Also summarize `docs/measurements/2026-11-01-router-execution.jsonl` in the progress file: how many tasks used a segment, how many got `NO_MATCH`, and the total `anf` bytes.

- [ ] **Step 4: Fill the audit section**

In `docs/audit-comparative.md`, add:

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Top-1 routing (12 cases) | 6/12 (50%) | 12/12 (100%) | +50 pp |
| Off-domain rejected | 0/4 | 4/4 | +4 |
| Index size | 15,733 B | 28,663 B | +12,930 B |
| `find` output | ~500 B | ~500 B | ~0 |
| Registered skills | 11 | 11 | 0 |

- [ ] **Step 5: Close the progress and spec**

In `docs/superpowers/specs/2026-11-01-anabol-router-eval-design.md`, change `**Status:** proposed` to `**Status:** implemented`. In the progress file, set `Status: complete`, record the final metrics, and note any follow-up (for example, the Phase 2 section-indexing decision).

- [ ] **Step 6: Commit**

```bash
git add docs/audit-comparative.md docs/measurements/2026-11-01-router-eval.json \
  docs/superpowers/plans/2026-11-01-anabol-router-eval-progress.md \
  docs/superpowers/specs/2026-11-01-anabol-router-eval-design.md
git commit -m "docs(router): record measured routing gains"
```

---

## Self-Review

**Spec coverage:** Goals 1–5 map to Tasks 2 (category entries), 1/3 (tie-break and threshold), 4 (eval), 5 (feedback log). Non-goals are respected: no embeddings, no network, no weight changes, no dependencies. The constraints on output shape, meta exclusion, idempotency, and host-agnostic code each have a task and a check.

**Step scan:** Each task has a failing test, a minimal implementation, a passing run, and a commit. The docs/live task is the only one that touches `~/.config/opencode/skills`, and it backs up first.

**Type consistency:** `rankEntries` returns `kind`; `findSegments` forwards `threshold`/`includeCategories`; `readById` returns `whole`; the CLI and tests use those exact names. `buildIndex` returns `categories`; `verify` and the eval harness read `index.categories`.

**Review Focus coverage:** Off-domain rejection is tested in Task 1 and Task 3; tie-break in Task 1 and Task 3; category-with-no-segment routing and whole reads in Task 3; meta exclusion in Task 2; reinstall stability in Task 6 (`npm run verify`). The wrong-low-confidence-read case is measured in the Execution Protocol and gated by the threshold in Task 3. The plausible-but-irrelevant route is exercised by the `taskQueries` diagnostics and handled by the relevance check. Fresh-context continuation is enforced by the task packet and progress file created before Task 1 and updated in every task commit.

**Execution economics:** The plan deliberately uses native execution for the seven sequential tasks and reserves subagents for bounded reviews. The task packet (plan section + spec section + listed files + routed segment + progress file) is the unit of context; the whole plan and the whole index are never loaded per task. The execution JSONL measures whether that held. The Phase 2 section-indexing idea is explicitly out of scope until the measurement justifies it.
