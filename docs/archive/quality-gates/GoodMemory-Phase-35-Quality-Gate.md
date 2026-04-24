# GoodMemory Phase 35 Quality Gate

Canonical gate run: `run-20260423213045`

Canonical Codex middleware live report: `run-phase35-live-current`

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
- replacing the accepted Phase 34 host pre-action policy path with recall middleware

## Artifacts

- Quality gate:
  - `reports/quality-gates/phase-35/run-20260423213045/phase-35-quality-gate.json`
- Deterministic fallback replay output (ignored generated):
  - `reports/eval/fallback/phase-35/run-20260423173045/report.json`
- Codex middleware live report:
  - `reports/eval/live-memory/phase-35/run-phase35-live-current/report.json`

## Results

- Deterministic fallback replay output (ignored generated): accepted.
- Codex middleware live report: accepted.
- `gate:phase-35` proves:
  - `bun run typecheck` passed
  - targeted host-install, hook-runtime, MCP, phase-35 runner, CLI, and release regressions passed
  - the installed-hook middleware path stayed non-regressive against the frozen Phase 32 text-only host path on every deterministic case
  - the installed-hook middleware path beat the no-memory baseline on every deterministic case
  - tarball-first installed-package Codex setup proves:
    - user-level install
    - repo opt-in
    - automatic hook registration
    - prompt-time and session-start recall injection
    - read-only MCP availability
  - Claude reached install/hook/package-smoke parity without becoming a second live blocker

## Evidence Rule

Only the gate run above and the Codex middleware live report above are canonical for Phase 35. If future evidence is repointed, update this archive doc, `docs/GoodMemory-Current-Status-and-Evidence.md`, `task-board/00-README.txt`, and release tests together.

## Decision

Phase 35 is accepted after the Phase 34 public-boundary/proposal-first reopen.
GoodMemory now has an accepted installed host-memory middleware path: global install, explicit repo opt-in, always-on hook-injected recall, read-only MCP deep-read/debug, and explicit installed-host write CLI while preserving the root API and Phase 34 host pre-action boundary.
