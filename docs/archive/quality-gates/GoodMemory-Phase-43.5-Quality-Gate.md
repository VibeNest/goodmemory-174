# GoodMemory Phase 43.5 Quality Gate

Canonical accepted gate run: `run-20260426140000`

## Command

```bash
bun run gate:phase-43-5 -- --run-id run-20260426140000
```

## Scope

- optional local runtime worker queue for runtime-kit bounded job envelopes
- `goodmemory runtime worker drain-once`, `status`, `recover --dry-run`,
  `start`, and `stop`
- bounded envelopes with job id, host, scopeDigest, kind, attempts, trace
  links, audit state, redacted preview, and no raw transcript payloads
- coalescing for equivalent jobs before execution
- drain-once idempotency and failure-visible worker transitions
- recover dry-run before mutation
- optional daemon state markers without requiring a daemon sidecar

Out of scope:

- persistent distributed worker queue
- managed worker service or cloud sync
- worker as a required sidecar for installed-host recall/writeback/pre-action
- durable memory writes from preview-only worker jobs
- raw transcript archive or full assistant-output persistence
- local viewer or dashboard product

## Artifacts

- Quality gate:
  - `reports/quality-gates/phase-43-5/run-20260426140000/phase-43-5-quality-gate.json`
- Deterministic eval:
  - `reports/eval/fallback/phase-43-5/run-20260426133000/report.json`
- Current status:
  - `docs/GoodMemory-Current-Status-and-Evidence.md`

## Results

- Phase 43.5 quality gate: accepted.
- `bun run typecheck` passed.
- Targeted worker regressions passed, including bounded envelope redaction,
  coalescing, drain-once idempotency, recover dry-run, optional daemon markers,
  CLI surface coverage, and eval/gate schema tests.
- Deterministic Phase 43.5 eval passed 8/8 checks: envelope redaction,
  coalescing, drain-once idempotency, recover dry-run, worker failure
  isolation, optional daemon marker behavior, CLI surface, and no root API
  widening.
- Release assertions prove the CLI/gate scripts are registered, the canonical
  gate points to regenerable fallback evidence, and fallback eval output stays
  ignored rather than tracked as an audit artifact.

## Evidence Rule

Only the gate run above is canonical for Phase 43.5. Reruns should write to a
new run directory. The deterministic fallback eval is regenerable generated
output; the accepted gate artifact is the release-facing audit object.

## Decision

Phase 43.5 is accepted. GoodMemory now has an optional local Runtime Worker
inspection and recovery layer that consumes redacted runtime-kit job envelopes
without making worker, daemon, sidecar, raw transcript archive, or durable
preview-write behavior part of the core contract.
