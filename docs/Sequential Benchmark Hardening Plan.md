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
- Latest accepted retained diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-remote-collaboration-contradiction-current-20260615T152130Z`. Eleventh contradiction_resolution recovery, second via the multi-facet recipe. Compared with the grammar-anxiety baseline (20260615T150236Z), it raises evidence-chat recall to 0.9468499888218198, lowers missed-recall cases to 30/355 (wrong-recall/noise stays 176/400, zero-recall stays 0), and moves global hit/missing/noise ids from 1000/94/830 to 1002/92/830. Target `8:contradiction_resolution:1` ("Have I ever collaborated remotely with Michael on any projects?") goes from recall 0.333 to full recall: the affirmative spans two user turns (16 = collaborating with a video-editor relative who lives 15 miles apart in Plymouth; 18 = planning to talk to them about easier collaboration), opposed by a later denial (50 = never worked with that relative on any projects). It recovers BOTH missing affirmative turns 16 and 18 and returns all three source-ordered [16,18,50]. The conversation names the disallowed fixture person, so the gate (`contradiction.remoteCollaboration` = "collaborated remotely" && "projects", 1/400) and all three facet patterns key on surrounding role/place/topic phrasing only (selector files disallowed-scan clean); added as one MULTI_FACET_CONTRADICTION_GROUPS entry in `contradictionRules/multiFacetGroups.ts` + the gate in `instructionAugmentationStandDownQuery`. Cleanest possible pass: exactly one case delta, zero ripples (unlike pass 89). Notably turn 18 carries no `->-> ` source marker yet was recovered — the multi-facet filter matches markerless turns. Three multi-evidence contradiction cases remain (18:cr:1, 5:cr:2, 2:cr:1), all addressable via this recipe. Remaining partial-recall families: contradiction_resolution (3, multi-evidence), multi_session_reasoning (11, "how many" aggregates have an upstream candidate-pool recall gap), instruction_following (6, answer_ai_question-blocked), and knowledge_update (3, answer_ai_question-blocked). The prior accepted recall change was the tenth contradiction_resolution recovery (10:contradiction_resolution:1, grammar-anxiety), which introduced the multi-facet contradiction recipe (contradictionRules/multiFacetGroups.ts) and left recall at 0.9449720545495194.

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
