# GoodMemory v1 Release Checklist

## CLI

- `inspect` works against eval run directories
- `trace` shows write trace, recall hits, verification hints, and applied policy markers
- `export` copies case artifacts cleanly

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
- `bun run eval:phase-16` produces the dedicated procedural-promotion and outcome-maintenance gate report
- `bun run eval:live` produces a live report
- `bun run eval:live-memory` produces a provider-backed live report
- `raw-recall.json` exists for GoodMemory cases
- report shows top-level `mode`
- report shows `runtime.generationMode` and `runtime.judgeMode`

## Strategy Rollout

- non-default promotion is blocked unless `strategy-promotion-gate.json` reports `accepted/passed`
- `regression-dashboard.json` exists and shows no blocking cases for any promoted path
- `public-surface-decision.json` exists and matches the documented OSS surface
- observe / assist / promote guidance is documented in `docs/GoodMemory-Strategy-Rollout-Guide.md`
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
- README links canonical docs, PRD, eval strategy, and release checklist

## Manual Review

- public API surface matches current product story
- governance controls match PRD and v1 architecture requirements
- examples still reflect the recommended integration path
- latest live eval report is archived under `reports/eval/live/`
- latest fallback validation report is archived under `reports/eval/fallback/`
