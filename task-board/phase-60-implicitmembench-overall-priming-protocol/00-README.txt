Phase 60 Breakdown: ImplicitMemBench Overall And Priming Protocol
=================================================================

Boundary
--------
This is an internal research/evaluation protocol phase. It upgrades scoring and
reporting so full-300 ImplicitMemBench results include priming. It does not add
a public API, public config flag, public durable memory kind, release hard gate,
or README-level leaderboard claim.

Problem Statement
-----------------
GoodMemory can currently report strong blocking results, but those numbers cover
only `procedural_memory + classical_conditioning`. The official benchmark shape
also includes `priming`, so a full-300 overall claim needs a third scored lane.

The current protocol is intentionally incomplete for official overall claims:

- raw includes priming, but priming is mostly diagnostic and non-blocking
- distilled omits priming entirely
- reports do not publish an explicit official-comparable `full300OverallScore`
- contamination and task-compliance checks are not strong enough to reward
  priming safely

Implementation Checklist
------------------------
- [ ] Define the Phase 60 overall score schema and formula.
- [ ] Add a controlled GoodMemory priming lane covering all 100 priming cases.
- [ ] Add contamination, leak, noun-copy, and task-violation accounting.
- [ ] Add runner/reporting support for official-comparable full-300 summaries.
- [ ] Add targeted tests proving contaminated priming cannot raise the score.
- [ ] Preserve historical Phase 49 gate semantics or explicitly version the new
  protocol so old evidence is not reinterpreted.
- [ ] Rerun full-300 with five Postgres-backed shards.
- [ ] Update the research summary with blocking, priming, and overall numbers.

Canonical Commands
------------------
Planned commands:

- `bun run typecheck`
- `bun test tests/unit/implicitmembench-research.test.ts tests/unit/run-phase-60.script.test.ts tests/unit/run-phase-60.gate.test.ts`
- `bun run eval:phase-60`
- `bun run eval:phase-60-overall`
- `bun run gate:phase-60`

Full-300 Follow-Up
------------------
The follow-up must answer these questions in one machine-readable summary:

- Did raw, distilled, or controlled-priming GoodMemory exceed the official
  paper's `66%` reference line under the new full-300 denominator?
- Which part of the score came from blocking behavior versus priming?
- How many priming cases were excluded from positive credit because of
  contamination, explicit leaks, copied source nouns, or probe violations?
- Did GoodMemory improve over the upstream-style baseline using the same
  denominator and scorer family routing?
