---
name: anabol-orchestrator
description: Install skill packages by merging them into existing category skills (never growing skill count) and route each task to a merged segment or a whole category, reading only the indexed lines. Use when installing a skill package, adding capabilities, routing a task, checking installed segments, or when a task matches a merged sub-skill.
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

## Route a task (the token-saving path)

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
   bytes, not the whole index. The winner is one of two kinds:

   - a **segment** — a merged sub-skill, with an exact line range;
   - a **category** — a whole base skill. It spans the whole file and is the fallback when no
     merged segment matches but the category as a whole does.

   `NO_MATCH` means nothing reached the confidence threshold (default **0.35**). Do not read a
   skill from the index in that case; continue with the task's own files. For one query you
   can override the threshold with `--threshold N` (0–1), or ignore whole categories with
   `--segments-only`. The score is advisory: a weak match can still be the wrong entry.

2. Read **only** the winner:

   ```bash
   anr <segment-id>     # segment winner: those lines only
   anr <category-id>    # category winner: the whole category (intended fallback)
   ```

   or `read(path=<skills-root>/<file>, offset=startLine, limit=endLine - startLine + 1)`
   when you already have the file and range.

   If the entry lists `assets`, those files live at `<skills-root>/<asset-path>`.
   Read one only when the task needs it; the body already points at the right path.

3. If you need to browse instead of route, read `<skills-root>/.anabol/index.json`
   (`segments` and `categories`).

4. Do **not** read the whole category `SKILL.md` when one segment answers the task.

To collect local feedback for future improvements, pass `--log` to `find`. It appends one
JSON line per decision to `<skills-root>/.anabol/route-log.jsonl`; nothing leaves the machine.
`npm run route:report` summarizes hits, misses, and the most frequent winners.

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

## Self-improvement

This meta-skill evolves via its own internal reference only — it never creates a new skill
file to accumulate capacity. Improvements are gathered in `docs/self-improve/notes.md` and
applied as text enhancements to this SKILL.md or the index.json; the registry count stays fixed.

### Router conservador (padrão de design)
A safe pattern: a small entry point defines precedence and safety rules, skill manifests define
ownership and boundaries, a project overlay declares local truth, a task-time router chooses a
single primary owner, and a routing trace explains the decision. This mirrors the [openAI
community discussion on overlapping skills](https://community.openai.com/t/how-do-you-handle-overlapping-codex-skills-in-larger-skill-catalogs/1383626)
and is already implemented by `find`: below a threshold it returns `NO_MATCH` rather than guessing.
See `docs/architecture.md` and `docs/audit-comparative.md`.

### Auto-aperfeiçoamento dirigido
Learn from local history, not from new files. When repeated routes produce consistent low scores
(below threshold for several calls with the same query), the orchestrator can note that in
`docs/self-improve/notes.md` and propose whether the index line should be re-tried or the anchor
adjusted — without adding a new skill or agent. No registry growth occurs.

### Referência para Fase 2
Descobertas documentadas em `docs/self-improve/notes.md` (Fase 1): Meta Context Engineering (bi-level optimization), Skill-MAS evolvível meta-skill, e context engineering 2026. Cada descoberta é registrada com link e aplicação sugerida; nenhum novo arquivo é criado.
