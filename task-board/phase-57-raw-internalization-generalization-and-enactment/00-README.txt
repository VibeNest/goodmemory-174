Phase 57 Breakdown: Raw Internalization Generalization and Enactment
====================================================================

Boundary
--------
This is an internal research/runtime phase. It does not add a public API,
public config flag, public durable memory kind, or README-facing benchmark
claim. Full-300 remains an internal research signal.

Implementation Checklist
------------------------
- [x] Add raw diagnosis aggregation over existing ImplicitMemBench reports.
- [x] Add Phase 57 targeted fixture routing and runner scripts.
- [x] Add raw text-response hard-control plan plumbing.
- [x] Extend `RawTaskHypothesis` with hard constraint, exact format,
  conditional precondition, and symbolic-rule mappings.
- [x] Prefer correction-backed conflict inhibition over default abstain.
- [x] Skip uncorrected failed raw attempts as positive exemplars.
- [x] Add Phase 57 gate command for deterministic mechanism evidence.
- [ ] Re-run full-300 with five Postgres-backed shards and archive the internal
  follow-up summary.

Canonical Commands
------------------
- `bun run typecheck`
- `bun test tests/unit/eval.phase57.test.ts tests/unit/evolution.raw-behavioral-exemplars.test.ts tests/unit/implicitmembench-diagnostics.test.ts tests/unit/implicitmembench-research.test.ts tests/unit/runtime-kit.test.ts`
- `bun run eval:phase-57`
- `bun run eval:phase-57-live-memory`
- `bun run gate:phase-57`
- `bun run eval:phase-57-diagnostics -- --report <report.json> --output <summary.json>`

Full-300 Follow-Up
------------------
Target follow-up remains research-only:
- raw blocking pass target: at least `65 / 200`
- distilled blocking pass target: at least `150 / 200`
- raw explicit recall leak target: `<= 1`
- blocking execution failure target: `<= 3`

The follow-up should use the same five-shard Postgres-backed setup used for
Phase 49 full-300 GoodMemory research evals.
