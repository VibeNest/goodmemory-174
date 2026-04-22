# GoodMemory Phase 33 Quality Gate

Canonical gate run: `run-20260422120359`

## Command

```bash
bun run gate:phase-33
```

## Scope

- compiled `dist/` plus declaration outputs for:
  - `goodmemory`
  - `goodmemory/ai-sdk`
  - `goodmemory/host`
- Node-safe packaged library imports on the canonical public surface
- Bun-backed installed CLI isolation behind a Node-safe package bin wrapper
- Bun and Node package-boundary regression coverage for:
  - runtime resolution
  - packed artifact installability
  - installed-package consumer smoke
  - release/doc/package-boundary sync
- Node 20 and Node 22 CI package-boundary enforcement in addition to the Bun core gate

Out of scope:

- claiming built-in Bun-specific storage adapters are universally available in every runtime
- new memory capability work, dashboard/admin product work, or rollout-family expansion
- widening the root API or introducing a public `goodmemory/evolution` module

## Canonical Artifacts

- Quality gate:
  - `reports/quality-gates/phase-33/run-20260422120359/phase-33-quality-gate.json`

## Results

- `gate:phase-33` is accepted.
- The canonical gate proves:
  - `bun run typecheck` passed
  - `bun run build` emitted compiled package artifacts and declarations successfully
  - `tests/unit/runtime-resolution.test.ts` proves Node runtimes without the built-in local SQLite adapter fall back to in-memory instead of pretending local durable SQLite exists
  - `tests/release/node-package-boundary.test.ts` proves a packed artifact installs through `npm install`, then runs `createGoodMemory({})` + `goodmemory/ai-sdk` + `goodmemory/host` successfully under Node on the packaged surface
  - `tests/release/release.test.ts` proves the package metadata, tarball contents, docs, workflow wiring, and Bun/Node package-boundary contract all stay synchronized
  - the installed `goodmemory` bin is Node-safe on the package boundary while remaining honestly Bun-backed for command execution
  - the public package boundary no longer points `goodmemory`, `goodmemory/ai-sdk`, or `goodmemory/host` at `src/*.ts`

## Canonical Evidence Rule

Only the gate run above is canonical for Phase 33. Earlier local runs built before the final release-workflow repoint, archive summary, and task-board/current-status synchronization are superseded. Later local reruns are validation artifacts only and must not be checked in as another canonical Phase 33 chain unless the archive doc, current-status doc, task-board references, and release tests are intentionally repointed together.

## Decision

Phase 33 is accepted.
GoodMemory now has a formal Node-compatible packaged library boundary for `goodmemory`, `goodmemory/ai-sdk`, and `goodmemory/host`, with Bun-specific runtime behavior isolated honestly and guarded by release, consumer, CI, and gate coverage.
