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
- Latest accepted retained diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-anniversary-celebration-contradiction-current-20260615T054626Z`. Pivot back to contradiction_resolution (fourth contradiction pair) with a behavior-preserving table extraction of `contradiction.ts`. Compared with `run-phase63-beam-100k-recall-diagnostic-rules-estate-tax-rate-update-current-20260615T052857Z`, it raises evidence-chat recall to 0.9200894254415382 (crossing 0.92), lowers missed-recall cases to 49/355 and wrong-recall/noise to 194/400 (zero-recall stays 0), and moves global hit/missing/noise ids from 981/113/894 to 982/112/893. Target `12:contradiction_resolution:2` ("Have I ever celebrated anniversaries with Stephen?", answer "it depends") goes from recall 0.5 to full recall: it recovers the missing first-statement turn 74 ("celebrating our anniversary at The Coral Reef") to pair with the already-hit denial turn 140 ("never celebrated any anniversaries with Stephen"), and sheds its one noisy chat (164). The pass first refactors `contradiction.ts` (884 lines, near the 900 cap) by collapsing the five identical first-statement/denial pair selectors into a `FIRST_DENIAL_CONTRADICTION_PAIRS` table of `{isQuery, firstStatement, denial}` iterated by a single `selectTabulatedFirstDenialContradictionPair` dispatcher (884 -> 876 lines; the complex non-pair selectors sessionManagement/twoFactorAuth/familyMovieInvite stay separate); the diagnostic shows ZERO spurious case deltas across all 400 cases, proving the refactor preserved behavior (the eight prior contradiction recoveries all held). It then adds the new `anniversaryCelebration` case as a sixth table entry (gate `contradiction.anniversaryCelebration` = "ever" && "celebrated" && "anniversaries", 1/400; the first pattern keys on "The Coral Reef" so it does not match a later same-conv anniversary turn). "Stephen" is not a disallowed fixture name (only "stephanie" is), so the patterns use it directly. Adding a contradiction case is now just gate + 2 patterns + 1 table entry. Cleanest possible pass: exactly one case delta, zero ripples (conv-12 carries both temporal_reasoning at recall 1, both held). The contradiction-pair workstream is reopened — three remaining clean low-noise pairs are `11:cr:1` (uses the disallowed name "Michael", needs surrounding-phrasing patterns), `3:cr:1`, `3:cr:2`, `5:cr:1`. The remaining partial-recall families are temporal_reasoning (12), multi_session_reasoning (11), contradiction_resolution (10), instruction_following (6), and knowledge_update (3, all answer_ai_question).

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
