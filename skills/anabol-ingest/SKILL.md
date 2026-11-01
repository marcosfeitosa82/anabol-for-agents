---
name: anabol-ingest
description: Ingest and merge a skill package into existing category skills with Anabol. Use for dry-run planning, category overrides, reindexing, verifying that skill count did not grow, and troubleshooting merge or index problems.
---

# Anabol Ingest

Ingest reads a source package, categorizes each incoming `SKILL.md` against the skills you
already have, and merges its body into the matching category skill as a marked segment.

## Commands

```bash
# plan only — writes nothing
node <anabol>/src/cli.js install --source <pkg> --structure <root> --dry-run --json

# merge
node <anabol>/src/cli.js install --source <pkg> --structure <root>

# rebuild the line index after manual edits
node <anabol>/src/cli.js reindex --structure <root>

# inspect
node <anabol>/src/cli.js list --structure <root>
node <anabol>/src/cli.js read --structure <root> --id <segment-id>
```

## Categorization

Order of preference:

1. `anabol-category: <id>` in the incoming skill's frontmatter, if that category exists.
2. Overlap between the incoming name/description and the existing category's name, description,
   **and body excerpt** (stem-aware, threshold-based).
3. The closest existing category — Anabol never creates a new skill when categories exist.

The report's `merged[]` array shows the final decision. If routing is wrong, use an explicit
`anabol-category` and reinstall. On an empty structure only, each incoming skill becomes its
own category (there is nothing to merge into yet).

## What a merge writes

- one `<!-- ANABOL:SEGMENT id=... desc=... -->` … `<!-- /ANABOL:SEGMENT id=... -->` block
  inside the category's `ANABOL:SEGMENTS` region;
- one line per segment in the `ANABOL:TOC` block;
- `.anabol/index.json` with `startLine`, `endLine`, `anchor`, and `description` for every
  segment.

`description` is URL-encoded inside the marker so it survives quotes and newlines.

## Verify

- `skillsBefore === skillsAfter` — the count must not grow.
- `countUnchanged === true`.
- `segments` equals the number of incoming skills.
- `read --id <id>` returns only that segment and `usedFallback` is `false`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Wrong category | add `anabol-category` to the source skill, reinstall |
| Duplicate segment | reinstall (idempotent); if it persists, check for duplicate ids in the package |
| `usedFallback: true` after edits | run `reindex` |
| `segment not found` | run `reindex`, then `list` |
| Count grew | you installed into an empty structure, or a source path is not a skill package |
