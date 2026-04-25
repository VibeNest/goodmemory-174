# GoodMemory Phase 41 Quality Gate

Canonical accepted gate run: `run-20260425223045`

## Command

```bash
bun run gate:phase-41 -- --run-id run-20260425223045
```

## Scope

- installed Codex `PreToolUse` registration on the canonical installed host path
- installed `goodmemory codex hook pre-tool-use` contract and fail-open behavior
- installed `goodmemory codex action` execution bridge on the same installed
  config, storage, provider, and scope path as recall and writeback
- deterministic proof that the installed path matches the frozen Phase 34
  wrapper on rewrite, veto, and low-risk non-regression while beating the
  no-memory baseline
- tarball-first installed-package live proof for managed `PreToolUse`,
  `goodmemory codex action`, and shared installed storage/evidence lineage
- regression coverage for the accepted Phase 34, Phase 35, and Phase 37 gates

Out of scope:

- reopening the accepted Phase 34 bootstrap-wrapper closure
- widening the root GoodMemory API
- making Claude a second pre-action live blocker
- default-on writeback or transcript persistence

## Artifacts

- Quality gate:
  - `reports/quality-gates/phase-41/run-20260425223045/phase-41-quality-gate.json`
- Deterministic eval:
  - `reports/eval/fallback/phase-41/run-20260425213045/report.json`
- Installed live report:
  - `reports/eval/live-memory/phase-41/run-phase41-live-current/report.json`
- Current status:
  - `docs/GoodMemory-Current-Status-and-Evidence.md`

## Results

- Phase 41 quality gate: accepted.
- `bun run typecheck` passed.
- Targeted Phase 41 regressions passed.
- Deterministic Phase 41 eval passed with installed-path non-regression against
  the frozen Phase 34 wrapper, full win-over-no-memory coverage, and shared
  installed-storage parity.
- Tarball-first installed Codex live validation passed with managed
  `PreToolUse`, `goodmemory codex action`, DeepAnalyzer rewrite, destructive
  veto, low-risk non-regression, and shared installed storage.
- Accepted Phase 34, Phase 35, and Phase 37 gates were revalidated in the Phase
  41 regression chain.

## Evidence Rule

Only the gate run above is canonical for Phase 41. Reruns should write to a new
run directory. The deterministic eval remains ignored generated output, while
the installed live report stays at the canonical `run-phase41-live-current`
location for the accepted installed-package path.

## Decision

Phase 41 is accepted. GoodMemory now unifies installed Codex pre-action with
the accepted installed middleware/writeback path, so risky first steps are
assessed, rewritten or vetoed, executed, and traced on the same installed
config/storage/providers path that external users already use for recall and
writeback.
