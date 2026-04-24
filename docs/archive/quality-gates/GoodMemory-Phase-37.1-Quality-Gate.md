# GoodMemory Phase 37.1 Quality Gate

Canonical gate run: `run-20260424100757`

Canonical deterministic dogfood report: `run-phase37-1-dogfood-current`

## Command

```bash
bun run gate:phase-37-1
```

Use the real local ledger mode for longer dogfood validation:

```bash
bun run gate:phase-37-1 -- --dogfood-mode local
```

Local mode writes to `.tmp-goodmemory-phase37-1-local/` by default so it cannot overwrite the canonical deterministic closure artifacts.

## Scope

- installed-host writeback productization polish after Phase 37
- v3 installed-host writeback audit ledger with legacy `{ events, pending }` compatibility
- bounded redacted audit previews, candidate keys, linked record ids, status, reasons, host, mode, timestamps, scope/session digests, and optional manual review metadata
- `goodmemory codex writeback inspect`
- `goodmemory codex writeback forget --event-id <id>`
- deterministic Claude parity for inspect and forget
- dogfood summary metrics without raw conversation content
- deterministic fixture-backed dogfood evidence for clean CI
- local real-ledger dogfood mode for follow-up validation
- Phase 35, Phase 36, and Phase 37 regression gates

Out of scope:

- default-on automatic writeback
- raw transcript persistence or full transcript archive
- dashboard
- managed cloud
- public root `goodmemory/writeback` API
- making Claude provider-backed live evidence a blocker
- claiming long-running 20-50 real-session dogfood retention results

## Artifacts

- Quality gate:
  - `reports/quality-gates/phase-37-1/run-20260424100757/phase-37-1-quality-gate.json`
- Deterministic dogfood report:
  - `reports/eval/dogfood/phase-37-1/run-phase37-1-dogfood-current/report.json`

## Results

- Deterministic dogfood report: accepted.
- Phase 37.1 quality gate: accepted.
- `gate:phase-37-1` proves:
  - `bun run typecheck` passed
  - targeted writeback audit ledger, runtime, integration, CLI, dogfood-summary, gate, and release regressions passed
  - deterministic dogfood fixture met the minimum acceptance floor:
    - `sessionCount >= 20`
    - `candidateCount >= 20`
    - `durableWriteCount > 0`
    - `nextSessionRecallHitCount > 0`
    - `forgottenCount >= 0`
    - `duplicateCount >= 0`
    - `falseWriteRateManual` stayed between 0 and 1
  - no raw conversation content is required in the dogfood report
  - Phase 37, Phase 35, and Phase 36 gates still passed

## Evidence Rule

Only the gate run and deterministic dogfood report above are canonical for Phase 37.1. The deterministic dogfood fixture is the clean-CI acceptance path. Real local-ledger dogfood remains a follow-up validation mode and should be reported separately if future 20-50 session retention data is collected.

## Decision

Phase 37.1 is accepted. GoodMemory installed-host writeback is now understandable, inspectable, undoable, and CI-verifiable without changing the Phase 37 accepted claim: writeback remains opt-in, raw transcripts are not persisted, and no root public writeback API is introduced.
