# GoodMemory Phase 56 Quality Gate

Canonical accepted gate run: `run-20260504003000`

Phase 56 closes Hypothesis-Carrying Raw Internalization. It keeps the durable
and public surface stable while upgrading the raw lane from exemplar selection
alone to support/conflict retrieval, transient task hypotheses, and probe-time
execution for high-confidence symbolic and exact host-action carryover.

## Evidence

- Deterministic targeted eval:
  - `reports/eval/fallback/phase-56/run-phase56-fallback-current/report.json`
  - Regenerate with
    `bun run eval:phase-56 -- --run-id run-phase56-fallback-current`
- Canonical live-memory behavioral report:
  - `reports/eval/live-memory/phase-56/run-phase56-live-current/report.json`
  - Regenerate with
    `bun run eval:phase-56-live-memory -- --run-id run-phase56-live-current`
- Quality gate:
  - `reports/quality-gates/phase-56/run-20260504003000/phase-56-quality-gate.json`
  - Regenerate with
    `bun run gate:phase-56 -- --run-id run-20260504003000`
- Follow-up full-300 research summary:
  - `docs/GoodMemory-ImplicitMemBench-Full-300-Research-Summary.md`

## Accepted Scope

- internal support/conflict raw retrieval views rather than a single ranked
  exemplar list
- internal `RawTaskHypothesis` formation with stable/varying slot separation
- transient raw execution for symbolic formulas, exact host-action recovery,
  slot rebinding, and bounded guarded-decision hints
- runtime-kit and the Phase 49 research harness sharing the same
  hypothesis-carrying raw resolver without widening the public API or adding a
  new public memory family
- targeted deterministic + live evidence proving:
  - deterministic and live `executionFailures = 0`
  - `goodmemory-raw-experience` improved from the frozen targeted baseline of
    `6 / 12` to `11 / 12`
  - `goodmemory-distilled-feedback` still passed all 12 targeted task files
  - targeted raw and distilled explicit recall leaks remained `0`
  - raw diagnostics now distinguish `memory_miss`, `support_conflict`,
    `hypothesis_missing`, `executor_unsafe`, and
    `reasoning_after_correct_hypothesis`
- required Postgres-backed 5-shard full-300 follow-up proving the targeted raw
  gain was not just a narrow slice effect:
  - raw `45 / 200`
  - distilled `152 / 200`
  - conditioning raw/distilled `22 / 100`, `87 / 100`
  - procedural raw/distilled `23 / 100`, `65 / 100`
  - structured first-action raw/distilled `8 / 35`, `21 / 35`

## Gate Coverage

The quality gate requires:

- `bun run typecheck`
- targeted raw-support/conflict, task-hypothesis, transient-executor,
  runtime-kit, context-builder, reviewer, compiler, telemetry, eval, and runner
  regressions
- canonical `eval:phase-56` regeneration
- canonical `eval:phase-56-live-memory` regeneration
- accepted live-memory evidence with:
  - `goodmemory-raw-experience` passing more targeted blocking cases than the
    frozen pre-Phase-56 baseline
  - `goodmemory-distilled-feedback` passing all targeted conditioning,
    procedural, and structured first-action cases
  - targeted raw and distilled explicit recall leak counts at or below the
    frozen baseline
- required sharded Postgres full-300 rerun executed with:
  - explicit `GOODMEMORY_STORAGE_PROVIDER=postgres`
  - explicit `GOODMEMORY_STORAGE_URL=$GOODMEMORY_TEST_POSTGRES_URL`
  - per-process `GOODMEMORY_EVAL_MAX_CONCURRENCY=1`
  - provider-backed embeddings and assisted extraction

## Outside The Accepted Claim

- public API or public config widening
- a new durable public memory kind or new public record collection
- full-300 ImplicitMemBench rerun as a release hard gate or public product
  claim
- benchmark-specific runtime hacks or per-task-file prompt patches as the
  accepted product mechanism
