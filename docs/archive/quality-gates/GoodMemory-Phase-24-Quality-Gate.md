# GoodMemory Phase 24 Quality Gate

Canonical deterministic gate run: `run-20260420154540-contrastive-fix`

## Command

```bash
bun run gate:phase-24
```

## Scope

- Internal implicit behavioral adaptation eval harness after Phase 23.
- Fixture loader and first-action scoring for procedural, conditioning, and priming paradigms.
- Separate `raw-experience` and `distilled-feedback` profiles.
- Deterministic fallback eval report and dedicated quality-gate report.
- No public API changes, no public config widening, and no default behavior promotion.

## Commands Covered

- `bun run typecheck`
- `bun test tests/unit/eval.implicit-behavior.test.ts tests/unit/run-phase-24.script.test.ts`
- `bun run eval:phase-24`

## Canonical Artifacts

- Deterministic gate:
  - `reports/quality-gates/phase-24/run-20260420154540-contrastive-fix/phase-24-quality-gate.json`
- Deterministic eval report:
  - `reports/eval/fallback/phase-24/run-20260420154540-contrastive-fix/report.json`

## Results

- Deterministic gate: accepted.
- Execution failures: `0`.
- `raw-experience`: 3 cases, first-attempt pass rate `0`, behavioral regressions on procedural and conditioning cases.
- `distilled-feedback`: 3 cases, first-attempt pass rate `1`, no behavioral regressions.
- Overall first-attempt pass rate: `0.5`.
- Priming remains non-blocking and report-only.
- This rerun locks the post-fix report contract (`fixtureReferenceAnswer` instead of synthetic `baselineAnswer`) and local-tail first-action scoring that preserves direct negation while accepting contrastive positive selections such as `Instead of DeepAnalyzer, use QuickCheck.`.

## Acceptance Decision

Phase 24 is accepted as an eval-harness slice. It proves GoodMemory can now measure whether experience becomes first-action behavior, while preserving Phase 23 runtime and public-surface boundaries.

The raw-experience failures are intentional evidence of a future capability gap, not unfinished Phase 24 scope.
