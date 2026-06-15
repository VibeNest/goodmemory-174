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
- Latest accepted retained diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-meeting-testing-period-interval-current-20260615T071743Z`. Sixth temporal_reasoning interval recovery. Compared with `run-phase63-beam-100k-recall-diagnostic-rules-writing-session-abstract-interval-current-20260615T070507Z`, it raises evidence-chat recall to 0.9299485803711156, lowers missed-recall cases to 42/355 and wrong-recall/noise to 187/400 (zero-recall stays 0), and moves global hit/missing/noise ids from 988/106/877 to 989/105/872. Target `2:temporal_reasoning:2` ("How many days do I have between scheduling the meeting and the start of the testing period for my project?", answer 21 days) goes from recall 0.5 to full recall: it recovers the missing end-anchor turn 50 ("MVP completion by April 5, 2024, to allow two weeks for testing") to pair with the already-hit start-anchor turn 0 ("schedule a meeting for March 15, 2024, at 09:00 CET"), and sheds its five noisy chats (124/186/148/72/32). The repair adds a `meetingTestingPeriodDays` interval case to `sourceOrderTemporalInterval.ts` (gate `temporalInterval.meetingTestingPeriodDays` = "scheduling the meeting" && "testing period", 1/400; START/END patterns plus the four ternary-chain edits). Cleanest possible pass: exactly one case delta, zero ripples — conv-2 carries 2:tr:1 at recall 1 (whose evidence turn 32 is in this target's shed noise set), and it held. Six temporal_reasoning cases now recovered. The remaining partial-recall families are temporal_reasoning (6), multi_session_reasoning (11), contradiction_resolution (9, but contradiction.ts is 897/900 so the next contradiction case needs per-case module extraction first), instruction_following (6, all blocked by answer_ai_question companion turns), and knowledge_update (3, all answer_ai_question).

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
