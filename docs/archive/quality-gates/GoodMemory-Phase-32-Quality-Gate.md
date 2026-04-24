# GoodMemory Phase 32 Quality Gate

Canonical gate run: `run-20260422085720`

Canonical Codex external-host live report: `run-phase32-live-current`

## Command

```bash
bun run gate:phase-32
```

## Scope

- external `coding_agent + goodmemory + goodmemory/ai-sdk + goodmemory/host` product line
- installed-package Codex and Claude Code bootstrap tooling through public imports only
- optional adapter-level `*AgentEvent` ingestion on `goodmemory/ai-sdk` and `goodmemory/host`
- deterministic external coding-agent dual-baseline coverage against:
  - frozen pre-Phase-31 public text-only adapter path
  - no-memory baseline
- one canonical trace-backed Codex external-host evidence chain on the installed-package path

Out of scope:

- public `goodmemory/evolution`
- making Claude a second live gate blocker
- transcript-database behavior or raw tool-output persistence as a new truth source
- changing the accepted Phase 28 local backend contract or Phase 29 Bun-only release boundary

## Canonical Artifacts

- Quality gate:
  - `reports/quality-gates/phase-32/run-20260422085720/phase-32-quality-gate.json`
- Deterministic fallback replay output (ignored generated):
  - `reports/eval/fallback/phase-32/run-20260422173045/report.json`
- Codex external-host live report:
  - `reports/eval/live-memory/phase-32/run-phase32-live-current/report.json`

## Results

- Deterministic gate command set: accepted.
- Canonical Codex external-host live report: accepted.
- `gate:phase-32` proves:
  - `bun run typecheck` passed
  - targeted recall/context/bootstrap/release regressions passed
  - `bun run eval:phase-32` stayed rules-only even under provider-env contamination
  - the canonical deterministic report remains accepted against the frozen text-only and no-memory baselines
  - the canonical Codex external-host report is trace-backed and generated through `scripts/run-phase-32-live-memory.ts`
  - the canonical Codex external-host report is installed-package and tarball-based, not repo-internal
  - the canonical Codex external-host report proves all 3 required live case families:
    - continuity/open-loop restoration
    - repeated-correction summary-rule recall
    - procedure-adherence rule/blocker recall
  - Claude remains non-blocking and limited to bootstrap/docs/package-smoke parity

## Canonical Evidence Rule

Only the current gate run and current Codex external-host live report above are canonical for Phase 32. Earlier blocked local gate runs built before the live runner, evidence contract, and rules-only fallback guard were complete are superseded and must not be used as closure evidence. Later local reruns are validation artifacts only and must not be checked in as another canonical Phase 32 chain unless the archive doc, current-status doc, task-board references, and release tests are intentionally repointed together.

## Decision

Phase 32 is accepted.
GoodMemory now has one product-grade external host integration line for Codex and Claude Code through public package surfaces, installed-package bootstrap, selective agent-event ingestion, and a canonical trace-backed Codex evidence chain without widening the root API.
