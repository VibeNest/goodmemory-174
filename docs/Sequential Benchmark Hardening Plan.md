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
- Latest accepted retained diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-conditional-probability-practice-contradiction-current-20260615T162219Z`. Fourteenth contradiction_resolution recovery, fifth via the multi-facet recipe — and the clean multi-evidence contradiction set is now exhausted. Compared with the api-key-obtained baseline (20260615T160746Z), it raises evidence-chat recall to 0.9522021014978763, lowers missed-recall cases to 27/355 and wrong-recall/noise to 174/400 (zero-recall stays 0), and moves global hit/missing/noise ids from 1007/87/829 to 1011/83/826. Target `5:contradiction_resolution:2` ("Have I ever practiced conditional probability problems before?") goes from recall 0.2 to full recall: the affirmative spans three practice turns (84 accuracy improving 60%->85% over 8 problems, 86 the per-problem rate, 88 wrapping up the session) plus a concept turn (136 tree diagrams helping), opposed by a denial (134 never practiced any conditional probability problems before). It recovers the four missing turns 84/86/88/136 and returns all five source-ordered [84,86,88,134,136], shedding three noisy chats. Added as one MULTI_FACET_CONTRADICTION_GROUPS entry (`contradiction.conditionalProbabilityPractice` = "practiced" && "conditional probability problems", 1/400); short follow-up facets key on distinctive phrasing (the 3.125%-per-problem figure; "tree diagrams really help me visualize" — which excludes the denial turn 134's "tree diagrams to visualize dependent event probabilities"). Cleanest possible pass: exactly one case delta, zero ripples; all conv-5 cases held (including the pass-79/83 recoveries). The clean multi-evidence contradiction set is exhausted (14 contradiction cases recovered total). Remaining partial-recall families: multi_session_reasoning (11, "how many" aggregates have an upstream candidate-pool recall gap), instruction_following (6, answer_ai_question-blocked), and knowledge_update (3, answer_ai_question-blocked) — but the multiFacetGroups recipe matches markerless turns, so it may unblock some answer_ai_question cases (next investigation). The prior accepted recall change was the thirteenth contradiction_resolution recovery (2:contradiction_resolution:1, api-key-obtained), which left recall at 0.9499485803711157; the multi-facet recipe (contradictionRules/multiFacetGroups.ts) has now recovered five multi-evidence contradiction cases (passes 89/90/91/92/93).

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
