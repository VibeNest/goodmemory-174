# GoodMemory Phase 29 Quality Gate

Canonical accepted gate run: `run-20260421213000`

Canonical RC dry run: `run-20260421214500`

## Command

```bash
bun run gate:phase-29
```

## Scope

- Bun-only prerelease package hardening for `0.1.0-rc.1`
- tarball-first installability for the public `goodmemory`, `goodmemory/ai-sdk`, and `goodmemory/host` surfaces
- installed CLI verification from the packaged Bun binary path
- compatibility with the accepted Phase 28 local SQLite runtime and supported sqlite-vss acceleration honesty
- archived RC dry-run evidence from a fresh Bun workspace

Out of scope:

- new memory capability work
- Node compatibility
- installer CLI
- widening gate-blocking host coverage beyond the accepted Codex path

## Canonical Artifacts

- Quality gate:
  - `reports/quality-gates/phase-29/run-20260421213000/phase-29-quality-gate.json`
- RC dry run:
  - `reports/quality-gates/phase-29/run-20260421214500/phase-29-rc-dry-run.json`

## Results

- Deterministic release gate: accepted.
- RC dry run: accepted.
- Package metadata now proves:
  - version `0.1.0-rc.1`
  - package is no longer private
  - Bun runtime support is explicit
  - MIT license and publish-facing metadata are present
- Release verification now proves:
  - tarball install from `bun pm pack`
  - public imports only in a fresh Bun consumer
  - installed CLI success on the default local-first SQLite path
  - docs and reference guides describe installed-package usage instead of repo-local-only usage
- Runtime honesty remains intact:
  - supported sqlite-vss acceleration is still bounded by the accepted Phase 28 runtime contract
  - no embedding env keeps the release rehearsal on explicit `rules-only`

## Canonical Evidence Rule

Only the accepted gate run above and the accepted RC dry run above are canonical for Phase 29. Later local reruns are validation artifacts only and must not be checked in as another accepted Phase 29 chain unless the archive doc, current-status doc, task-board references, and release tests are intentionally repointed together.

## Acceptance Decision

Phase 29 is accepted as the Bun-only release-hardening slice for `0.1.0-rc.1`.
It proves GoodMemory is now installable, verifiable, and releasable as a Bun-only prerelease through a tarball-first package boundary without widening the memory surface, reopening the accepted local-first runtime contract, or overstating sqlite-vss support on unsupported runtimes.
