# GoodMemory Phase 25 Quality Gate

Canonical deterministic gate run: `run-20260420082358`

## Command

```bash
bun run gate:phase-25
```

## Scope

- Internal-only outcome-telemetry runtime and deterministic behavioral evidence after Phase 24.
- Outcome-telemetry lineage from repeated failed first actions into governed `procedural_pattern` proposals.
- Backward-compatible compilation into durable `validated_pattern` feedback without requiring a source feedback memory id.
- Canonical Layer D reporting with exact behavioral adaptation metrics.
- Priming kept as a research gate with paired experimental/control delta and separate constraint violation accounting.
- No public API widening, no public config widening, and no README-level default behavior changes.
- Provider-backed live-memory behavioral closure remains outside this deterministic gate.

## Commands Covered

- `bun run typecheck`
- `bun test tests/unit/evolution.behavioral-telemetry.test.ts tests/unit/evolution.reviewer.test.ts tests/unit/evolution.gates.test.ts tests/unit/eval.behavioral-adaptation.test.ts tests/unit/run-phase-25.script.test.ts tests/integration/evolution.outcome-telemetry.test.ts`
- `bun run eval:phase-25`

## Canonical Artifacts

- Deterministic gate:
  - `reports/quality-gates/phase-25/run-20260420082358/phase-25-quality-gate.json`
- Deterministic eval report:
  - `reports/eval/fallback/phase-25/run-1776673441250/report.json`

## Results

- Deterministic gate: accepted.
- Execution failures: `0`.
- `raw-experience`: first-attempt policy adherence `0`, failure avoidance `0`, procedure generalization `0`.
- `outcome-telemetry`: non-empty conditioning profile with first-attempt policy adherence `1` and failure avoidance `1`.
- `distilled-feedback`: first-attempt policy adherence `1`, failure avoidance `1`, procedure generalization `1`.
- Summary Layer D:
  - `first_attempt_policy_adherence`: `0.6`
  - `failure_avoidance_rate`: `0.6667`
  - `inhibition_success_rate`: `0.6667`
  - `procedure_generalization_rate`: `0.5`
  - `priming_delta`: `0.5`
  - `constraint_violation_rate`: `0`
- Priming remains non-blocking; low or zero `priming_delta` would not fail this gate.

## Acceptance Decision

Phase 25 is accepted as a deterministic internal runtime-and-evidence slice.
It proves GoodMemory can evaluate and promote outcome-derived first-action avoidance through the existing proposal and compiler path on the deterministic gate path, while keeping the surface area internal and preserving earlier public guarantees.
It does not, by itself, prove provider-backed live-memory behavioral closure.
