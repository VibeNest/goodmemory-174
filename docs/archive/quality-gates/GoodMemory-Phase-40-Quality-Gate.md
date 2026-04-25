# GoodMemory Phase 40 Quality Gate

Canonical accepted gate run: `run-20260425172323`

## Command

```bash
bun run gate:phase-40 -- --run-id run-20260425172323
```

Release workflows should run the same gate with a release-scoped run id:

```bash
bun run gate:phase-40 --run-id "release-v${VERSION}"
```

## Scope

- v0.2.0 package metadata and release workflow proof
- README product entrypoint and canonical 15-minute app integration guide
- Node 20 / 22 / 24 package-boundary CI coverage
- external tarball consumer smoke through public package entrypoints
- cross-consumer adoption smoke across direct TypeScript, Express, Fastify,
  Python/FastAPI bridge, and installed-host package paths
- product eval rollup comparing with-GoodMemory against a no-memory baseline
- release checklist, current-status, task-board, and archive closure evidence

Out of scope:

- query-resolved revise targets
- `correctMemory()` alias
- raw CRUD memory APIs
- `remember({ mode: "background" })`
- public router provider config
- persistent distributed job queue
- dashboard, managed cloud, hosted sync, or analytics product
- default-on writeback
- raw transcript archive
- built-in OneLife preset
- LangGraph-first integration

## Artifacts

- Quality gate:
  - `reports/quality-gates/phase-40/run-20260425172323/phase-40-quality-gate.json`
- Cross-consumer adoption smoke:
  - `reports/eval/adoption/phase-40/run-20260425163012-cross-consumer/report.json`
- Product eval rollup:
  - `reports/eval/product/phase-40/run-20260425165544-product-eval/report.json`
- Release checklist:
  - `docs/GoodMemory-v1-Release-Checklist.md`
- Current status:
  - `docs/GoodMemory-Current-Status-and-Evidence.md`

## Results

- Phase 40 quality gate: accepted.
- Release candidate version: `0.2.0`.
- Targeted Phase 40 release regressions passed.
- `bun run test:ci` passed.
- Node package-boundary smoke passed.
- Cross-consumer adoption smoke passed and refreshed its canonical report.
- Product eval rollup passed and refreshed its canonical report.
- `bun pm pack --dry-run` passed.
- `release:rc-dry-run` passed as tarball-first release dry-run evidence under
  `.tmp-goodmemory-phase40/`.

## Evidence Rule

Only the gate run above is canonical for Phase 40. Reruns should write to a new
run directory or a release-scoped run id. The Phase 40 release dry run writes
under `.tmp-goodmemory-phase40/` and must not mutate accepted prior-phase
artifacts.

## Decision

Phase 40 is accepted. GoodMemory now has a v0.2.0 release-candidate evidence
chain that starts from the accepted Phase 39 Python HTTP bridge, proves the
public package and consumer surfaces, measures product continuity value against
a no-memory baseline, and keeps dashboards, managed cloud, raw CRUD/default-on
writeback, raw transcript archives, and OneLife-specific product behavior
outside the GoodMemory core.
