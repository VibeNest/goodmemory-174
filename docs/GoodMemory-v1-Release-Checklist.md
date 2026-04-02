# GoodMemory v1 Release Checklist

## CLI

- `inspect` works against eval run directories
- `trace` shows write trace, recall hits, and verification hints
- `export` copies case artifacts cleanly

## Examples

- `bun run example:chat` works
- `bun run example:coding-agent` works
- README links both examples and explains when to use each

## Eval

- `bun run eval:smoke` passes
- `bun run eval:full` produces a report
- `raw-recall.json` exists for GoodMemory cases
- report shows `runtime.generationMode` and `runtime.judgeMode`

## Quality Gate

- unit tests pass
- integration tests pass
- scenario tests pass
- typecheck passes
- no unresolved critical regressions in recent eval output

## Packaging

- `package.json` exposes `bin`, `exports`, and example scripts
- CLI wrapper exists at `scripts/goodmemory-cli.ts`
- README links canonical docs, PRD, eval strategy, and release checklist

## Manual Review

- public API surface matches current product story
- examples still reflect the recommended integration path
- latest eval report is archived under `reports/eval/`
