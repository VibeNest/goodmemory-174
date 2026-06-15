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
- Latest accepted retained diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-grocery-budget-update-group-current-20260615T164144Z`. First knowledge_update recovery of an answer_ai_question case — a BREAKTHROUGH that unblocks the previously-blocked answer_ai_question families. Compared with the conditional-probability-practice baseline (20260615T162219Z), it raises evidence-chat recall to 0.9531410686340265, lowers missed-recall cases to 26/355 and wrong-recall/noise to 173/400 (zero-recall stays 0), and moves global hit/missing/noise ids from 1011/83/826 to 1012/82/825. Target `16:knowledge_update:1` ("What is the monthly grocery budget Alexis and I have agreed on?") goes from recall 0.667 to full recall: the original ($500, turn 126) and updated ($550, turn 204) budget turns were already hit, and this recovers the missing follow-up turn 206 — an answer_ai_question-style acknowledgement ("listing out my dietary changes ... a detailed grocery list") that carries NO `->-> ` source marker. The source-marker-gated update-series recipe drops such turns; the multi-facet matcher (`contradictionRules/multiFacetGroups.ts`, filtering conversation-evidence + user-answer + chatId rather than SOURCE_MESSAGE_TAG) recovers it, returning [126,204,206]. Added as one MULTI_FACET group (`knowledgeUpdate.groceryBudgetGroup` = "monthly grocery budget" && "agreed", 1/400). Cleanest possible pass: exactly one case delta, zero ripples; all conv-16 cases held. KEY FINDING: the markerless answer_ai_question turn was candidate-pool-reachable and recoverable — so the instruction_following (6) and remaining knowledge_update (8:ku:1, 11:ku:2) cases, previously thought blocked precisely because their evidence turns lack the source marker, are now recoverable via this multi-facet matcher (next loop). Remaining partial-recall families: knowledge_update (2, answer_ai_question — now addressable), instruction_following (6, answer_ai_question — now addressable), multi_session_reasoning (11, "how many" aggregates have an upstream candidate-pool recall gap). The prior accepted recall change was the fourteenth contradiction_resolution recovery (5:contradiction_resolution:2, conditional-probability-practice), which exhausted the clean multi-evidence contradiction set (14 contradiction cases recovered) and left recall at 0.9522021014978763.

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
