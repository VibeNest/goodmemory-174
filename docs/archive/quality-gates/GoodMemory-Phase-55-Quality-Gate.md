# GoodMemory Phase 55 Quality Gate

Canonical accepted gate run: `run-20260503233000`

Phase 55 closes Probe-Conditioned Raw Carryover And Retrieval Calibration. It
keeps the durable and public surface stable while hardening the raw lane around
probe-conditioned exemplar selection, raw prompt isolation, interference-aware
reranking, and explicit abstention.

## Evidence

- Deterministic targeted eval:
  - `reports/eval/fallback/phase-55/run-phase55-fallback-current/report.json`
  - Regenerate with
    `bun run eval:phase-55 -- --run-id run-phase55-fallback-current`
- Canonical live-memory behavioral report:
  - `reports/eval/live-memory/phase-55/run-phase55-live-current/report.json`
  - Regenerate with
    `bun run eval:phase-55-live-memory -- --run-id run-phase55-live-current`
- Quality gate:
  - `reports/quality-gates/phase-55/run-20260503233000/phase-55-quality-gate.json`
  - Regenerate with
    `bun run gate:phase-55 -- --run-id run-20260503233000`
- Follow-up full-300 research summary:
  - `docs/GoodMemory-ImplicitMemBench-Full-300-Research-Summary.md`

## Accepted Scope

- internal `RawCarryoverPacket` separation between retrieval-side enriched text
  and prompt-side minimal exemplar payloads
- probe-conditioned `RawQueryIntent`, exact-slot extraction, multi-view
  candidate generation, and an internal interference ledger for raw carryover
- internal lightweight reranker/training helpers plus explicit abstention when
  candidate confidence or separation is not good enough
- runtime-kit and the Phase 49 research harness sharing the same calibrated raw
  resolver without widening the public API or adding a new public memory family
- targeted deterministic + live evidence proving:
  - deterministic and live `executionFailures = 0`
  - `goodmemory-raw-experience` improved beyond the frozen targeted baseline
    from `5 / 12` to `6 / 12` live blocking passes
  - `goodmemory-distilled-feedback` still passes all 12 targeted task files
  - targeted raw and distilled explicit recall leaks remain `0`
  - raw diagnostics now distinguish abstention, memory miss, wrong exemplar,
    and post-retrieval reasoning failure

## Gate Coverage

The quality gate requires:

- `bun run typecheck`
- targeted raw-exemplar, behavioral-policy, runtime-kit, context-builder,
  reviewer, compiler, telemetry, eval, and runner regressions
- canonical `eval:phase-55` regeneration
- canonical `eval:phase-55-live-memory` regeneration
- accepted live-memory evidence with:
  - `goodmemory-raw-experience` passing more targeted blocking cases than the
    frozen pre-Phase-55 baseline
  - `goodmemory-distilled-feedback` passing all targeted conditioning,
    procedural, and structured first-action cases
  - targeted raw and distilled explicit recall leak counts at or below the
    frozen baseline

## Outside The Accepted Claim

- public API or public config widening
- a new durable public memory kind or new public record collection
- full-300 ImplicitMemBench rerun as a release hard gate or public product
  claim
- benchmark-specific runtime hacks or per-task-file prompt patches as the
  accepted product mechanism
