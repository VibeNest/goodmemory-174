# GoodMemory v1 Release Checklist

## CLI

- `goodmemory inspect` reads scope-bounded memory from the supported storage backend
- `goodmemory trace` shows routing, hits, candidate traces, verification hints, and applied policy markers without mutating memory state
- `goodmemory export-memory` writes JSON export plus Markdown artifacts cleanly
- `goodmemory stats` reports scope-bounded counts and backend metadata
- `goodmemory eval inspect` works against eval run directories
- `goodmemory eval trace` shows write trace, recall hits, verification hints, and applied policy markers
- `goodmemory eval export-case` copies case artifacts cleanly

## Governance

- `exportMemory()` exports scope-bounded durable memory
- `deleteAllMemory()` deletes scope-bounded durable memory and clears runtime state when requested
- `ignoreMemory` produces an explainable empty recall result
- policy hooks cover:
  - `shouldRemember`
  - `shouldRecall`
  - `redact`
  - `resolveConflict`
- `raw-recall.json` includes `policyApplied`

## Examples

- `bun run example:chat` works
- `bun run example:coding-agent` works
- README links both examples and explains when to use each

## Eval

- `bun run eval:smoke` passes
- `bun run eval:fallback` produces a deterministic validation report
- `bun run eval:live` produces a live report
- `bun run eval:live-memory` produces a provider-backed live report
- `raw-recall.json` exists for GoodMemory cases
- report shows top-level `mode`
- report shows `runtime.generationMode` and `runtime.judgeMode`

## Strategy Rollout

- non-default promotion is blocked unless `strategy-promotion-gate.json` reports `accepted/passed`
- non-default promotion requires an explicit `strategy-promotion-authorization.json`
- `regression-dashboard.json` exists and shows no blocking cases for any promoted path
- `public-surface-decision.json` exists and matches the documented OSS surface
- observe / assist / promote guidance is documented in `docs/GoodMemory-Strategy-Rollout-Guide.md`
- `docs/GoodMemory-Current-Status-and-Evidence.md` summarizes the current canonical evidence entrypoints
- `docs/archive/quality-gates/README.md` indexes the archived phase-specific closure docs
- rollback conditions explicitly keep `rules-only` available as the supported fallback
- root runtime entrypoints keep salvage hooks and promotion-gate runtime controls internal

## Quality Gate

- `bun test` passes on the canonical `tests/` suite
- `bun run test:coverage` passes and enforces script/source coverage gates
- typecheck passes
- governance tests pass
- no unresolved critical regressions in recent eval output

## Packaging

- `package.json` exposes `bin`, `exports`, and example scripts
- CLI wrapper exists at `scripts/goodmemory-cli.ts`
- README links canonical docs, current status, eval strategy, archive index, and release checklist

## Manual Review

- public API surface matches current product story
- governance controls match PRD and v1 architecture requirements
- examples still reflect the recommended integration path
- latest live eval report is archived under `reports/eval/live/`
- latest provider-backed live eval report is archived under `reports/eval/live-memory/`
- latest fallback validation report is archived under `reports/eval/fallback/`
