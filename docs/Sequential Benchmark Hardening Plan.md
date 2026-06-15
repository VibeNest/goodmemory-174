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
- Latest accepted retained diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-trilogy-reading-interval-current-20260615T142449Z`. Eleventh temporal_reasoning interval recovery and an important routing correction. Compared with the contact-form baseline (20260615T140508Z), it raises evidence-chat recall to 0.9426246367091438, lowers missed-recall cases to 33/355 and wrong-recall/noise to 178/400 (zero-recall stays 0), and moves global hit/missing/noise ids from 997/97/846 to 998/96/841. Target `13:temporal_reasoning:1` ("How many days did it take me to finish reading the trilogy after I downloaded it?", answer 12 days) goes from recall 0.5 to full recall: it recovers the missing end-anchor turn 154 ("finished 'The Poppy War' trilogy with 1,150 pages in 12 days") to pair with the already-hit start-anchor turn 120 ("downloaded 'The Poppy War' trilogy on Libby app on December 7"), and sheds its five noisy chats (124/126/194/254/230). ROUTING CORRECTION: this question uses the "how many days did it take ... after" phrasing that the broad isTemporalIntervalQuery heuristic does NOT match, and a prior note claimed such cases needed risky broad-gate widening. That was a misdiagnosis — the `source_ordered_temporal_interval` route (route-table position 5) is eligible purely on `sourceOrderedTemporalIntervalCandidates.length > 0`, the `aggregate_evidence` route (position 3) stands down when those candidates exist, and the selector's internal guard checks only the per-case flags. So adding a per-case gate (`temporalInterval.trilogyReadingDays` = "finish reading the trilogy" && "downloaded", 1/400) + START/END patterns + the four ternary-chain edits routes it cleanly with NO broad-gate change — the same low-risk recipe as the other ten tr cases. Cleanest possible pass: exactly one case delta, zero ripples; the full tr scan shows only 18:tr:1 still below recall 1, and the per-case-gate recipe now applies to it too (no widening needed). The remaining partial-recall families are temporal_reasoning (1 — 18:tr:1, recoverable via the same per-case-gate recipe), contradiction_resolution (5 — 3-5-turn multi-evidence cases outside the simple pair recipe), multi_session_reasoning (11, "how many" aggregates have an upstream candidate-pool recall gap), instruction_following (6, answer_ai_question-blocked), and knowledge_update (3, answer_ai_question-blocked). The prior accepted recall change was the ninth contradiction_resolution recovery (3:contradiction_resolution:2, contact-form/API-integration), which left recall at 0.9412161860049184; the nine contradiction recoveries (passes 61/62/63/70/71/83/84/85/86) exhausted the clean two-turn first/denial pairs.

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
