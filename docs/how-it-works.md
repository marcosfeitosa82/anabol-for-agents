# How Anabol Works

Anabol has one job: **add capability without adding skills**. It does that by nesting an
incoming package's skills inside the category skills you already have, then indexing the
exact lines so the orchestrator can read only what it needs.

## 1. Ingest

`discoverSource(pkg)` walks the package and reads every `SKILL.md`. `discoverSkills(root)`
reads the skills already installed — each one is a **category**. For each incoming skill,
Anabol picks a target category:

1. `anabol-category: <id>` in the incoming frontmatter, when that category exists;
2. name, description, and an excerpt of the category body overlap with the incoming skill;
3. the closest existing category (never create a new one when categories exist).

On an empty structure there is nothing to merge into, so each incoming skill becomes its own
category. That is the only case where the count grows.

## 2. Merge

The incoming body is written into the category's `ANABOL:SEGMENTS` region:

```markdown
<!-- ANABOL:SEGMENT id=sql-injection-scan desc=Detect%20SQL%20injection%20vulnerabilities. -->
## sql-injection-scan

# SQL injection scan
Look for string-concatenated SQL and require parameterized queries.
<!-- /ANABOL:SEGMENT id=sql-injection-scan -->
```

The per-segment marker pair makes boundaries exact even when the incoming body contains its
own headings. The routing description lives **inside the marker**, URL-encoded, so it
survives quotes and newlines.

A human-readable table of contents is generated between `ANABOL:TOC` and `/ANABOL:TOC`:

```markdown
- sql-injection-scan — Detect SQL injection vulnerabilities. (lines 31–35)
```

## 3. Index

`.anabol/index.json` stores, per segment:

```json
{
  "id": "sql-injection-scan",
  "category": "security",
  "file": "security/SKILL.md",
  "startLine": 31,
  "endLine": 35,
  "anchor": "## sql-injection-scan",
  "description": "Detect SQL injection vulnerabilities.",
  "keywords": ["sql", "inject", "query", "vulnerability", "parameter"]
}
```

`startLine`/`endLine` are 1-based and inclusive. The anchor is the segment heading. `keywords`
are the most frequent prose tokens in the segment, captured at merge time so `find` can route
terse descriptions without reading the body at task time.

### Assets

A skill may ship files next to its `SKILL.md` (`references/`, `scripts/`, `assets/`,
templates). Merging only the body would leave those links dangling, so `install`:

1. copies every shipped file (except the top-level `SKILL.md` and `README.md`) to
   `<category>/anabol-assets/<segment-id>/<original-path>`;
2. rewrites the relative references in the body to that path — markdown links and images
   (including `./`, fragments, and titles), inline code, and HTML `src`/`href`;
3. records the copied files in the index entry as `assets` (structure-relative paths);
4. replaces the whole `anabol-assets/<segment-id>` directory on reinstall, so removed files
   do not linger.

Only paths that actually exist in the source skill are rewritten, so external URLs and
absolute paths are untouched. The category stays self-contained: copying the category
directory carries its assets with it.

The TOC and the line numbers depend on each other — writing the TOC shifts every segment.
Anabol therefore runs a fixed-point cycle: build → render TOC → rebuild → render TOC →
build. The TOC has a fixed number of lines, so a second render is enough to absorb any
range-width change; the final build stores ranges that match the written file, so the first
read uses the fast path.

## 4. Routing

`find` ranks two kinds of index entry:

- **segments** — one merged sub-skill, with an exact line range;
- **categories** — one whole category skill (`index.categories`), from line 1 to the end of
  the file. The meta-skill is never an entry, so it can never be routed to.

Both use the same score — `max(overlap, containment)` over id, description, and keywords.
Results are sorted by score, then a segment wins a tie against a category, then by id.
Entries below the default threshold of **0.35** are dropped: an off-domain task returns
`NO_MATCH` (or `[]` with `--json`) instead of a low-confidence guess.

A category entry is the fallback when no merged segment matches but the category as a whole
does — for example, a `security` task that no single scanner covers. The orchestrator routes
first, then reads:

- segment winner → `anr <segment-id>` reads only those lines;
- category winner → `anr <category-id>` reads the whole category file.

`find` is advisory. A score just above the threshold can still be the wrong entry; when the
winner is not obviously relevant, skip it and read the task's own files instead.

### Opt-in route log

`find` writes nothing by default. With `--log`, it appends one JSON line per decision to
`<structure>/.anabol/route-log.jsonl` — local only, never sent anywhere. `npm run route:report`
summarizes matched/no-match counts, the most frequent winners, and the last misses, which is
the raw material for improving descriptions and keywords.

## 5. Segment read

At task time the orchestrator:

1. runs `anabol find --query "<task>"`, which scores the index **outside the model context**
   and prints the winning segment;
2. reads `file` with `offset=startLine, limit=endLine-startLine+1`.

That is the whole saving: instead of loading a category skill with every merged sub-skill,
the agent loads one segment — and instead of loading the index, it loads one routing line.

### Stale index fallback

If a human edits the file, the stored lines drift. Before using them, the reader checks
that `lines[startLine-1]` equals the anchor. If it does not, it scans for
`<!-- ANABOL:SEGMENT id=<id> -->` … `<!-- /ANABOL:SEGMENT id=<id> -->` and reads from
there. It never returns the wrong lines. Running `reindex` restores the fast path.

## 6. Idempotency

Before merging, Anabol removes any existing segment with the same id — including the
`desc=` variant of the marker. Re-installing a package replaces segments instead of
duplicating them.

## Cost model

For `S` segments in a category, reading one segment costs roughly `1/S` of the category
file. The index entry itself is a few lines. The skill *count* — and therefore the
description text present on every request — does not change.
