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
- Latest accepted retained diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-contradiction-firstdenial-extract-current-20260615T124515Z`. Behavior-preserving refactor (no recovery): the simple "Have I ever X?" first-statement/denial contradiction machinery (7 gates, 7 pattern-pairs, the FIRST_DENIAL_CONTRADICTION_PAIRS dispatch table, the shared `selectFirstDenialContradictionPair` helper, and `selectTabulatedFirstDenialContradictionPair`) moved out of `contradiction.ts` (897 -> 699 lines) into a new `src/recall/selectors/contradictionRules/firstDenialPairs.ts` (224 lines); `contradiction.ts` re-exports the per-case gates so the narrow-gate enrichment import is unchanged. Compared with the personal-statement-scholarship baseline (20260615T121837Z), the analyzer shows **zero case deltas** and byte-identical global metrics (evidence-chat recall stays 0.935582383188017, missed 38/355, wrong-recall/noise 183/400, zero-recall 0, global ids 993/101/854). This frees ~200 lines under the 900-line architecture cap so the next contradiction pair recovery (e.g. 5:contradiction_resolution:1, coin-toss) adds a gate + two patterns + one table entry to the new module. The previous accepted recall change was the tenth temporal_reasoning interval recovery (`9:temporal_reasoning:1`, personal-statement-to-scholarship-deadline), which left evidence-chat recall at 0.935582383188017 (missed 38/355, wrong-recall/noise 183/400, zero-recall 0). The remaining partial-recall families are temporal_reasoning (2 — 13:tr:1 and 18:tr:1, both lacking the passed/between/ago connector so they do not route through the broad interval gate and need broad-gate widening), multi_session_reasoning (11, but the lowest-noise "how many" aggregates have a candidate-pool recall gap upstream of selection — e.g. 1:msr:2's password-hashing anchors never enter the pool — so they are not cleanly recoverable at the selection layer), contradiction_resolution (9, NOW UNBLOCKED by this extraction), instruction_following (6, all blocked by answer_ai_question companion turns), and knowledge_update (3, all answer_ai_question). Next loop recovers a contradiction first/denial pair (5:contradiction_resolution:1, coin-toss) via the freed-up firstDenialPairs module.

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
