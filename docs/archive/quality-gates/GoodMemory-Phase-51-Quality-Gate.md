# GoodMemory Phase 51 Quality Gate

Canonical accepted gate run: `run-20260430164000`

Phase 51 closes Typed Behavioral Memory And Enactment Hardening. It keeps the
durable/public surface stable while hardening GoodMemory's internal behavioral
adaptation path with typed policy compilation, applicability-bounded transfer,
steering-only enactment, and leak suppression.

## Evidence

- Deterministic targeted eval:
  - `reports/eval/fallback/phase-51/run-phase51-fallback-current/report.json`
  - Regenerate with
    `bun run eval:phase-51 -- --run-id run-phase51-fallback-current`
- Canonical live-memory behavioral report:
  - `reports/eval/live-memory/phase-51/run-phase51-live-current/report.json`
  - Regenerate with
    `bun run eval:phase-51-live-memory -- --run-id run-phase51-live-current`
- Quality gate:
  - `reports/quality-gates/phase-51/run-20260430164000/phase-51-quality-gate.json`
  - Regenerate with
    `bun run gate:phase-51 -- --run-id run-20260430164000`

## Accepted Scope

- internal typed behavioral policy payload stored additively on compiled
  `FeedbackMemory(kind="validated_pattern")` attributes
- backward-compatible compiled guidance that keeps legacy `rule`, `why`, and
  `appliesTo` populated
- behavioral policy kinds:
  - `preference`
  - `avoidance`
  - `format_contract`
  - `first_action`
  - `syntax_constraint`
  - `transformation_rule`
  - `exemplar_fact`
- applicability-bounded transfer rules that keep a single exemplar
  `example_only` unless repeated evidence or explicit general feedback proves a
  broader rule
- hidden steering-only behavioral guidance in runtime-kit and targeted eval
  paths so policy can shape behavior without surfacing as visible memory notes
- exact first-action and argument-order preservation for covered host-action
  enactment cases
- targeted Phase 51 deterministic + live evidence with priming remaining
  raw-only research coverage

## Gate Coverage

The quality gate requires:

- `bun run typecheck`
- targeted behavioral-policy, host pre-action, runtime-kit, context-builder,
  compiler, telemetry, and Phase 51 runner regressions
- canonical `eval:phase-51` regeneration
- accepted live-memory evidence with:
  - `goodmemory-raw-experience` reported but non-blocking
  - `goodmemory-distilled-feedback` passing the targeted behavioral bar
  - priming present only in raw-experience
  - covered structured first-action cases proving canonical action
    preservation

## Outside The Accepted Claim

- public API or public config widening
- a new durable public memory kind or new public record collection
- full-300 ImplicitMemBench rerun as a release hard gate
- benchmark-specific runtime heuristics or per-task-file special casing as the
  accepted product mechanism
