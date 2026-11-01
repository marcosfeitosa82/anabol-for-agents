# Anabol Comparative Audit

**Is Anabol a real anabolic for agents?** This document measures it against a conventional
install on the same content, same machine, same queries. Raw data: [audit-results.json](audit-results.json).

## Resumo em português

- **Contagem de skills:** 5 pacotes de 10 skills → **60 skills (convencional) vs 11 (Anabol)**,
  **81,7% menos**. O meta-skill do Anabol é o único custo fixo (+1).
- **Contexto always-on:** **21.012 B → 3.819 B**, **81,8% menor**.
- **Custo por tarefa:** **43.514 B → 26.292 B**, **39,6% menor** — **somente com o comando
  `find`**. Se o agente ler o `index.json` inteiro, o custo sobe para 92.093 B (pior que o
  baseline). O `find` é obrigatório, não opcional.
- **Leitura do segmento vs arquivo inteiro da categoria:** **135.662 B → 22.129 B**,
  **83,7% menor**.
- **Instalação:** Anabol é **4,9× a 7× mais lento** (3,4 s vs 0,7 s para 5 pacotes). Custo
  único.
- **Disco:** **+1,7% a +2,0%** (marcadores/TOC). Irrelevante.
- **Veredito:** ganho real em **contagem de skills, contexto always-on e leitura por tarefa**;
  ganho **condicional** em tokens por tarefa (exige `find`); **sem ganho** em velocidade de
  instalação ou disco. É um anabolizante real para **escala de skills**, não para latência de
  instalação.

## Verdict

| Claim | Result | Evidence |
| --- | --- | --- |
| Installing a package never grows the skill count | **PASS** | 1→1 and 5→1 package installs; 60→11 vs baseline 60 |
| Read only the needed segment | **PASS** | 22,129 B segment vs 135,662 B whole category (83.7% less) |
| Lower always-on context | **PASS** | 18,192 B → 3,349 B (81.6% less) |
| Lower per-task context | **PASS with `find`** | 43,514 B → 26,292 B (39.6% less); without `find`, 92,093 B (worse) |
| Host-agnostic | **PASS** | generic adapter + OpenCode adapter |
| Free, skippable donation | **PASS** | non-TTY, timeout, `--no-donate`, `ANABOL_NO_DONATE=1` tested |
| Faster install | **FAIL** | 4.9×–7× slower than a plain copy |
| Less disk | **FAIL** | +1.7%–2.0% (markers + TOC) |

**Bottom line:** Anabol is a real anabolic for **skill-count scalability and always-on
context**, and a conditional one for **per-task tokens**. It is not a faster installer and
does not reduce disk usage. The `find` command is part of the contract: reading the whole
index can erase the per-task gain.

## Method

### Environment

- Alpine Linux 3.24.3, aarch64, Node v24.22.1, no runtime dependencies.
- Live structure: 10 ECC skills (`security-review`, `tdd-workflow`, `git-workflow`, …).
- The audit ran on **copies in `/tmp`**; the live structure was not modified.

### Content

The package is the same 10 ECC skills, copied under synthetic ids (`pkg1-<id>`,
`pkg2-<id>`, …) so they do not collide with the target categories and can be installed
repeatedly. Bodies and descriptions are the real ones (152 KB of skill content).

- **Target:** 10 existing category skills.
- **Baseline:** conventional install — copy every package skill into the target
  (`10 + 10×N` skills).
- **Anabol:** merge every package skill into the existing categories
  (`10` categories + `1` meta-skill; `10×N` segments).
- **Scenarios:** `N = 1` and `N = 5` packages (10 and 50 incoming skills).
- **Task query:** `"test-driven development write a failing test first coverage"`.
- **Per-task cost:**
  - Baseline: always-on descriptions + the separate skill file.
  - Anabol: always-on descriptions + `find` output + the segment text.
  - Naive Anabol: always-on + the **whole** `index.json` + the segment text (shown to prove
    why `find` matters).

### Metrics

- Registered skills: directories containing `SKILL.md`.
- Always-on bytes: `name + description` for every registered skill (what the orchestrator
  sees on every request).
- Total bytes: sum of all `SKILL.md` files.
- Task bytes: as defined above.
- Token estimate: `bytes / 4` (a proxy, not a model tokenizer).
- Install time: wall clock, `fs.cpSync` (baseline) vs `install()` (Anabol), same machine.
- `find` latency: 20 runs of `node src/cli.js find` on a 50-segment structure.

## Results

### 1. Cumulative installs (real ECC content)

| Packages | Baseline skills | Anabol skills | Reduction | Baseline always-on | Anabol always-on | Reduction |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 20 | 11 | **45.0%** | 7,004 B | 3,819 B | **45.5%** |
| 5 | 60 | 11 | **81.7%** | 21,012 B | 3,819 B | **81.8%** |

The Anabol column includes the one installed meta-skill (`anabol-orchestrator`, 1 skill,
2 unregistered reference files). Package installs add **0** registered skills.

### 2. Per-task read (query: TDD / failing test / coverage)

| Packages | Baseline skill | Anabol segment | Whole category | Baseline task | Anabol task (`find`) | Naive index path | Ratio | Tokens saved* |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 22,502 B / 591 L | 22,129 B / 585 L | 45,134 B / 1,179 L | 29,506 B | 26,292 B | 39,280 B | 0.891 | **804** |
| 5 | 22,502 B / 591 L | 22,129 B / 585 L | 135,662 B / 3,531 L | 43,514 B | 26,292 B | 92,093 B | 0.604 | **4,306** |

\* Estimated as `(baseline bytes - Anabol bytes) / 4`.

- Segment vs baseline skill: **1.7% smaller** — essentially parity. The segment drops the
  frontmatter and adds a heading; the real win is not reading the *whole category*.
- Segment vs whole category: **51.0%** (1 package) and **83.7%** (5 packages) smaller.
- `find` output: **344 B** — the index (13,332 B / 66,145 B) never enters the context.
- Naive index path: **33.1% larger** than baseline at 1 package and **111.6% larger** at 5.
  Reading the full index is an anti-pattern.

### 3. Install and disk

| Packages | Baseline install | Anabol install | Slowdown | Baseline total bytes | Anabol total bytes | Disk delta |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 125.55 ms | 905.47 ms | **7.21×** | 228,752 | 233,317 | **+2.0%** |
| 5 | 677.26 ms | 3,384.78 ms | **5.00×** | 686,256 | 697,645 | **+1.7%** |

Install is one-time; the per-task context gain repeats on every request. Total bytes grow
slightly because merged bodies are duplicated into categories and wrapped in markers/TOC.

### 4. `find` latency

On this aarch64 host, Node startup dominates:

- `node -e ""`: ~264 ms
- `node --version`: ~94 ms
- `node src/cli.js find` on 50 segments: **~501 ms** (median 497 ms, 20 runs)

At an estimated 50–100 tokens/s, saving 804–4,306 tokens per task is worth ~8–86 s of model
time — far more than the ~0.5 s routing call. On a typical x86 host, Node startup is much
lower, so the overhead is smaller. A shell/awk fast path is listed as future work.

### 5. Small fixture (CI-reproducible)

`tests/fixtures/source-ecc` (8 small skills) into `tests/fixtures/target-structure`
(3 categories), with the meta-skill:

| Metric | Conventional | Anabol | Delta |
| --- | ---: | ---: | ---: |
| Registered skills | 11 | 4 | 63.6% fewer |
| Always-on bytes | 950 | 611 | 35.7% smaller |
| Task bytes | 1,153 | 845 | 26.7% smaller |
| Estimated tokens/task | 289 | 212 | 77 saved |
| Total SKILL.md bytes | 2,310 | 6,869 | 197.4% larger |

The fixture is tiny; its storage overhead is exaggerated. It is useful for CI and for
verifying the mechanics, not for judging real-world token economics.

### 6. Assets (real install, 2026-11-01)

Four skills that ship files (`c4-architecture`, `mermaid-diagrams`, `qa-test-planner`,
`session-handoff`) were merged into the live structure after asset support landed.

| Metric | Conventional | Anabol | Delta |
| --- | ---: | ---: | ---: |
| Registered skills | 15 | **11** | 26.7% fewer |
| Always-on name+description | 5,880 B | **3,829 B** | 34.9% smaller |
| `c4-architecture` per task | 11,066 B | **10,720 B** | 3.1% smaller |
| `c4` segment vs whole category | 48,358 B | **10,224 B** | 78.9% smaller |
| `mermaid-diagrams` segment vs category | 48,358 B | **6,940 B** | 85.6% smaller |
| `qa-test-planner` segment vs category | 41,701 B | **18,889 B** | 54.7% smaller |
| `session-handoff` segment vs category | 10,667 B | **5,758 B** | 46.0% smaller |

- **Assets:** 26 files / 227,921 B copied next to their categories; 21 relative links
  rewritten; 0 dangling.
- **Hot path:** the assets are not loaded with the segment. A reference file is read only
  when the task needs it (e.g. `c4-syntax.md`, 14,564 B).
- **`anf` latency:** 478 ms average on this aarch64 host (254 ms is Node startup).

The per-task gain against a separate skill is parity (3.1%–7.8%); the real gain is not
reading the whole merged category (46%–86% smaller) and not registering four more skills.

### 7. Router coverage (2026-11-01)

Before the router, `find` scored only merged segments and had no confidence threshold, so a
task with no matching segment got a low-confidence guess — and every whole category skill was
unreachable.

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Top-1 routing (12 labeled cases) | 6/12 (50%) | **12/12 (100%)** | +50 pp |
| Off-domain queries rejected | 0/4 | **4/4** | +4 |
| Self-routing (every index entry) | — | **20/20** | — |
| Index size | 15,733 B | **28,663 B** | +12,930 B (+82%) |
| `find` output | ~500 B | ~500 B | ~0 |
| Registered skills | 11 | 11 | 0 |

The labeled cases and off-domain queries live in `scripts/routing-cases.json`;
`npm run eval:routing` reproduces the table. A frozen holdout lives in
`scripts/routing-cases-holdout.json`: `npm run eval:routing:holdout` scores **7/8 top-1** and
**4/4 off-domain**. The single miss (`check naming and immutability conventions` →
`naming-analyzer` instead of `coding-standards`) is kept as-is; the holdout is not used to
retune the threshold or the queries. Whole-category entries add one row per base
skill to the index (the meta-skill is excluded), so the index grows slightly while the skill
count stays the same. The v2 index budget is **32 KB**; the earlier 25 KB estimate predates
whole-category entries and the index never enters the agent context. The confidence
threshold is `0.35`; it was calibrated on a copy in
`/tmp` (`0.30` rejected only 3/4 off-domain, `0.35` and `0.40` both gave 12/12 and 4/4).

## Does it match the proposal?

The project promises: no count growth, no tool-limit surprises, lower token/memory cost,
host-agnostic adapters, and a free/skippable donation prompt.

- **No count growth:** validated for packages. The meta-skill is a one-time +1. After 5
  packages, the difference is 60 vs 11 skills. A no-op reinstall is byte-identical, including
  `index.generatedAt`.
- **No tool-limit surprises:** structurally validated — packages do not register new skills
  or agents. The meta-skill adds one skill, not one tool.
- **Lower token/memory cost:** validated for always-on context and for per-task context
  **when `find` is used**. Without `find`, the index cost can exceed the saving.
- **Read only the needed segment:** validated against the whole category (51%–84% less).
  Against a separate skill file, it is parity, not a win.
- **Host-agnostic:** the generic adapter is implemented; OpenCode is the first host.
- **Free/skippable donation:** validated by tests (non-TTY, timeout, env var, flag).

## Limitations

1. **Synthetic package:** the package is a renamed copy of the same 10 ECC skills. Real
   third-party packages have different sizes, descriptions, and overlap.
2. **One target and one query:** routing quality varies with category descriptions and task
   wording. Use `anabol-category` overrides when needed.
3. **Token estimate, not a tokenizer:** `bytes / 4` is a proxy. Actual token counts differ by
   model and content.
4. **No end-to-end LLM latency benchmark:** the audit measures context bytes and file I/O,
   not model time-to-first-token or task completion time.
5. **`find` startup:** ~0.5 s on this host; a shell fast path is future work.
6. **Install slowdown and disk overhead:** real, but one-time/small.
7. **Meta-skill cost:** +1 registered skill and its description. The installer deliberately
   copies ingest/donate as unregistered reference files to keep this at +1.

## Recommendations

1. **Always route with `find`; never load `index.json` into context.** This is the difference
   between a 39.6% task saving and a 111.6% regression at 5 packages.
2. **Keep category descriptions meaningful.** `find` uses id + description + body keywords;
   terse descriptions rely on keywords.
3. **Use `anabol-category` for ambiguous skills.** Categorization is a routing decision, not
   an exact science.
4. **Install in batches, then measure.** The gain grows with the number of packages and the
   number of segments per category.
5. **Future work:** a shell/awk `find` fast path, a compact per-category index, and an
   optional embedding-based router. None are required for the current gain.

## Re-verification (2026-11-01)

The numbers above were re-measured after two fixes found by the live end-to-end test:

- `parseFrontmatter` now understands YAML block scalars (`>-`, `|`). One real skill used
  `description: >-`, so its routing description had been indexed as the literal `">-"`.
  Always-on bytes are higher on both sides now because the real description is counted.
- A no-op install/reindex is byte-identical: `index.generatedAt` is preserved when the
  segments do not change.

`node scripts/verify.js` reproduces the end-to-end checks against any installed structure
without modifying it (57/57 checks pass on the live structure).

## Reproduce

```bash
# small, CI-friendly
npm run audit -- --packages 1 --meta-skill skills/anabol-orchestrator/SKILL.md

# real content: copy the live ECC skills to /tmp first (never audit in place)
# then:
node scripts/audit.js \
  --source /tmp/anabol-audit-source \
  --target /tmp/anabol-audit-target \
  --packages 5 \
  --query "test-driven development write a failing test first coverage" \
  --meta-skill skills/anabol-orchestrator/SKILL.md \
  --json
```

Raw results for the fixture, 1-package, and 5-package runs: [audit-results.json](audit-results.json).
