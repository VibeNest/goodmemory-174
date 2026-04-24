# GoodMemory Phase 37 Quality Gate

Canonical gate run: `run-20260424104045`

Canonical deterministic report: `run-20260424101045`

Canonical provider-backed assisted-extraction live report: `run-phase37-live-current`

Canonical external consumer report: `run-phase37-external-consumer`

## Command

```bash
bun run gate:phase-37
```

## Scope

- installed-host selective writeback for Codex first
- installed-host writeback config:
  - `off`
  - `observe`
  - `selective`
- `goodmemory codex writeback` as the canonical after-response/session-end write path
- `goodmemory claude writeback` deterministic parity without making Claude a second live blocker
- conservative `install|enable --writeback <mode>` opt-in
- `session-stop` hook delegation into the same writeback runtime
- observe-mode candidate trace with no durable write
- selective-mode durable writes only through the public Phase 36 `remember` surface
- assistant-output policy, host annotations, and `remember: "never"` masking on the installed-host writeback path
- deterministic eval for open loops, correction, privacy, assistant policy, raw-transcript rejection, dedupe, and next-session recall
- provider-backed assisted-extraction live smoke for automatic writeback plus next-session recall
- repo-external installed-package smoke through `npm pack`
- Phase 35 and Phase 36 regression gates

Out of scope:

- default-on automatic writeback
- raw transcript persistence or full transcript archive
- dashboard
- managed cloud
- Memory OS positioning
- built-in OneLife preset
- reopening recall routing or retrieval promotion
- making Claude provider-backed live evidence a release blocker
- cross-store exactly-once transactions between memory storage and the writeback JSON ledger

## Artifacts

- Quality gate:
  - `reports/quality-gates/phase-37/run-20260424104045/phase-37-quality-gate.json`
- Deterministic fallback replay output (ignored generated):
  - `reports/eval/fallback/phase-37/run-20260424101045/report.json`
- Provider-backed assisted-extraction live-memory report:
  - `reports/eval/live-memory/phase-37/run-phase37-live-current/report.json`
- External consumer installed-package report:
  - `reports/eval/live-memory/phase-37/run-phase37-external-consumer/report.json`

## Results

- Deterministic fallback replay output (ignored generated): accepted.
- Provider-backed assisted-extraction live-memory report: accepted.
- External consumer installed-package report: accepted.
- `gate:phase-37` proves:
  - `bun run typecheck` passed
  - targeted writeback runtime, config, hook-runtime, host-install, integration, CLI, runner, gate, and release regressions passed
  - deterministic eval passed all 8 Phase 37 cases
  - observe mode produced candidates and trace without durable writes
  - selective mode wrote durable memory through public `remember` profiles, rules, annotations, and trace metadata
  - no raw transcript was persisted as durable memory
  - assistant-originated memory stayed blocked unless host annotation confirmed or verified it and profile policy allowed it
  - `remember: "never"` content was masked before extraction
  - duplicate open-loop writeback was suppressed with stable candidate keys and a pending/committed ledger
  - next-session `UserPromptSubmit` recall consumed automatically written open-loop memory without manual `goodmemory remember` seeding
  - provider-backed assisted extraction ran through the installed-host writeback runtime while durable storage remained the accepted local SQLite fallback in the canonical live report
  - external consumer smoke installed the packed package and completed writeback plus recall outside this repository
  - Phase 35 and Phase 36 gates still passed

## Evidence Rule

Only the gate run above, deterministic fallback replay output (ignored generated) above, provider-backed assisted-extraction live-memory report above, and external consumer report above are canonical for Phase 37. If future evidence is repointed, update this archive doc, `docs/GoodMemory-Current-Status-and-Evidence.md`, `task-board/00-README.txt`, release tests, and release checklist together.

## Decision

Phase 37 is accepted. GoodMemory now closes the installed-host loop from automatic recall to opt-in selective automatic remember: Codex can write high-value memory from after-response/session-end payloads through the public remember surface, avoid raw transcript persistence, enforce assistant and privacy guardrails, and recall the written memory in the next installed-host session without manual seeding.
