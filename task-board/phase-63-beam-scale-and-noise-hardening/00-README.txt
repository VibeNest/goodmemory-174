Phase 63 Breakdown: BEAM Scale And Noise Hardening
==================================================

This breakdown is intentionally compact. It lists current work and accepted boundaries only; detailed historical run notes were removed from this current entrypoint.

Current Boundary
----------------

- Phase 63 is active and partial.
- Phase 62 LongMemEval is accepted and no longer blocks BEAM.
- Current Phase 63 work targets provider-free BEAM recall diagnostics and small live BEAM slices before any public score.
- Main phase file: `task-board/68-phase-63-beam-scale-and-noise-hardening.txt`

Accepted Evidence
-----------------

- LongMemEval accepted close: `run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-retry-r1-merged-20260517T161058Z`, 454/500 answer accuracy, evidence-session recall 0.9590, missed recall 35, wrong recall 6, wrong answers 46, and `executionFailures: 0`.
- BEAM smoke: `run-phase63-beam-smoke-current`, gate `run-20260518003000`.
- BEAM adapter proof: `run-phase63-beam-100k-full-initial-20260518T000335Z`, real 100K export, all four profiles, `executionFailures: 0`.
- First rules-only recall diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-full-20260518T005500Z`, evidence-chat recall 0.11625896794910878, missed 340/355.
- Best small live slice: `run-phase63-beam-100k-live-slice-rules-context-ordered-pruning-v6-initial3-escalated-20260518T160743`, answer accuracy 3/3, evidence-chat recall 1.0.
- Latest accepted retained run: `run-phase63-beam-100k-recall-diagnostic-rules-combinatorics-probability-event-order-current-20260613T053232Z`, evidence-chat recall 0.8852626872345183, missed 73/355, wrong-recall/noise 216/400, zero-recall 0.

Current Task Queue
------------------

1. Keep the latest combinatorics-probability event-order coverage repair (zero-recall is 0; reducing event_ordering noise one case at a time).
2. Continue with one named retained miss/noise family at a time.
3. Prefer source-ordered summary and event-order fill/noise cases for the next loop.
4. Reject broad selector rewrites unless analyzer deltas prove they do not add regressions.
5. Keep documentation updates short and evidence-linked.

Acceptance Checks For A Retained Repair
---------------------------------------

- Focused regression is red before the repair and green after it.
- `bun run typecheck` passes, or a known idle hang is recorded with focused evidence.
- Retained diagnostic completes with `executionFailures: 0`.
- Analyzer comparison shows no negative recall deltas, hit-loss, newly-missing evidence, or positive missing-id deltas. Positive noise deltas are accepted only as explicitly documented same-conversation reinforcement tradeoffs with recall unchanged on the rippled case.
- Docs mention only the accepted latest run and current next boundary.

Commands
--------

```text
bun test tests/unit/recall.selection.test.ts tests/unit/run-phase-63.beam-recall-diagnostic.test.ts tests/unit/analyze-phase-63-recall-diagnostic.test.ts --timeout 60000
bun run typecheck
bun run eval:phase-63-recall-diagnostic -- --benchmark-root /private/tmp/BEAM --profile goodmemory-rules-only --run-id <run-id>
bun run analyze:phase-63-recall-diagnostic -- --report-path <report> --baseline-report-path <baseline> --benchmark-root /private/tmp/BEAM
git diff --check
```
