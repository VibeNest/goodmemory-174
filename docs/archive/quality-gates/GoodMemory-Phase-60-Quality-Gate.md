# GoodMemory Phase 60 Quality Gate

Canonical accepted gate run: `run-20260505120000`

Phase 60 closes the ImplicitMemBench Overall And Priming Protocol as an
internal research/evaluation protocol slice. It adds an explicit
official-comparable scoring schema for full-300 reporting, including
`blockingScore`, `primingScore`, `full300OverallScore`,
`overallComparableToOfficial`, and priming contamination/task-compliance/leak
accounting. It does not claim official leaderboard placement and does not make
full-300 ImplicitMemBench a release hard gate.

## Evidence

- Phase 60 smoke protocol summary:
  - `reports/eval/fallback/phase-60/run-phase60-fallback-current/overall-summary.json`
  - Regenerate with
    `bun run eval:phase-60 && bun run eval:phase-60-overall -- --run-id run-phase60-fallback-current`
- Quality gate:
  - `reports/quality-gates/phase-60/run-20260505120000/phase-60-quality-gate.json`
  - Regenerate with `bun run gate:phase-60`

## Accepted Scope

- overall score contract for ImplicitMemBench research reports:
  - blocking score from `procedural_memory + classical_conditioning`
  - controlled priming score from `priming_pair_judge` cases
  - full-300 equivalent score as blocking passes plus normalized priming credit
  - explicit denominator and official-comparability status
- controlled priming profile reporting:
  - `goodmemory-controlled-priming`
  - `goodmemory-distilled-feedback+controlled-priming`
- contamination and task-compliance accounting:
  - copied source nouns
  - explicit recall leaks
  - strict-output/task-format violations
  - contaminated priming influence receives zero positive credit
- legacy Phase 49 semantics are preserved:
  - historical `passedBlockingCases / totalBlockingCases` remains unchanged
  - `goodmemory-distilled-feedback` still omits priming in the legacy report
  - new overall reporting is layered in Phase 60 summary artifacts

## Gate Coverage

The quality gate requires:

- `bun run typecheck`
- targeted regression tests:
  - `tests/unit/eval.phase60.test.ts`
  - `tests/unit/run-phase-60.script.test.ts`
  - `tests/unit/run-phase-60.gate.test.ts`
  - `tests/unit/implicitmembench-research.test.ts`
  - `tests/unit/run-phase-49.gate.test.ts`
- canonical `eval:phase-60` regeneration
- canonical `eval:phase-60-overall` regeneration
- protocol validation that:
  - controlled priming cases are present
  - required schema fields are present
  - legacy Phase 49 semantics are preserved
  - contaminated priming cannot raise the score
  - the summary remains internal research evidence only

## Follow-Up Boundary

The accepted Phase 60 gate proves the protocol and deterministic smoke
machinery. It does not by itself answer whether GoodMemory exceeds the paper's
`66%` reference line on the official 300-case denominator. That requires a
separate five-shard Postgres-backed full-300 rerun using the upgraded Phase 60
protocol.

## Outside The Accepted Claim

- official leaderboard placement
- README-level benchmark claim
- release hard-gate promotion for full-300 ImplicitMemBench
- public API/config widening
- a new public durable memory kind
- benchmark task-file, case-id, or filename-specific routing
