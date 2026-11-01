# Anabol for Agents

**Fuse skills, don't accumulate them.** A meta-skill for any orchestrator (OpenCode,
Claude Code, …) that installs new skill packages by merging their content *into* the skills
you already have — instead of growing the skill/agent count.

```
Before:  skill A, skill B, skill C, [ +8 new skills ]   →  11 skills, context bloat
After:   skill A(merged), skill B(merged), skill C       →   3 skills, indexed segments
```

## Why

Every extra skill pays a tax: its description sits in context on **every** request, the
count grows, and in some hosts it can push you toward tool/agent limits. Anabol inverts the
model — it **nests** new capabilities inside existing category skills as addressable
*segments*, so the orchestrator reads only the lines it needs.

- **No count growth** — installing a package never adds skill or agent files.
- **No tool-limit surprises** — nesting happens by *reading*, not by *registering*.
- **Lower token/memory cost** — a task reads ~N lines of one segment, not the whole file.
- **Host-agnostic** — a thin adapter layer targets OpenCode today, others later.

## How it works

1. **Ingest** — read the source package's skills and your current structure, then categorize.
2. **Merge** — write each incoming skill *into* the existing skill of the same category.
3. **Index** — record the exact `startLine`/`endLine` (plus an anchor) for each segment.
4. **Segment** — at task time, the orchestrator consults the index and reads only that range.

If the index goes stale (file edited, lines shifted), the reader falls back to locating the
**anchor** by marker — so it never reads the wrong lines.

## Quick start

```bash
git clone https://github.com/<you>/anabol-for-agents.git
cd anabol-for-agents

# 1. Install the meta-skill into OpenCode (1 registered skill; donation prompt is skippable)
./scripts/install.sh

# 2. Plan a merge into your existing skills
node src/cli.js install \
  --source /path/to/skill-package \
  --structure ~/.config/opencode/skills \
  --dry-run

# 3. Merge for real
node src/cli.js install \
  --source /path/to/skill-package \
  --structure ~/.config/opencode/skills

# 4. Install the short commands (optional, recommended)
./scripts/install-commands.sh   # anf, anr

# 5. Route a task and read only its segment
anf "detect SQL injection"
anr sql-injection-scan
```

Without the short commands, use the CLI directly:

```bash
node src/cli.js find --structure ~/.config/opencode/skills --query "detect SQL injection"
node src/cli.js read --structure ~/.config/opencode/skills --id sql-injection-scan
```

Other commands:

```bash
node src/cli.js list    --structure <skills-root>   # id, category, line range, description
node src/cli.js reindex --structure <skills-root>   # rebuild .anabol/index.json
```

`install` accepts `--dry-run` and `--json`; `find` accepts `--limit N` and `--json`;
`read` accepts `--json` (includes `file`, `category`, `usedFallback`, and `linesRead`).

The short commands read `ANABOL_STRUCTURE` (default `~/.config/opencode/skills`) and
`ANABOL_CLI` (default `<repo>/src/cli.js`), so they work from any directory:

```bash
anf "design a database schema" --limit 3
anr database-schema-designer
ANABOL_STRUCTURE=/tmp/other-skills anf "testing"
```

## What the orchestrator reads

`anabol find --query "..."` scores the index **outside the model context** and prints only
the winning entry. The index itself looks like this:

```json
{
  "id": "sql-injection-scan",
  "category": "security",
  "file": "security/SKILL.md",
  "startLine": 31,
  "endLine": 35,
  "anchor": "## sql-injection-scan",
  "description": "Detect SQL injection vulnerabilities."
}
```

The agent reads `security/SKILL.md` with `offset=31, limit=5` — not the whole file, and not
the whole index. The `anabol-orchestrator` skill contains the routing rules.

Skills that ship files (`references/`, `scripts/`, `assets/`) keep working: `install` copies
them to `<category>/anabol-assets/<segment-id>/` and rewrites the relative links in the body.
The index entry lists them under `assets`.

## Donation

Anabol is **free** and MIT-licensed. Before installing, `scripts/install.sh` kindly suggests
a donation to support maintenance and new adapters. It is **always skippable** and never
blocks the install:

- `--no-donate` or `ANABOL_NO_DONATE=1` skips it;
- non-interactive stdin skips it automatically;
- timeout or empty answer defaults to "no";
- the prompt cannot change the installer's exit code.

## Documentation

- [How it works](docs/how-it-works.md) — merge/segment mechanic, index, fallback
- [Architecture](docs/architecture.md) — modules, data flow, invariants, failure modes
- [Adapters](docs/adapters.md) — plugging into another orchestrator
- [Comparative audit](docs/audit-comparative.md) — measured gains, limits, and verdict
- [Installed packages](docs/installed-packages.md) — what was merged into this structure and why

## Development

```bash
npm test          # unit + integration tests (node:test, no dependencies)
npm run verify    # end-to-end check against an installed structure (read-only)
npm run audit     # comparative benchmark (writes a report to stdout)
```

Requires Node.js >= 18. No runtime dependencies.

## Status

- OpenCode adapter: implemented.
- Generic adapter contract: implemented; additional hosts are thin wrappers.
- Claude Code adapter: planned.

## License

MIT — see [LICENSE](LICENSE).
