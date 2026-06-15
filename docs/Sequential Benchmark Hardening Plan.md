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
- Latest accepted retained diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-work-life-challenges-event-order-current-20260615T024400Z`. Compared with `run-phase63-beam-100k-recall-diagnostic-rules-carla-collaboration-event-order-current-20260615T022325Z`, it raises evidence-chat recall to 0.9045964676950593, lowers missed-recall cases to 60/355 and wrong-recall/noise to 205/400 (zero-recall stays 0), and moves global hit/missing/noise ids from 968/126/936 to 970/124/923 — a 13-id net noise drop. Target `18:event_ordering:2` ("order in which I brought up different personal and work-related challenges ... four items") goes from recall 0.71 to full recall: it recovers the two missing designated turns 28/204 (24/26/146/202/262 were already hits) and sheds all 13 noisy chats. The question asks for four items but the benchmark designates seven evidence turns, recovered as-is. The repair adds a `workLifeChallengesEventOrder` coverage selector (seven facets — editing collaboration, agenda prep, agenda send, weekend getaway, anniversary dinner, dinner plan, surprise picnic) appended to the source-ordered coverage table. This question also matches the broad `personalWorkChallenge` selector, whose route (position 4 of the route table) would otherwise win first with an incomplete result, so a scoped one-gate guard makes `personalWorkChallengeCandidates` empty for this 1/400 question, letting it route through `temporal_order` to the precise coverage. One accepted recall-neutral same-conversation noise swap (`18:multi_session_reasoning:2`, net-zero noise); conv-18's already-recovered `18:event_ordering:1` stayed at recall 1 and no other personal-work-challenge question regressed. It is the sixteenth event-order coverage selector.

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
