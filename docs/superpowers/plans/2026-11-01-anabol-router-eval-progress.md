# Router Eval — Progress

Status: in progress
Current task: 7
Last commit: Task 6 (verify, schema, docs, live install)
Decisions:
- Task 2 ruling: the plan's category test reused segment-bearing content for the meta-skill, which made `index.segments.length` 4 instead of the asserted 2. Used a segment-free meta-skill fixture so the test isolates category shape. Cost if wrong: none for production; the live meta-skill has no segments.
- Task 2 ruling: `stripMergedBlocks` also removes the `ANABOL:SEGMENTS` wrapper markers, because the plan's own assertion `!stripped.includes('ANABOL:SEGMENT')` also matches the plural wrapper. Cost if wrong: category keywords lose only marker text.
- Task 4 ruling: threshold stays `0.35`. Calibration on the temp copy: `0.30` rejects only 3/4 off-domain; `0.35` and `0.40` both give 12/12 and 4/4 with lowest winning score 0.50. `0.35` is the lowest passing value. Cost if wrong: a slightly wider off-domain margin would have been available at 0.40.
- Task 6 ruling: the live index is 28,663 B, not the plan's ~24 KB estimate. The extra bytes are the 10 category descriptions/keywords; the skill count is unchanged, and the index never enters context. Cost if wrong: none; `find` still prints one line.
Test evidence:
- Task 1 `node --test tests/unit/router.test.js` → 7/7 pass
- Task 2 `node --test tests/unit/indexer.test.js tests/integration/pipeline.test.js` → 19/19 pass; `npm test` → 83/83 pass
- Task 3 `node --test tests/integration/router.test.js` → 6/6 pass; `npm test` → 89/89 pass
- Task 4 baseline `--segments-only --threshold 0` → 6/12 (50%), off-domain 0/4; new router → 12/12 (100%), off-domain 4/4, lowest winning score 0.50; self-routing → 20/20; `npm test` → 89/89 pass
- Task 5 `node --test tests/unit/route-log.test.js` → 1/1 pass; manual `--log` + `route-report` on `/tmp/anabol-router-live` → total 2, matched 1, noMatch 1; `npm test` → 90/90 pass
- Task 6 `node scripts/verify.js --structure tests/fixtures/target-structure` → 42/42 PASS; live reinstall + reindex → `skills: 11`, `segments: 10`, `categories: 10`, index v2, 28,663 B; `npm test` → 90/90 pass; `npm run verify` → 92/92 PASS
Route used: `anf "verify end to end and update documentation"` → `requirements-clarity` 0.5 (plausible but wrong; task packet used). Advisory routing confirmed: a 0.5 score can still be the wrong entry.
Next task: 7 — Final measurement and report
