# GoodMemory Phase 39 Quality Gate

Canonical accepted gate run: `run-20260425041112`

## Command

```bash
bun run gate:phase-39
```

Release workflows should run the same gate with a release-scoped run id:

```bash
bun run gate:phase-39 --run-id "release-v${VERSION}"
```

## Scope

- Python/FastAPI backend-only HTTP memory bridge contract
- public `goodmemory/http` package subpath
- packaged `goodmemory-http-bridge` server bin with bearer-token startup
- `POST /memory/recall-context`
- `POST /memory/remember`
- `POST /memory/feedback`
- `POST /memory/export`
- `POST /memory/forget`
- targeted `POST /memory/revise`
- targeted `/memory/revise`
- scoped authorization for export, forget, and revise
- bridge-level async remember through `memory.jobs.enqueueRemember()`
- prompt-ready context plus compact structured recall items
- life-coach reference profile and OneLife-shaped adapter without a built-in preset
- Python process smoke through `examples/python-fastapi-memory-consumer.py`
  against both bridge API and packaged server paths

Out of scope:

- client-side GoodMemory runtime bundling
- built-in OneLife preset
- query-resolved correction targets
- `remember({ mode: "background" })`
- consumer-side lock or "do not remember this" as a native bridge mutation
- default raw transcript archive
- managed cloud, dashboard, hosted sync, or cross-service exactly-once claims

## Artifacts

- Contract doc:
  - `docs/GoodMemory-Python-HTTP-Integration-Bridge.md`
- Quality gate:
  - `reports/quality-gates/phase-39/run-20260425041112/phase-39-quality-gate.json`

## Results

- Phase 39 quality gate: accepted.
- Targeted Phase 39 regressions passed:
  - `tests/integration/python-http-bridge.test.ts`
  - `tests/integration/remember.profiles.test.ts`
  - `tests/integration/background-jobs.api.test.ts`
  - `tests/integration/revise-memory.api.test.ts`
  - `tests/integration/runtime-facade.api.test.ts`
  - `tests/unit/run-phase-39.gate.test.ts`
  - `tests/release/node-package-boundary.test.ts`
  - `tests/release/release.test.ts`
- `bun run test:ci` passed.
- Phase 38 hermetic preflight gate passed under `.tmp-goodmemory-phase39/quality-gates/phase-38/run-phase39-preflight-38`, preserving the Phase 38 and Phase 37.1 dependency gate chain without mutating accepted prior-phase artifacts.

## Evidence Rule

Only the gate run above is canonical for Phase 39. Reruns should write to a new
run directory or a release-scoped run id. The Phase 38 preflight writes under
`.tmp-goodmemory-phase39/` and must not mutate accepted Phase 36, Phase 37,
Phase 37.1, or Phase 38 evidence.

## Decision

Phase 39 is accepted. GoodMemory now has a documented and regression-covered
HTTP bridge shape for Python/FastAPI product backends through `goodmemory/http`
and `goodmemory-http-bridge`, while keeping product policy, auth, visible user
controls, session lifecycle, and OneLife-specific business state outside the
GoodMemory core.
