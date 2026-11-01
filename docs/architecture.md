# Architecture

```
                      ┌──────────────────────────────┐
  source package ───▶ │ discover.js                  │
                      │  discoverSource()            │
                      └──────────────┬───────────────┘
                                     │ incoming skills
                                     ▼
  existing skills ──▶ ┌──────────────────────────────┐
                      │ ingest.js                    │
                      │  chooseCategory()            │
                      │  bestCategory()              │
                      └──────────────┬───────────────┘
                                     │ assignments
                                     ▼
                      ┌──────────────────────────────┐
                      │ merge.js                     │
                      │  mergeIntoCategory()         │
                      │  removeSegment()             │
                      └──────────────┬───────────────┘
                                     │ new category text
                                     ▼
                      ┌──────────────────────────────┐
                      │ indexer.js                   │
                      │  buildIndex()                │
                      └──────────────┬───────────────┘
                                     │ .anabol/index.json
                                     ▼
                      ┌──────────────────────────────┐
                      │ pipeline.js / cli.js         │
                      │  install · reindex · find ·  │
                      │  read · route log            │
                      └──────────────────────────────┘
```

`find` is the routing path: `pipeline.js` loads `.anabol/index.json`, `router.js` ranks the
segments and whole categories, and `cli.js` prints only the winner (or `NO_MATCH`).

## Modules

| File | Responsibility | I/O |
| --- | --- | --- |
| `src/lib.js` | frontmatter, markers, slugify, stemmer, overlap score | none (pure) |
| `src/ingest.js` | categorize incoming skills against existing categories (name, description, body excerpt) | none (pure) |
| `src/merge.js` | render/insert/remove segment blocks | none (pure) |
| `src/indexer.js` | compute line ranges, anchors, and body keywords from markers; build segment **and** whole-category entries | none (pure) |
| `src/router.js` | rank segments and whole categories, apply the confidence threshold and the segment-before-category tie-break | none (pure) |
| `src/route-log.js` | append, read, and summarize the opt-in local route log | `<structure>/.anabol/route-log.jsonl` |
| `src/assets.js` | collect shipped files, rewrite relative references, copy/remove assets | filesystem (copy layer) |
| `src/segment.js` | read one segment, with stale-index fallback | reads a string; file helper |
| `src/discover.js` | find `SKILL.md` files in a structure or package | filesystem |
| `src/pipeline.js` | orchestrate install / reindex / find / readById; write the index only when it changed | filesystem |
| `src/cli.js` | `install`, `reindex`, `find`, `read`, `list` | stdout/stderr |
| `scripts/verify.js` | end-to-end checks against an installed structure (read-only) | stdout/stderr |
| `src/adapters/generic.js` | host-agnostic adapter contract | filesystem |
| `src/adapters/opencode.js` | OpenCode config/skills-root resolution | filesystem |

Pure modules have no `require('fs')`, which keeps the core deterministic and easy to unit
test. All filesystem work is confined to `discover`, `segment`, `pipeline`, and adapters.

## Data flow of `install`

1. `discoverSkills(structureRoot)` — existing categories (count `N`).
2. `discoverSource(sourceDir)` + `dedupeIds` — incoming skills.
3. `ingest` → assignments; `bestCategory` fallback when below threshold.
4. Load category contents (or a skeleton for a first install).
5. For each incoming skill: `removeSegment` (idempotency) then `mergeIntoCategory`.
6. Index → render TOC → re-index → render TOC → final index.
7. Write category files and `.anabol/index.json`. The index has a `segments` array (merged
   sub-skills) and a `categories` array (one entry per base category, meta-skill excluded).
8. Return a report with `skillsBefore`, `skillsAfter`, `countUnchanged`, `merged`, `index`,
   and `categories`.

## Data flow of `find`

1. Read `.anabol/index.json`; it never enters the caller's context.
2. `router.rankEntries` scores `segments` and `categories` over id, description, and keywords.
3. Drop entries below the threshold (default **0.35**); sort by score, then segment before
   category, then id.
4. `cli.js` prints the winning entry, or `NO_MATCH` / `[]` when nothing passes.
5. `readById` reads the exact segment range, or the whole category file when the winner is a
   category entry (`whole: true`).
6. With `--log`, `route-log.js` appends one local JSON line describing the decision.

The reranker is exhaustive and deterministic: the index is small, so there is no heuristic
pre-filter to get wrong, and the same query always returns the same winner.

## Invariants

- **Count never grows** when at least one category exists.
- **One segment per incoming id** in the whole structure (removal scans every category).
- **Index lines match the file** after install (two-pass indexing).
- **Reads never return wrong lines**: anchor check, then marker fallback.
- **Install is idempotent**: re-running produces the same set of segments.
- **Dry run writes nothing**: no category edits, no `.anabol/`.
- **Routing is pure**: threshold, ordering, and tie-break live in `router.js`, with no I/O.
- **A category entry spans the whole file**: `startLine` is always 1 and `endLine` is the
  line count; the meta-skill is never a routing entry.
- **`find` writes nothing** unless `--log` is passed, and the route log is local.

## Failure modes

| Failure | Behaviour |
| --- | --- |
| Malformed segment (no close marker) | skipped by the indexer; not listed |
| Unknown category in `mergeAll` | throws `unknown category: <id>` |
| Unknown segment id on read | throws `segment not found: <id>` |
| Stale lines | marker fallback (`usedFallback: true`) |
| Missing `ANABOL:SEGMENTS` marker | appends at end of file (best effort) |
| Duplicate ids in a package | `dedupeIds` suffixes `-2`, `-3`, … |
| Query below the confidence threshold | `NO_MATCH` (or `[]` with `--json`); no read |
| Malformed route-log line | ignored by the reader; the report still runs |

## Tests

- `tests/unit/*` — pure modules, one file per module (`router.test.js` covers scoring,
  threshold, and tie-break; `route-log.test.js` covers append/summarize).
- `tests/integration/pipeline.test.js` — acceptance criteria on a temp copy of the fixtures:
  count unchanged, indexing, segment read, stale fallback, idempotency, dry run, reindex,
  first install.
- `tests/integration/router.test.js` — whole-category routing, segment precedence, off-domain
  rejection, `NO_MATCH`, and threshold handling through the CLI.
- Fixtures: `tests/fixtures/target-structure` (3 categories) and
  `tests/fixtures/source-ecc` (8 skills across 3 categories).
