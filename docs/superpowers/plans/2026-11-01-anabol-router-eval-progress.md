# Router Eval — Progress

Status: in progress
Current task: 3
Last commit: Task 2 (whole-category index entries)
Decisions:
- Task 2 ruling: the plan's category test reused segment-bearing content for the meta-skill, which made `index.segments.length` 4 instead of the asserted 2. Used a segment-free meta-skill fixture so the test isolates category shape. Cost if wrong: none for production; the live meta-skill has no segments.
- Task 2 ruling: `stripMergedBlocks` also removes the `ANABOL:SEGMENTS` wrapper markers, because the plan's own assertion `!stripped.includes('ANABOL:SEGMENT')` also matches the plural wrapper. Cost if wrong: category keywords lose only marker text.
Test evidence:
- Task 1 `node --test tests/unit/router.test.js` → 7/7 pass
- Task 2 `node --test tests/unit/indexer.test.js tests/integration/pipeline.test.js` → 19/19 pass; `npm test` → 83/83 pass
Route used: `anf "index whole category entries and exclude the meta skill"` → `database-schema-designer` 0.1667 (below 0.35, rejected; task packet used)
Next task: 3 — Route and read whole categories
