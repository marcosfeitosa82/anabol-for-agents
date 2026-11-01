# Anabol Router Eval — Design

**Date:** 2026-11-01
**Status:** implemented

## Intent

The pasted architecture describes a layered runtime stack: guardrails, declarative prompt
compilation (DSPy/AdalFlow), DPO-aligned base weights, inference-time latent steering
(RepE/SAE), and an observability feedback loop.

Most of it lives **below** Anabol: it changes model weights or hidden states. Anabol is a
**context layer** — it decides which skill text enters the context, not how the model
computes. Two layers do map onto Anabol:

- **Layer 2 (declarative compilation):** instead of hand-written routing rules, compile and
  optimize the routing artifacts (descriptions, keywords, weights) against a labeled set.
- **Layer 4 (feedback loop):** capture real routing decisions and feed misses back into the
  next compilation cycle.

The other layers are explicitly out of scope: DPO needs training access, and latent steering
needs hidden-state access that hosted models do not expose.

## Evidence (measured, read-only)

Live structure: 11 skills, 10 merged segments, `.anabol/index.json` 15,733 B.

A 12-query labeled set against the current `find`:

| Router | Top-1 | Notes |
| --- | ---: | --- |
| Current (segments only) | **6/12 (50%)** | Every miss is a category with no merged segment |
| + whole-category entries, segment tie-break, threshold 0.35 | **12/12 (100%)** | Simulated in memory, no files changed |

- Off-domain queries score 0.00–0.33 with the same entries, so a 0.35 threshold rejects them.
- Lowest winning score on the labeled set: 0.50.
- Index grows by ~8.2 KB (15,733 → ~23,949 B). The index is **never** loaded into context, so
  the hot path does not grow; `find` output stays a single line.

Root cause of the misses: `find` only indexes merged segments. Base skills (`security-review`,
`git-workflow`, `error-handling`, `production-audit`, `conventional-commit-review`, …) are
invisible to the router, and a zero-score match is still returned.

## Goals

1. Route to a whole category when no segment matches, without reading the category first.
2. Prefer a specific segment over its parent category when both match equally.
3. Return "no match" instead of a zero-score guess.
4. Make routing quality measurable and regression-proof (eval harness in CI).
5. Capture opt-in, local routing decisions so descriptions/keywords can be improved from
   real misses.

## Non-goals

- Training, DPO, fine-tuning, or any weight change.
- Latent steering, SAE, RepE, or hidden-state hooks.
- Embeddings/vector search in v1 (adds a dependency and a much larger index; revisit only if
  the eval plateaus below target).
- Network calls, telemetry upload, or any privacy-sensitive logging by default.

## Constraints

- No runtime dependencies; Node built-ins only.
- `find` output stays one line per result (hundreds of bytes, not the index).
- The index is an implementation detail; agents must not need to read it.
- Host-agnostic: changes live in `src/`, not in the OpenCode adapter.
- Reinstall/reindex remain idempotent and byte-stable.

## Approaches

**A. Whole-category entries + heuristic ranking + threshold (recommended).**
Add one index entry per skill (excluding the meta-skill), reusing the existing
description/keyword scoring. Prefer segments on ties. Add a confidence threshold and an eval
harness. No new dependency; index +~8 KB; hot path unchanged.

**B. Embedding router.**
Embed descriptions and queries, store vectors in the index. Better semantic recall, but adds
a dependency, an embedding call per query (or a bundled model), and a larger index. Not
justified until A's eval plateaus.

**C. LLM-as-router.**
Ask a model to pick the segment. Highest semantic quality, but adds 0.5–2 s and token cost to
every task — the opposite of the project's goal.

**Decision:** A. B and C stay documented as fallbacks if the eval shows a ceiling.

## Decisions

- Whole entries live in a sibling array, `index.categories`, not in `index.segments`.
  `segments` keeps its exact meaning (one entry per merged sub-skill), so `readById`,
  `verify`, and the audit keep working unchanged. Index version becomes `2`.
- Whole entry shape: `{ id, category, file, startLine: 1, endLine: <line count>, anchor,
  description, keywords }`.
- Keywords for a whole entry are computed from the body **with merged segments removed**, so
  a category does not duplicate its segments' keywords.
- Ranking: `score = max(overlap, containment)`; ties break segment-before-category, then id.
- Threshold: `0.35` default, configurable via `--threshold`.
- No match: `find` prints `NO_MATCH` (plain) or `[]` (`--json`).
- Telemetry: opt-in `--log`, append-only `.anabol/route-log.jsonl`, local only.
- The meta-skill `anabol-orchestrator` is never a routing entry.

## What is left to the builder

- Exact wording of the eval cases beyond the initial 12.
- Whether to expose the threshold in `anf` (planned: `--threshold`).
- The report format of `scripts/route-report.js`.
