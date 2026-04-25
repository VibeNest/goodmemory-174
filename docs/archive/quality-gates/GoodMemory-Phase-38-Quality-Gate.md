# GoodMemory Phase 38 Quality Gate

Canonical accepted gate run: `run-20260425084045`

## Command

```bash
bun run gate:phase-38
```

Release workflows should run the same gate with a release-scoped run id:

```bash
bun run gate:phase-38 --run-id "release-v${VERSION}"
```

## Scope

- `GoodMemoryConfig.observability.traceSink`
- structured, redaction-safe `GoodMemoryTraceSpan` public types
- trace id propagation on core public API receipts
- targeted `reviseMemory()` by explicit `target.memoryId`
- `memory.runtime.*` facade attached to the `createGoodMemory()` result
- transcript-like archive persistence off by default on the runtime facade
- public standalone `createRuntimeContextService()` archive options clamped to summary-only without normalized transcripts
- explicit `memory.jobs.*` background remember scheduler
- `GoodMemoryConfig.providers.embedding` and `providers.extraction` facade over existing adapter ports
- thin Express and Fastify HTTP server examples
- Phase 37.1 hermetic preflight gate, CI gate, and targeted Phase 38 regressions

Out of scope:

- `correctMemory()` as the primary public name
- query-resolved revision targets
- unmanaged CRUD APIs such as `memory.facts.add()` or `memory.preferences.upsert()`
- `remember({ mode: "background" })`
- default-on writeback
- raw transcript archive by default
- public router-provider configuration
- dashboard, managed cloud, analytics, or framework-first coupling

## Artifacts

- Quality gate:
  - `reports/quality-gates/phase-38/run-20260425084045/phase-38-quality-gate.json`

## Results

- Phase 38 quality gate: accepted.
- Targeted Phase 38 regressions passed:
  - 140 tests
  - 0 failures
  - 1934 assertions
- `bun run test:ci` passed:
  - 1430 tests
  - 0 failures
  - 7458 assertions
  - overall coverage: 91.15%
- Phase 37.1 hermetic preflight gate passed:
  - 180 targeted Phase 37.1 tests
  - 0 failures
  - dogfood report accepted
- Phase 37.1 hermetic preflight gate passed through `.tmp-goodmemory-phase38/quality-gates/phase-37-1/run-phase38-preflight-37-1`, using the accepted deterministic dogfood report at `reports/eval/dogfood/phase-37-1/run-phase37-1-dogfood-current/report.json` and `--skip-dependency-gates` so previous phase gate artifacts are not regenerated.

## Evidence Rule

Only the gate run above is canonical for Phase 38. The Phase 37.1 preflight intentionally writes its wrapper report to `.tmp-goodmemory-phase38/` and skips nested dependency gates so Phase 38 reruns cannot overwrite or add accepted-looking artifacts for earlier phases.

## Decision

Phase 38 is accepted. GoodMemory now exposes the three public infrastructure bones needed for the next product layer: observable lifecycle traces, governed targeted revision, and runtime-aware session/job/provider integration, while keeping raw transcript persistence, unmanaged CRUD, default-on writeback, and framework-specific coupling outside the accepted claim.
