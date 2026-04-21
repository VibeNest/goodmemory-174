# GoodMemory Phase 28 Quality Gate

Canonical deterministic gate run: `run-20260421093000`

## Command

```bash
bun run gate:phase-28
```

## Scope

- Supported local SQLite acceleration with a real `sqlite-vss` indexed backend.
- Automatic bundled runtime detection for `sqlite-vss` assets plus a compatible custom SQLite library on supported machines.
- Explicit separation between:
  - accelerated local semantic mode
  - durable local fallback mode
  - `rules-only` mode when `GOODMEMORY_EMBEDDING_*` is absent
- Regression protection for the accepted Phase 26 storage-resolution contract and Phase 26 fallback guarantees.
- CLI read-only diagnostics remain lightweight and do not eagerly load the accelerated backend when they do not need semantic search.
- No bundled local embedding generation, no installer CLI, and no expanded claim that unsupported runtimes are accelerated.

## Commands Covered

- `bun run typecheck`
- `bun test tests/unit/sqlite.runtime.test.ts tests/unit/sqlite.vector-extension.search.test.ts tests/unit/run-phase-28.script.test.ts tests/integration/storage.sqlite.test.ts tests/integration/storage.sqlite-vss.test.ts tests/integration/api.auto-storage.test.ts tests/cli/cli.test.ts`

## Canonical Artifacts

- Deterministic gate:
  - `reports/quality-gates/phase-28/run-20260421093000/phase-28-quality-gate.json`

## Results

- Deterministic gate: accepted.
- Execution failures: `0`.
- `typecheck`: passed.
- Targeted Phase 28 regressions: `63` pass, `0` fail.
- The accepted runtime contract is now:
  - supported machines can auto-upgrade the local SQLite semantic path to a real `sqlite-vss` indexed backend
  - unsupported machines or failed acceleration setup remain on the accepted durable fallback path unless `GOODMEMORY_SQLITE_VECTOR_MODE=require`
  - missing `GOODMEMORY_EMBEDDING_*` still keeps runtime `rules-only`
  - explicit `sqlite` / `postgres` selection and Phase 26 auto-resolution semantics remain intact
- The accepted CLI contract is now:
  - `inspect`, `stats`, and `export-memory` do not eagerly initialize the accelerated backend on read-only paths
  - `trace` still keeps the full recall path available when semantic search is needed

## Acceptance Decision

Phase 28 is accepted as the canonical local `sqlite-vss` backend slice.
It proves GoodMemory can honestly support a real indexed local semantic backend on supported runtimes, while keeping the accepted durable fallback and rules-only boundaries explicit instead of blurring them together.

This closes the remaining gap between Phase 26’s durable local baseline and the stronger local-SQLite acceleration design, without widening into bundled local embeddings or installer automation.
