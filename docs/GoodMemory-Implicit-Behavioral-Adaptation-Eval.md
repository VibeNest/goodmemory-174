# GoodMemory Implicit Behavioral Adaptation Eval

## Purpose

Phase 24 adds an internal eval layer for implicit behavioral adaptation. The goal is to measure whether prior experience changes the first action after interference, not whether memory can merely recall old facts.

This eval is inspired by ImplicitMemBench and adapts its learning/interference/test protocol to GoodMemory. The fixture subset is intentionally small and internal.

## Eval Contract

Each fixture has:

- `learning_phase`
- `interference_phase`
- `test_probe`
- `expected_first_action`
- `forbidden_first_action`
- `feedback_signal`
- `scoring_mode`

The runner executes two separate profiles:

- `raw-experience`: replay learning and interference through `remember()` only.
- `distilled-feedback`: replay the same turns, then apply `feedback_signal` through `feedback()`.

These profiles must stay separate. A low raw-experience score means GoodMemory has not yet learned to distill implicit experience without explicit procedural feedback.

## Metrics

- `firstAttemptPassRate`: blocking first-action pass rate for procedural and conditioning cases.
- `proceduralAdherenceRate`: exact first-action adherence for procedural rules.
- `failureAvoidanceRate`: first-action avoidance for negative-outcome conditioning.
- `inhibitionPassRate`: conditioning pass rate for avoiding known-bad actions.
- `primingInfluenceScore`: non-blocking priming signal score.
- `behavioralRegressionCases`: blocking failed procedural or conditioning cases.
- `explicitRecallLeakCount`: answers that reveal memory mechanics instead of acting.

Priming is report-only in Phase 24. It must not fail the deterministic gate.

## Non-Goals

- No public API changes.
- No public rollout config changes.
- No default runtime behavior promotion.
- No claim that raw experience already becomes durable procedural memory automatically.

The accepted Phase 24 gate proves the harness exists and is regression-covered. If later work should improve raw-experience behavior, it should start as a new phase.
