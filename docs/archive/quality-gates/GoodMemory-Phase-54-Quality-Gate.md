# GoodMemory Phase 54 Quality Gate

Canonical accepted gate run: `run-20260503193000`

Phase 54 closes Exemplar-First Raw Internalization. It keeps the durable and
public surface stable while hardening the raw path around internal episodic
behavioral exemplars, interference-aware selection, abstention, and
prototype-bounded carryover.

## Evidence

- Deterministic targeted eval:
  - `reports/eval/fallback/phase-54/run-phase54-fallback-current/report.json`
  - Regenerate with
    `bun run eval:phase-54 -- --run-id run-phase54-fallback-current`
- Canonical live-memory behavioral report:
  - `reports/eval/live-memory/phase-54/run-phase54-live-current/report.json`
  - Regenerate with
    `bun run eval:phase-54-live-memory -- --run-id run-phase54-live-current`
- Quality gate:
  - `reports/quality-gates/phase-54/run-20260503193000/phase-54-quality-gate.json`
  - Regenerate with
    `bun run gate:phase-54 -- --run-id run-20260503193000`
- Follow-up full-300 research summary:
  - `docs/GoodMemory-ImplicitMemBench-Full-300-Research-Summary.md`

## Accepted Scope

- internal `RawBehavioralExemplar` derivation from experiences, archives, host
  traces, and correction lineage without adding a new public memory family
- interference-aware candidate generation and lightweight reranking for raw
  behavioral carryover, including explicit abstention on low-confidence cases
- exemplar-first raw rendering that emits minimal `situation / successful move /
  observed outcome` carryover instead of defaulting to prose-only behavioral
  steering
- prototype-bounded consolidation and hard-negative generation as internal
  derived maintenance evidence rather than new durable public records
- targeted deterministic + live evidence proving:
  - `goodmemory-raw-experience` improved beyond the frozen targeted baseline
    from `3 / 12` to `5 / 12` live blocking passes
  - `goodmemory-distilled-feedback` passes all 12 targeted task files
  - deterministic and live `executionFailures = 0`
  - targeted explicit recall leaks remain `0`
  - covered structured host-action cases show at least one raw carryover win and
    five distilled structured wins through the shared typed-policy source

## Gate Coverage

The quality gate requires:

- `bun run typecheck`
- targeted exemplar extraction, behavioral-policy, runtime-kit, context-builder,
  reviewer, compiler, telemetry, eval, and runner regressions
- canonical `eval:phase-54` regeneration
- canonical `eval:phase-54-live-memory` regeneration
- accepted live-memory evidence with:
  - `goodmemory-raw-experience` passing more targeted blocking cases than the
    frozen pre-Phase-54 baseline
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
