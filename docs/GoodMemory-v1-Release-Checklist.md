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
- `bun run eval:live` produces a live report
- `raw-recall.json` exists for GoodMemory cases
- report shows top-level `mode`
- report shows `runtime.generationMode` and `runtime.judgeMode`

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
