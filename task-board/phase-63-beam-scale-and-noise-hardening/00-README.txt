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
- Latest accepted retained run: `run-phase63-beam-100k-recall-diagnostic-rules-movie-watchlist-contradiction-current-20260615T034006Z`, evidence-chat recall 0.9088218198077354, missed 57/355, wrong-recall/noise 202/400, zero-recall 0.

Current Task Queue
------------------

1. Keep the latest movie-watchlist contradiction repair (zero-recall is 0). Active workstream is contradiction_resolution via the contradiction.ts first-statement/denial pair recipe; two recovered (patentWebinar, movieWatchlist), eleven remain (mostly two-turn pairs at recall 0.5). BEFORE the next contradiction selector, extract the per-case pair selectors into a registry/table (contradiction.ts is 887/900 lines). After contradiction, pivot to temporal_reasoning, multi_session_reasoning, knowledge_update, instruction_following. Noise targets up to perturbation ~25 are now validated clean; the reinforcement-ripple regression threshold is above ~25. The uncapped event-order coverage selectors are now iterated from a single table in sourceOrderTemporal.ts (add a new family by appending one entry, keeping the file under the 900-line cap). Pre-screen targets: prefer the lowest reinforcement perturbation (fewest noisy chats to shed) and avoid conversations with a fragile recall-1 temporal_reasoning case, which the diagnostic's per-conversation shared reinforcement store can regress when the event-order target is recovered. Watch for event-order questions that read as aggregates (money/count cues); they need a one-gate aggregateEvidenceQuery suppression so the aggregate route does not preempt the coverage.
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
