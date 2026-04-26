# GoodMemory Phase 43 Quality Gate

Canonical accepted gate run: `run-20260426120000`

## Command

```bash
bun run gate:phase-43 -- --run-id run-20260426120000
```

## Scope

- `goodmemory/runtime-kit` package export with source, dist, declarations, and
  packed tarball coverage
- `createGoodMemoryRuntimeKit` lifecycle orchestration for `sessionStart`,
  `beforeModelCall`, `afterModelCall`, `sessionEnd`, `preAction`, and
  `observeToolResult`
- fragment recall through public `recall()` + `buildContext()` and progressive
  recall through the Phase 42 `ProgressiveRecallService`
- pre-action flow through `HostActionIntent`, `assessAction()`, and
  `resolveHostActionExecutionPlan()`
- `afterModelCall` governance: default observe/non-durable behavior, explicit
  selective durable writes only through public `remember()` when host annotation
  and policy allow it
- AI SDK wrapper integration through runtime-kit lifecycle calls instead of a
  duplicated recall/buildContext/remember loop
- redaction-safe runtime events that expose `scopeDigest`, not raw
  `userId`/`workspaceId`/`sessionId`

Out of scope:

- Optional Runtime Worker daemon or required sidecar
- Local Viewer / dashboard product
- root `goodmemory` API widening
- raw transcript archive
- default-on writeback

## Artifacts

- Quality gate:
  - `reports/quality-gates/phase-43/run-20260426120000/phase-43-quality-gate.json`
- Deterministic eval:
  - `reports/eval/fallback/phase-43/run-20260426113000/report.json`
- Current status:
  - `docs/GoodMemory-Current-Status-and-Evidence.md`

## Results

- Phase 43 quality gate: accepted.
- `bun run typecheck` passed.
- Targeted Phase 43 regressions passed, including runtime-kit lifecycle tests,
  default Codex/Claude preAction parity, AI SDK public adapter tests,
  architecture boundary assertions, deterministic eval/gate tests, AI SDK
  examples, and release assertions.
- Deterministic Phase 43 eval passed 8/8 checks: fragment lifecycle,
  progressive lifecycle, preAction execution plan reuse, observe-mode
  non-durable writeback, selective writeback governance, digest-only events,
  session lifecycle no transcript archive, and AI SDK runtime-kit reuse.
- Package release assertions prove `goodmemory/runtime-kit` is exported through
  the packaged `dist/` surface and still does not widen the root `goodmemory`
  barrel.

## Evidence Rule

Only the gate run above is canonical for Phase 43. Reruns should write to a new
run directory. The deterministic fallback eval is regenerable generated output;
the accepted gate artifact is the release-facing audit object.

## Decision

Phase 43 is accepted. GoodMemory now has a host-neutral Runtime Kit adapter
surface that composes the accepted core APIs, Phase 42 progressive recall, and
Phase 41 pre-action contracts without making worker, viewer, dashboard, raw
transcript archive, or default-on writeback behavior part of the core contract.
