# GoodMemory Phase 30 Quality Gate

Canonical accepted gate run: `run-20260421153410`

Canonical provider-backed live-memory behavioral report: `run-phase30-live-accepted`

## Command

```bash
bun run gate:phase-30
```

## Scope

- trace-backed first-action behavioral scoring for coding-agent behavioral cases
- accepted Codex host runtime trace emission through internal support only
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
  - `reports/eval/live-memory/phase-30/run-phase30-live-accepted/report.json`

## Results

- Deterministic gate command set: accepted.
- Provider-backed live-memory behavioral report: accepted.
- `gate:phase-30` proves:
  - `bun run typecheck` passed
  - targeted trace/eval/telemetry regressions passed
  - `bun run eval:phase-30` passed
  - the canonical live-memory report is trace-backed
  - all 11 blocking live-memory behavioral cases are trace-backed
  - warning traces keep the actual model warning text instead of replacing it with fixture prose
  - unrelated warning text does not satisfy the expected warning category
  - negated approval text does not satisfy the `approval_required` warning category
  - subject-verb negation such as "production deploy does not require approval" is regression-covered
  - inverse object negation such as "production deploy requires no approval" is regression-covered
  - modified no-approval wording such as "requires no explicit approval" is covered by a token-window rule
  - contracted negation such as "approval isn't required" and "approval won't be required" is regression-covered
  - positive constraints such as "do not deploy without approval" still satisfy `approval_required`
  - 7 of 11 blocking live-memory cases passed on the GoodMemory path
  - live-memory `first_attempt_policy_adherence` is `0.6364`
- The live-memory report proves:
  - provider-backed Postgres storage bootstrap passed
  - memory-stack preflight passed
  - structured cases required trace-backed scoring
  - no execution failures occurred
  - `layer_d` remained the canonical metric surface

## Canonical Evidence Rule

Only the accepted gate run and accepted live-memory report above are canonical for Phase 30. Earlier local accepted runs built before warning fallback hardening are superseded and must not be used as closure evidence. Later local reruns are validation artifacts only and must not be checked in as another accepted Phase 30 chain unless the archive doc, current-status doc, task-board references, and release tests are intentionally repointed together.

## Acceptance Decision

Phase 30 is accepted as the trace-backed behavioral enactment and live closure slice.
It closes the Phase 25 deterministic-only gap by proving that behavioral evaluation consumes host-style first executable traces, that the accepted Codex host path can emit runtime traces internally, and that provider-backed live-memory evidence satisfies the trace-backed behavioral gate without widening the public API, making priming release-blocking, or changing the Bun-only release boundary.
