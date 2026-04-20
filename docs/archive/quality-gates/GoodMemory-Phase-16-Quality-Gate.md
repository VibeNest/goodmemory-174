# GoodMemory Phase 16 Quality Gate

Generated at: `2026-04-17 23:53:58 +0800`

## Commands Run

```bash
bun test tests/eval/phase16.test.ts tests/unit/run-phase-16-eval.script.test.ts tests/eval/runners.test.ts tests/eval/reporting.test.ts tests/unit/run-eval.script.test.ts
bun run typecheck
bun run eval:phase-16
```

## Gate Slice

- Eval mode: `fallback`
- Report directory: `reports/eval/fallback/phase-16/run-1776441180237`
- Scenario slice:
  - `scenario-medium-01`
  - `scenario-medium-03`
  - `scenario-medium-17`
  - `scenario-complex-01`
  - `scenario-complex-05`
- Memory mode for this gate: in-memory replay with repeated explicit feedback confirmations that produce governed procedural promotions during replay

## Results

- Total cases: `5`
- Execution failures: `0`
- GoodMemory winners: `5/5`
- Assertion pass rate: `1.0`
- Update win rate: `1.0`
- Stale suppression rate: `1.0`
- Stale misuse rate: `0.0`
- Governed procedural reuse rate: `1.0`
- Accepted procedural promotion cases: `5/5`
- Compiled procedural reuse cases: `5/5`

## Judge Uplift

- `factual_recall`: `+10`
- `preference_consistency`: `+10`
- `cross_domain_transfer`: `+8.4`
- `contamination_penalty`: `+2`
- `update_correctness`: `+10`
- `personalization_usefulness`: `+10`
- `provenance_explainability`: `+6`

## Acceptance Decision

- Phase 16 targeted eval coverage is now broad enough to show measurable outcome movement, not just implementation presence.
- Governed procedural promotion is proven end-to-end in the gate slice: repeated feedback experiences generate accepted promotion records with real lineage, compiler-produced `validated_pattern` reuse is visible, and reuse remains distinguishable from direct validated feedback.
- Stale-memory misuse and correction handling are now measurable in the same formal report via `outcomeLoopSummary`.

## Notes

- This gate is intentionally phase-scoped. It does not replace the historical v1 quality gate snapshot in `docs/GoodMemory-v1-Quality-Gate.md`.
- Ordinary fallback replay now also reproduces the same behavior on `scenario-complex-01`: `acceptedProceduralPromotionCases = 1` and `governedProceduralReuseCases = 1` in `reports/eval/fallback/run-1776441180239`.
- Durable auto-demotion remains conservative by design in Phase 16. The gate validates the implemented behavior: recall-time verification penalties plus governed contradiction repair, not silent durable demotion on every verification hint.
