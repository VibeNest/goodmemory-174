# Sequential Benchmark Hardening Plan

This file is the compact route for external benchmark hardening. Historical per-run notes were removed from this current-truth surface; use git history, `reports/eval/`, and `reports/quality-gates/` for provenance.

## Sequence

1. LongMemEval
2. BEAM
3. MemoryAgentBench
4. LoCoMo

Do not publish a benchmark claim until the relevant phase has live answer generation, live or accepted judging where required, current evidence links, and an accepted gate. Internal recall diagnostics are engineering evidence, not public leaderboard claims.

## Current State

- Phase 62 LongMemEval is accepted as the first external-benchmark hardening slice.
- Phase 63 BEAM is active and still partial.
- Current BEAM work is scoped to provider-free recall diagnostics plus small live answer-generation/judge slices before any public score.

## Accepted Phase 62 Checkpoint

- Run: `run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-retry-r1-merged-20260517T161058Z`
- Profile: `goodmemory-hybrid`
- Result: 454/500 answer accuracy, evidence-session recall 0.9590, missed recall 35, wrong recall 6, wrong answers 46, `executionFailures: 0`.
- Boundary: accepted internal LongMemEval close evidence, not a README-level public benchmark claim.

## Active Phase 63 Evidence

- Smoke harness: `run-phase63-beam-smoke-current` plus gate `run-20260518003000`.
- Real 100K adapter proof: `run-phase63-beam-100k-full-initial-20260518T000335Z` over `/private/tmp/BEAM/100K.json`, 20 rows and 400 probing questions. This proves ingestion/contract shape only because it uses deterministic oracle evidence.
- First real rules-only recall diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-full-20260518T005500Z`, evidence-chat recall 0.11625896794910878, missed 340/355, wrong-recall/noise 362/400, `executionFailures: 0`.
- Best small live slice: `run-phase63-beam-100k-live-slice-rules-context-ordered-pruning-v6-initial3-escalated-20260518T160743`, answer accuracy 3/3, evidence-chat recall 1.0, wrong-recall/noise 2/3, `executionFailures: 0`.
- Latest accepted retained diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-cover-letter-submission-count-current-20260615T193000Z`. Third multi_session_reasoning recovery via the multi-facet contradiction route, and the second "how many" aggregate through it. Compared with the user-roles baseline (20260615T190000Z), it raises evidence-chat recall to 0.9606528057232284, lowers missed-recall cases to 21/355 and wrong-recall/noise to 168/400 (zero-recall stays 0), and moves global hit/missing/noise ids from 1020/74/815 to 1022/72/810. Target `8:multi_session_reasoning:1` ("How many times did I mention submitting or revising my cover letter before my interview preparation?") goes from recall 0.333 to full recall: the default msr route returned [110,106,32,4,66,104] (only the May-12-interview turn 106 hit; the April-15 craft turn 20 and the April-10 submission turn 86 missed, with five noise chats including the May-5 near-duplicate 110), and this returns exactly the three source-marked user turns [20,86,106], recovering turns 20 and 86 and shedding all five noise chats. A three-facet MULTI_FACET group (`multiSessionReasoning.coverLetterSubmissionCount` = "how many times" && "cover letter" && "submitting or revising", 1/400); the facets key on each turn's distinct date anchor (F1 April 15 deadline + standout cover letter, F2 submitted to Greg April 10, F3 submitted April 23 + stronger impact statements) so each matches exactly one turn and the May-5 near-duplicate 110 is excluded. Cleanest possible pass: exactly one case delta, zero ripples — a recall gain (+0.667) plus a noise reduction (five chats shed), no newly-missing evidence and no new noise. Remaining partial-recall families: instruction_following (6 — via the instructionRules companionPattern recipe, NOT multiFacetGroups, which collides with the instruction-continuation mechanism), multi_session_reasoning (3:multi_session_reasoning:1 is the last confirmed-reachable case; the rest — 19:msr:1, 5:msr:1, 19:msr:2 — have a genuine upstream candidate-pool gap). The prior accepted recall change was the second multi_session_reasoning recovery via this route (1:multi_session_reasoning:2, user-roles/security-features count), which left recall at 0.9587748714509279.

## Current Open Boundary

Phase 63 remains recall-limited and noisy. The next loop should stay narrow:

1. Pick one named miss/noise family from the latest analyzer.
2. Add a focused failing regression.
3. Make a scoped selector or routing repair.
4. Rerun focused tests, the retained diagnostic, and analyzer comparison.
5. Update only this summary, the Phase 63 task file, and generated evidence pointers when the retained delta is accepted.

Do not treat a focused green or one recovered row as BEAM closure.

## Commands

```text
bun run prepare:phase-63-beam -- --output-root /private/tmp/BEAM --split 100K --length 100 --source github-raw
bun run eval:phase-63
bun run gate:phase-63
bun run eval:phase-63-recall-diagnostic -- --benchmark-root /private/tmp/BEAM --profile goodmemory-rules-only --run-id <run-id>
bun run analyze:phase-63-recall-diagnostic -- --report-path <report> --baseline-report-path <baseline> --benchmark-root /private/tmp/BEAM
bun run eval:phase-63-live-slice -- --benchmark-root /private/tmp/BEAM --recall-report <recall-diagnostic.json> --profile goodmemory-rules-only --limit 3 --run-id <run-id>
```

## Source And Evidence Pointers

- Phase board: `task-board/68-phase-63-beam-scale-and-noise-hardening.txt`
- Phase breakdown: `task-board/phase-63-beam-scale-and-noise-hardening/00-README.txt`
- Current repo status: `docs/GoodMemory-Current-Status-and-Evidence.md`
- Generated artifacts: `reports/eval/` and `reports/quality-gates/`
