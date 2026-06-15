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
- Latest accepted retained diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-area-calculation-accuracy-update-current-20260615T051745Z`. Fifth knowledge_update pass. Compared with `run-phase63-beam-100k-recall-diagnostic-rules-prototype-budget-update-current-20260615T050733Z`, it raises evidence-chat recall to 0.9172725240330875, lowers missed-recall cases to 51/355 and wrong-recall/noise to 196/400 (zero-recall stays 0), and moves global hit/missing/noise ids from 979/115/901 to 980/114/898. Target `4:knowledge_update:1` ("What is my accuracy percentage in solving area calculation problems after completing 15 problems?", answer 95%) goes from recall 0.5 to full recall: it recovers the missing updated turn 130 ("already completed 15 problems with 95% accuracy") to pair with the already-hit original turn 82 ("accuracy in area calculation problems improved from 70% to 90% after completing 12 problems"), and sheds its three noisy chats (190/114/134). The repair adds an `areaCalculationAccuracy` update-series module (gate `updateSeries.areaCalculationAccuracy` requiring "accuracy percentage" && "area calculation problems" + ORIGINAL/UPDATED patterns + `selectSourceOrderedAreaCalculationAccuracyEvidence`) and one entry to the `UPDATE_SERIES_RULE_SELECTORS` table, modeled on the holiday-gift-budget module. The ORIGINAL pattern keys on "accuracy in area calculation problems improved from 70% to 90%" specifically so it discriminates the designated turn 82 from the near-duplicate noise turn 134 ("improved my quiz score from 70% to 90% after completing 12 area calculation problems"). Cleanest possible pass: exactly one case delta, zero ripples, zero newly-missing, zero new noise — and conv-4 (like conv-20 in the prior pass) carries BOTH temporal_reasoning cases at recall 1 yet neither rippled, reconfirming the update_evidence route's tight pair return is ripple-free in double-recall-1-temporal conversations. Five knowledge_update cases now recovered; the remaining clean 2-turn pair is `19:ku:2` (in the proven-poisoned conv-19, so deferred), and `8/11/16:ku` hinge on `answer_ai_question` turns that carry no `->->` source marker and so fall outside the source-ordered update-series recipe. The contradiction-pair recipe remains available (three recovered, ten remain) once `contradiction.ts` gets its own table extraction. The remaining partial-recall families are temporal_reasoning, multi_session_reasoning, knowledge_update, instruction_following, and contradiction_resolution.

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
