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
                      │  install · reindex · read    │
                      └──────────────────────────────┘
```

## Modules

| File | Responsibility | I/O |
| --- | --- | --- |
| `src/lib.js` | frontmatter, markers, slugify, stemmer, overlap score | none (pure) |
| `src/ingest.js` | categorize incoming skills against existing categories (name, description, body excerpt) | none (pure) |
| `src/merge.js` | render/insert/remove segment blocks | none (pure) |
| `src/indexer.js` | compute line ranges, anchors, and body keywords from markers | none (pure) |
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
7. Write category files and `.anabol/index.json`.
8. Return a report with `skillsBefore`, `skillsAfter`, `countUnchanged`, `merged`, `index`.

## Invariants

- **Count never grows** when at least one category exists.
- **One segment per incoming id** in the whole structure (removal scans every category).
- **Index lines match the file** after install (two-pass indexing).
- **Reads never return wrong lines**: anchor check, then marker fallback.
- **Install is idempotent**: re-running produces the same set of segments.
- **Dry run writes nothing**: no category edits, no `.anabol/`.

## Failure modes

| Failure | Behaviour |
| --- | --- |
| Malformed segment (no close marker) | skipped by the indexer; not listed |
| Unknown category in `mergeAll` | throws `unknown category: <id>` |
| Unknown segment id on read | throws `segment not found: <id>` |
| Stale lines | marker fallback (`usedFallback: true`) |
| Missing `ANABOL:SEGMENTS` marker | appends at end of file (best effort) |
| Duplicate ids in a package | `dedupeIds` suffixes `-2`, `-3`, … |

## Tests

- `tests/unit/*` — pure modules, one file per module.
- `tests/integration/pipeline.test.js` — acceptance criteria on a temp copy of the fixtures:
  count unchanged, indexing, segment read, stale fallback, idempotency, dry run, reindex,
  first install.
- Fixtures: `tests/fixtures/target-structure` (3 categories) and
  `tests/fixtures/source-ecc` (8 skills across 3 categories).
