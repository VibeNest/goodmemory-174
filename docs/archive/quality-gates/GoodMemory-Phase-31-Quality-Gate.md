# GoodMemory Phase 31 Quality Gate

Canonical gate run: `run-20260422041616`

Canonical provider-backed live-memory behavioral report: `run-phase31-live-current`

## Command

```bash
bun run gate:phase-31
```

## Scope

- trace-backed first-action behavioral scoring for coding-agent behavioral cases
- native Codex host runtime trace capture through `codex exec --json`
- host-lifecycle executable outcomes rather than fixture-derived synthetic outcomes
- native targeted correction lineage through `correctionOfStepIndex`
- deterministic Phase 31 behavioral eval runner and provider-backed live-memory behavioral report validation
- canonical internal-only evidence hardening without public API or public config widening

Out of scope:

- public `GoodMemory` API or public config widening
- making Claude a gate-blocking host path
- changing the Phase 28 local backend contract
- reopening the Phase 29 Bun-only release boundary
- reopening the accepted Phase 30 closure claim

## Canonical Artifacts

- Quality gate:
  - `reports/quality-gates/phase-31/run-20260422041616/phase-31-quality-gate.json`
- Provider-backed live-memory behavioral report:
  - `reports/eval/live-memory/phase-31/run-phase31-live-current/report.json`

## Results

- Deterministic gate command set: accepted.
- Provider-backed live-memory behavioral report: accepted.
- `gate:phase-31` proves:
  - `bun run typecheck` passed
  - targeted host/trace/eval/telemetry regressions passed
  - `bun run eval:phase-31` passed
  - the canonical live-memory report is fully trace-backed across all 12 blocking cases
  - executable blocking outcomes are host-lifecycle derived for all 12 blocking cases
  - native targeted correction lineage appears in 3 canonical live cases
  - provider-backed Postgres storage bootstrap passed
  - memory-stack preflight passed
  - live-memory `first_attempt_policy_adherence` is `0.6667`
  - 8 of 12 blocking live-memory cases passed on the GoodMemory path
  - live procedural generalization passes 2 of 3 blocking cases
- The accepted live-memory report additionally proves:
  - native deploy failure output can produce a real `deploy -> approval warning` correction lineage on the live host path
  - native timeout/failure harnessing no longer depends on fixture-scored synthetic executable outcomes
  - machine-local Codex/Node binary paths are no longer part of the canonical evidence chain

## Canonical Evidence Rule

Only the current gate run and current live-memory report above are canonical for Phase 31. Earlier blocked runs built before native correction lineage closed are superseded and must not be used as closure evidence. Later local reruns are validation artifacts only and must not be checked in as another canonical Phase 31 chain unless the archive doc, current-status doc, task-board references, and release tests are intentionally repointed together.

## Decision

Phase 31 is accepted.
The accepted Phase 30 native-host first-action claim remains intact, and Phase 31 closes the stronger requirement that live Codex behavioral evidence carry host-lifecycle executable outcomes plus native targeted correction lineage without widening the public surface.
