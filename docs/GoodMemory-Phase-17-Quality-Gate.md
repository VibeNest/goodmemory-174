# GoodMemory Phase 17 Quality Gate

Generated at: `2026-04-18 22:07:54 +0800`

## Commands Run

```bash
bun test
bun run typecheck
bun run eval:phase-17
bun run eval:phase-17-live-memory
```

## Gate Scope

- Phase closure: retrieval-first Wave 6 closure
- Explicitly in scope:
  - retrieval strategy rollout lifecycle (`observe -> assist -> promote`)
  - shadow executed-path comparison artifacts
  - trusted promotion authorization artifact
  - official OSS CLI public-surface acceptance
- Explicitly out of scope:
  - reviewer strategy rollout
  - maintenance strategy rollout

## Fallback Gate

- Mode: `fallback`
- Report directory: `reports/eval/fallback/phase-17/run-1776518109889`
- Scenario slice:
  - `scenario-complex-01`
  - `scenario-medium-11-blocker-slot-zh`
  - `scenario-medium-11-reference-slot-zh`
  - `scenario-medium-13-blocker-slot`
  - `scenario-medium-13-reference-next-step`
  - `scenario-medium-13-reference-slot`
  - `scenario-medium-13-role-slot`

### Fallback Results

- Total cases: `14`
- Execution failures: `0`
- GoodMemory winners: `14/14`
- Assertion pass rate: `1.0`
- Update win rate: `1.0`
- Stale suppression rate: `1.0`
- Observe safe cases: `14/14`
- Observe unknown cases: `0`
- Shadow regressions: `0`
- Regression dashboard blocking cases: `0`
- Promotion gate: `delayed / review_required`

## Live-Memory Gate

- Output root: `reports/eval/live-memory/phase-17`
- Observe report directory: `reports/eval/live-memory/phase-17/observe/run-1776520641003-observe`
- Assist report directory: `reports/eval/live-memory/phase-17/assist/run-1776520641003-assist`
- Trusted authorization artifact:
  - `reports/eval/live-memory/phase-17/assist/run-1776520641003-assist/strategy-promotion-authorization.json`

### Observe Results

- Total cases: `92`
- Execution failures: `0`
- GoodMemory winners: `92/92`
- Assertion pass rate: `1.0`
- Update win rate: `1.0`
- Stale suppression rate: `1.0`
- Observe safe cases: `92/92`
- Observe unknown cases: `0`
- Shadow regressions: `0`
- Regression dashboard blocking cases: `0`
- Promotion gate: `delayed / review_required`

### Assist Results

- Total cases: `92`
- Execution failures: `0`
- GoodMemory winners: `92/92`
- Assertion pass rate: `1.0`
- Update win rate: `1.0`
- Stale suppression rate: `1.0`
- Candidate-influenced cases: `92`
- Shadow regressions: `0`
- Regression dashboard blocking cases: `0`
- Promotion gate: `accepted / passed`
- Trusted promotion authorization: generated

### Judge Uplift

- `factual_recall`: `+5.91`
- `preference_consistency`: `+2.86`
- `cross_domain_transfer`: `+4.44`
- `contamination_penalty`: `-0.11`
- `update_correctness`: `+4.54`
- `personalization_usefulness`: `+6.04`
- `provenance_explainability`: `+0.57`

## Public Surface Decision

- `official_memory_cli`: `accepted / public`
- `eval_artifact_cli`: `accepted / public`
- `core_config`: `accepted / public`
- `strategy_rollout_config`: `delayed / internal`
- `promotion_gate_runtime`: `delayed / internal`
- `evolution_namespace`: `delayed / internal`

## Acceptance Decision

- Phase 17 retrieval-first closure is accepted.
- The dedicated fallback gate proves observe-mode rollout mechanics and artifact completeness on the curated deterministic slice.
- The live-memory gate proves the full retrieval rollout loop on provider-backed storage: observe safety is known, assist is accepted, regression blocking is zero, and the trusted promotion authorization artifact can be issued from clean evidence.
- The official OSS CLI now has aligned product evidence: memory-facing commands are at the root, eval inspection remains nested, and public-surface evidence accepts that CLI while rollout controls stay internal.

## Notes

- This quality gate closes Phase 17 only as a retrieval-first phase. Reviewer and maintenance rollout stay deferred to the dedicated later phase entry in `task-board/20-phase-19-reviewer-and-maintenance-strategy-rollout.txt`.
- The assist gate authorizes manual trusted release of the non-default retrieval strategy. It does not change public `auto` router semantics by itself.
- The required Phase 17 artifact bundle is present in both dedicated gate directories:
  - `report.json`
  - `shadow-executed-path-comparisons.json`
  - `strategy-promotion-gate.json`
  - `regression-dashboard.json`
  - `public-surface-decision.json`
