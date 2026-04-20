# GoodMemory Behavioral Adaptation Closure and Outcome Telemetry

Phase 25 narrows the gap between "memory was stored" and "behavior changed on the first action" on the deterministic internal path.
The slice stays internal-only. It does not widen the public `GoodMemory` API, change README-level defaults, or promote new runtime behavior by default.

The core addition is an internal outcome-telemetry path for conditioning-style failures.
Repeated failed first actions can now be recorded as `tool_outcome` experience telemetry, linked to optional evidence excerpts, reviewed into a `procedural_pattern` proposal, accepted through the existing promotion gates, and compiled into durable `validated_pattern` feedback.
This keeps the Phase 16 promotion path intact while allowing outcome-derived procedural guidance to become reusable behavior.

Phase 25 also replaces the Phase 24 metric surface with a canonical Layer D contract:

- `first_attempt_policy_adherence`
- `failure_avoidance_rate`
- `inhibition_success_rate`
- `procedure_generalization_rate`
- `priming_delta`
- `constraint_violation_rate`

The eval harness now reports three profiles:

- `raw-experience`: learning and interference are replayed through `remember()`
- `outcome-telemetry`: replay plus internal `recordBehavioralOutcome(...)`
- `distilled-feedback`: replay plus explicit `feedback()`

Procedural and conditioning scoring now read only structured `first_action` output.
Later self-correction does not improve the score.
Priming remains a research gate, not a blocking release metric, and is reported as paired experimental/control delta with separate constraint-violation accounting.

Canonical deterministic evidence for this slice is archived in:

- `docs/archive/quality-gates/GoodMemory-Phase-25-Quality-Gate.md`
- `reports/quality-gates/phase-25/run-20260420082358/phase-25-quality-gate.json`
- `reports/eval/fallback/phase-25/run-1776673441250/report.json`

These artifacts do not, by themselves, prove provider-backed live-memory behavioral closure.
