# GoodMemory Phase 42 Quality Gate

Canonical accepted gate run: `run-20260426100000`

## Command

```bash
bun run gate:phase-42 -- --run-id run-20260426100000
```

## Scope

- GoodMemory-owned `ProgressiveRecallService` for compact index, timeline,
  detail, and progressive context rendering
- stable `gmrec:v1:${scopeDigest}:${recordKind}:${id}` recordRef protocol
- MCP tools that wrap the shared progressive service instead of owning recall
  logic: `goodmemory_search_index`, `goodmemory_timeline`, and
  `goodmemory_get_records`
- installed-host `contextMode: "fragment" | "progressive"` config, status, and
  hook fallback behavior
- redaction-safe `scopeDigest` output, cross-scope detail denial, no raw
  transcript detail, and hard token-budget enforcement
- runtime working-memory continuity preservation when progressive context is
  enabled

Out of scope:

- dashboard or hosted viewer product
- default-on writeback
- root `goodmemory` API widening
- background daemon or required sidecar
- copying implementation from `third-party/claude-mem-main`

## Artifacts

- Quality gate:
  - `reports/quality-gates/phase-42/run-20260426100000/phase-42-quality-gate.json`
- Deterministic eval:
  - `reports/eval/fallback/phase-42/run-20260426093000/report.json`
- Current status:
  - `docs/GoodMemory-Current-Status-and-Evidence.md`

## Results

- Phase 42 quality gate: accepted.
- `bun run typecheck` passed.
- Targeted Phase 42 regressions passed, including progressive recall service,
  MCP adapter tools, installed-host hook fallback, contextMode config, CLI
  status, and release assertions.
- Deterministic Phase 42 eval passed 8/8 protocol checks: recordRef protocol,
  cross-scope denial, bare-id rejection, scope redaction, recall-visible detail,
  progressive token budget, MCP-unavailable fragment fallback, and working
  memory continuity.
- Package release assertions prove the packed tarball still excludes
  `third-party/claude-mem-main`.

## Evidence Rule

Only the gate run above is canonical for Phase 42. Reruns should write to a new
run directory. The deterministic fallback eval is regenerable generated output;
the accepted gate artifact is the release-facing audit object.

## Decision

Phase 42 is accepted. GoodMemory now has an internal progressive recall protocol
that MCP, installed-host hooks, and later runtime/viewer adapters can reuse
without making MCP the owner of recall logic or widening the stable root memory
API.
