# GoodMemory Phase 26 Quality Gate

Canonical deterministic gate run: `run-20260420193000`

## Command

```bash
bun run gate:phase-26
```

## Scope

- Post-Phase-25 local-first runtime closure for default storage and embedding resolution.
- Explicit-over-auto storage precedence: explicit `sqlite` / `postgres` remains authoritative.
- Auto mode prefers Postgres only when a configured target is usable with `pgvector`; otherwise it falls back to local SQLite.
- Automatic embedding enablement is driven by `GOODMEMORY_EMBEDDING_*`; absent provider config keeps runtime `rules-only`.
- Durable local SQLite vector storage, runtime bootstrap guardrails, and optional extension-assisted search are in scope.
- CLI/runtime storage resolution is aligned on the same shared resolver.
- The deterministic closure contract for Phase 26 is also in scope: the gate command set and the canonical accepted run reference must stay locked.
- No bundled local embedding generation, no public config widening beyond the local-first defaults, and no claim that `sqlite-vss` indexed acceleration is the canonical default backend.
- Provider-backed live-memory acceptance evidence remains outside this deterministic closure slice.

## Commands Covered

- `bun run typecheck`
- `bun test tests/unit/runtime-resolution.test.ts tests/unit/sqlite.runtime.test.ts tests/unit/sqlite.vector-extension.search.test.ts tests/integration/api.smoke.test.ts tests/integration/api.auto-storage.test.ts tests/integration/storage.sqlite.test.ts tests/cli/cli.test.ts`
- `bun test tests/unit/run-phase-26.script.test.ts tests/release/release.test.ts`

## Canonical Artifacts

- Deterministic gate:
  - `reports/quality-gates/phase-26/run-20260420193000/phase-26-quality-gate.json`

## Results

- Deterministic gate: accepted.
- Execution failures: `0`.
- `typecheck`: passed.
- Targeted Phase 26 regressions: `58` pass, `0` fail.
- Closure-contract regressions: `27` pass, `0` fail.
- The accepted runtime contract is now:
  - explicit storage provider wins
  - auto mode prefers usable Postgres + `pgvector`, otherwise local SQLite
  - missing `GOODMEMORY_EMBEDDING_*` keeps runtime `rules-only`
  - local SQLite vectors are durable, with optional extension-assisted search under explicit runtime guardrails
- The accepted closure contract is now:
  - `gate:phase-26` must fail if the gate-script contract drifts
  - `gate:phase-26` must fail if the archived canonical run reference drifts
- This closure does not upgrade the stable product claim from “durable local vectors with optional extension-assisted search” to “default sqlite-vss indexed acceleration”.

## Acceptance Decision

Phase 26 is accepted as the local-first runtime closure slice.
It proves GoodMemory can default to durable local SQLite without requiring the user to install Postgres, while preserving explicit provider override rules, Postgres compatibility, CLI/runtime alignment, rules-only fallback when embeddings are not configured, and the closure artifact contract that marks this phase accepted.

Future local acceleration work can build on this accepted baseline, but it is not part of the current canonical claim.
