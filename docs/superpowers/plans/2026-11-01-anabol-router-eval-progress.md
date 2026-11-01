# Router Eval — Progress

Status: in progress
Current task: 4
Last commit: Task 3 (route and read whole categories)
Decisions:
- Task 2 ruling: the plan's category test reused segment-bearing content for the meta-skill, which made `index.segments.length` 4 instead of the asserted 2. Used a segment-free meta-skill fixture so the test isolates category shape. Cost if wrong: none for production; the live meta-skill has no segments.
- Task 2 ruling: `stripMergedBlocks` also removes the `ANABOL:SEGMENTS` wrapper markers, because the plan's own assertion `!stripped.includes('ANABOL:SEGMENT')` also matches the plural wrapper. Cost if wrong: category keywords lose only marker text.
Test evidence:
- Task 1 `node --test tests/unit/router.test.js` → 7/7 pass
- Task 2 `node --test tests/unit/indexer.test.js tests/integration/pipeline.test.js` → 19/19 pass; `npm test` → 83/83 pass
- Task 3 `node --test tests/integration/router.test.js` → 6/6 pass; `npm test` → 89/89 pass
Route used: `anf "route find to whole categories and read a whole category file"` → `backend-to-frontend-handoff-docs` 0.2 (below 0.35, rejected; task packet used)
Next task: 4 — Eval harness and labeled cases
