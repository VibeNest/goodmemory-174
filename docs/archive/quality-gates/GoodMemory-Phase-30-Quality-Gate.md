# GoodMemory Phase 30 Quality Gate

Canonical gate run: `run-20260421153410`

Canonical provider-backed live-memory behavioral report: `run-phase30-live-current`

## Command

```bash
bun run gate:phase-30
```

## Scope

- trace-backed first-action behavioral scoring for coding-agent behavioral cases
- native Codex host runtime trace capture through `codex exec --json`
- deterministic trace-backed behavioral eval fixtures and runner
- provider-backed live-memory behavioral report validation
- canonical Phase 25 `layer_d` metric names without public API widening

Out of scope:

- public `GoodMemory` API or public config widening
- making Claude a gate-blocking host path
- changing the Phase 28 local backend contract
- reopening the Phase 29 Bun-only release boundary

## Canonical Artifacts

- Quality gate:
  - `reports/quality-gates/phase-30/run-20260421153410/phase-30-quality-gate.json`
- Provider-backed live-memory behavioral report:
  - `reports/eval/live-memory/phase-30/run-phase30-live-current/report.json`

## Results

- Deterministic gate command set: accepted.
- Provider-backed live-memory behavioral report: accepted.
- `gate:phase-30` proves:
  - `bun run typecheck` passed
  - targeted trace/eval/telemetry regressions passed
  - `bun run eval:phase-30` passed
  - the canonical live-memory report is trace-backed and now sourced from native Codex host events
  - the canonical live-memory report no longer leaks machine-local absolute paths
  - provider-backed Postgres storage bootstrap passed
  - memory-stack preflight passed
  - live-memory `first_attempt_policy_adherence` is `0.5833`
  - 7 of 12 blocking live-memory cases passed on the GoodMemory path
  - live procedural generalization passes 2 of 3 blocking cases
- The accepted live-memory report additionally proves:
  - native Codex host trace capture is sufficient to produce a strict majority of GoodMemory first-action wins
  - the tightened procedural-family gate now passes

## Canonical Evidence Rule

Only the current gate run and current live-memory report above are canonical for Phase 30. Earlier local accepted runs built before native-host revalidation are superseded and must not be used as closure evidence. Later local reruns are validation artifacts only and must not be checked in as another canonical Phase 30 chain unless the archive doc, current-status doc, task-board references, and release tests are intentionally repointed together.

## Decision

Phase 30 is accepted.
The deterministic trace-backed work remains real, the live runner now consumes native Codex host events instead of model-returned `first_action` JSON, and the canonical native-host live report now clears both the overall strict-majority gate and the tightened procedural-family gate.
