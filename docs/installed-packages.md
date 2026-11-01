# Installed packages

Record of third-party skill packages merged into the live OpenCode structure with Anabol.

## softaworks/agent-toolkit — engineering subset

- **Source:** https://github.com/softaworks/agent-toolkit
- **Commit:** `3027f20`
- **License:** MIT (Copyright © 2026 Leonardo Flores)
- **Installed:** 2026-11-01
- **Result:** 6 skills merged into 3 existing categories; registered skill count **11 → 11**.

| Skill | Category | Why |
| --- | --- | --- |
| `database-schema-designer` | `change-impact` | Schema design, indexing, migrations, constraints |
| `backend-to-frontend-handoff-docs` | `change-impact` | API handoff documentation for frontend |
| `openapi-to-typescript` | `coding-standards` | OpenAPI 3.0 → TypeScript interfaces and type guards |
| `naming-analyzer` | `coding-standards` | Variable/function/class naming review |
| `requirements-clarity` | `intent-driven-development` | YAGNI/KISS clarification before coding |
| `frontend-to-backend-requirements` | `intent-driven-development` | Document frontend data needs for backend |

### Selection criteria

The first batch was limited to **self-contained prose** because Anabol merged only the
`SKILL.md` body. Asset support (2026-11-01) removed that limitation: shipped files are copied
to `<category>/anabol-assets/<segment-id>/` and relative references are rewritten.

## softaworks/agent-toolkit — asset-bearing skills

- **Source:** same repository, commit `3027f20`, MIT.
- **Installed:** 2026-11-01
- **Result:** 4 skills merged into 3 categories; registered skill count **11 → 11**.
- **Assets:** 26 files / 227,921 B, copied next to their categories.

| Skill | Category | Assets |
| --- | --- | ---: |
| `c4-architecture` | `change-impact` | 3 |
| `mermaid-diagrams` | `change-impact` | 7 |
| `qa-test-planner` | `tdd-workflow` | 6 |
| `session-handoff` | `verification-loop` | 10 |

Relative links in the merged bodies were rewritten to `anabol-assets/<id>/...`
(21 links, 0 dangling). Assets stay off the hot path: they are read only when a task
actually needs the reference file.

### Usage

```bash
anf "document the architecture with C4 diagrams"
anr c4-architecture          # body points at anabol-assets/c4-architecture/references/...
```

### Reproduce

```bash
git clone --depth 1 https://github.com/softaworks/agent-toolkit /tmp/agent-toolkit
# build a package with an `anabol-category:` frontmatter key per skill, then:
node src/cli.js install --source <package> --structure ~/.config/opencode/skills --dry-run
node src/cli.js install --source <package> --structure ~/.config/opencode/skills
```

### Usage

```bash
anf "design a database schema with indexes and migrations"
anr database-schema-designer

anf "generate TypeScript types from an OpenAPI spec"
anr openapi-to-typescript
```
