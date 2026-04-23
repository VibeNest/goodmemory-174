# GoodMemory Phase 35 Quality Gate

Superseded validation run: `run-20260423213045`

Superseded Codex middleware live report: `run-phase35-live-current`

This document is retained as a historical validation snapshot. It is not current accepted Phase 35 closure evidence after the Phase 34 public-boundary/proposal-first correction reopen.

## Command

```bash
bun run gate:phase-35
```

## Scope

- installed-package host middleware on the accepted public line:
  - `goodmemory`
  - `goodmemory/ai-sdk`
  - `goodmemory/host`
- global install plus repo opt-in on the supported host config paths:
  - `goodmemory install codex`
  - `goodmemory install claude`
  - `goodmemory enable codex|claude`
  - `goodmemory disable codex|claude`
- automatic user-level hook wiring for:
  - `SessionStart`
  - `UserPromptSubmit`
- read-only installed MCP availability through:
  - `goodmemory mcp serve`
  - `goodmemory-mcp`
- explicit installed write CLI:
  - `goodmemory remember`
  - `goodmemory feedback`
  - `goodmemory forget`
- deterministic middleware comparison against:
  - the frozen Phase 32 text-only external-host path
  - the no-memory baseline
- one canonical tarball-first Codex middleware evidence chain for:
  - global install
  - repo opt-in
  - session-start continuity injection
  - prompt-time recall injection
  - MCP registration and deep-read availability

Out of scope:

- widening the root API or exposing public `goodmemory/evolution`
- automatic writeback, transcript persistence, or `Stop` hook behavior
- making Claude a second live gate blocker
- claiming the frozen Phase 32 text-only path remains the canonical host product line after Phase 35

## Historical Artifacts

- Quality gate:
  - `reports/quality-gates/phase-35/run-20260423213045/phase-35-quality-gate.json`
- Deterministic fallback report:
  - `reports/eval/fallback/phase-35/run-20260423173045/report.json`
- Codex middleware live report:
  - `reports/eval/live-memory/phase-35/run-phase35-live-current/report.json`

## Results

- Deterministic fallback report: accepted.
- Historical Codex middleware live report: accepted at the time of validation.
- `gate:phase-35` proves:
  - `bun run typecheck` passed
  - targeted host-install, hook-runtime, MCP, phase-35 runner, CLI, and release regressions passed
  - the installed-hook middleware path stayed non-regressive against the frozen Phase 32 text-only host path on every deterministic case
  - the installed-hook middleware path beat the no-memory baseline on every deterministic case
  - tarball-first installed-package Codex setup now proves:
    - user-level install
    - repo opt-in
    - automatic hook registration
    - prompt-time and session-start recall injection
    - read-only MCP availability
  - Claude reached install/hook/package-smoke parity without becoming a second live blocker

## Evidence Rule

The gate run above and the Codex middleware live report above are historical validation artifacts only. They must not be used as current Phase 35 closure evidence unless Phase 35 is explicitly re-accepted and the archive doc, current-status doc, task-board references, and release tests are intentionally repointed together.

## Decision

Phase 35 is not currently accepted.
GoodMemory retains the implementation and validation snapshots above, but the accepted stable line falls back to the refreshed Phase 34 host pre-action and proposal-first correction closure until Phase 35 is re-gated.
