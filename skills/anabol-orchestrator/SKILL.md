---
name: anabol-orchestrator
description: Install skill packages by merging them into existing category skills (never growing skill count) and read only the indexed line range of a merged segment at task time. Use when installing a skill package, adding capabilities, checking installed segments, or when a task matches a merged sub-skill.
---

# Anabol Orchestrator

Anabol **fuses** packages into skills you already have. Installing a package must never
add a new skill or agent directory.

## Install a package

1. Resolve the target skills root. OpenCode default: `~/.config/opencode/skills`.
2. Dry-run and review the routing:

   ```bash
   node <anabol>/src/cli.js install \
     --source <package-dir> \
     --structure <skills-root> \
     --dry-run
   ```

3. If a skill is routed to the wrong category, add this to its frontmatter and rerun:

   ```yaml
   anabol-category: <existing-category-id>
   ```

4. Install for real (omit `--dry-run`).
5. Verify `skillsBefore === skillsAfter` in the report. If it grew, stop and inspect the
   source package — a package directory without `SKILL.md` is ignored.

Re-installing the same package is idempotent: the old segment is replaced, not duplicated.

## Read a merged sub-skill (the token-saving path)

1. Route **without loading the index into context**:

   ```bash
   anf "<what the task needs>"
   ```

   `anf` is a short wrapper for `node <anabol>/src/cli.js find --structure <skills-root>`.
   If it is not installed, run the CLI directly:

   ```bash
   node <anabol>/src/cli.js find --structure <skills-root> --query "<what the task needs>"
   ```

   It prints `id`, `file`, `startLine-endLine`, `description`, and `score` — a few hundred
   bytes, not the whole index.

2. Read **only** that range:

   ```bash
   anr <segment-id>
   ```

   or `read(path=<skills-root>/<file>, offset=startLine, limit=endLine - startLine + 1)`
   when you already have the file and range.

   If the segment lists `assets`, those files live at `<skills-root>/<asset-path>`.
   Read one only when the task needs it; the segment body already points at the right path.

3. If you need to browse instead of route, read `<skills-root>/.anabol/index.json`.

4. Do **not** read the whole category `SKILL.md` when one segment answers the task.

If the file was edited and the anchor no longer matches:

- run `node <anabol>/src/cli.js reindex --structure <skills-root>`, or
- grep for `<!-- ANABOL:SEGMENT id=<id> -->` and read from there to the matching
  `<!-- /ANABOL:SEGMENT id=<id> -->`.

The CLI does this automatically:

```bash
node <anabol>/src/cli.js read --structure <skills-root> --id <segment-id>
```

## Reference

The installer copies two unregistered reference documents inside this skill:

- `reference/ingest.md` — categorization, dry-run, reindex, troubleshooting
- `reference/donate.md` — donation prompt rules and controls

Read them only when needed. In the source repository they live at
`skills/anabol-ingest/SKILL.md` and `skills/anabol-donate/SKILL.md`.

## Rules

- Never create a new skill/agent to install a package.
- Never split merged content into separate files.
- Keep category skills as the only registered skills.
- The donation prompt is optional and must never block an install.
