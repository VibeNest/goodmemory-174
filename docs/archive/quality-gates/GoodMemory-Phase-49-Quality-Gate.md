# GoodMemory Phase 49 Quality Gate

Canonical accepted gate run: `run-20260428210000`

Phase 49 closes an internal-only research harness for running the full
ImplicitMemBench protocol through GoodMemory itself. This slice does not claim a
release-quality full-300 score and does not widen the public surface. It proves
that GoodMemory can run:

- an upstream-style prompt-injected baseline
- a GoodMemory raw-experience replay path
- a GoodMemory distilled-feedback replay path
- an explicit comparison report across structured, text-behavior, and priming
  scorer families

The accepted gate is smoke-only by design. Full 300-item runs remain optional
live research executions against an external benchmark checkout provided through
`--benchmark-root` or `GOODMEMORY_IMPLICITMEMBENCH_ROOT`.

## Evidence

- Baseline smoke report:
  - `reports/eval/research/phase-49/baseline/run-phase49-smoke-current/report.json`
  - Regenerate with
    `bun run eval:phase-49-baseline -- --smoke --benchmark-root ./fixtures/implicitmembench-research --run-id run-phase49-smoke-current`
- GoodMemory smoke report:
  - `reports/eval/research/phase-49/goodmemory/run-phase49-smoke-current/report.json`
  - Regenerate with
    `bun run eval:phase-49-goodmemory -- --smoke --benchmark-root ./fixtures/implicitmembench-research --run-id run-phase49-smoke-current`
- Comparison smoke report:
  - `reports/eval/research/phase-49/comparison/run-phase49-smoke-current/report.json`
  - Regenerate with
    `bun run eval:phase-49 -- --smoke --benchmark-root ./fixtures/implicitmembench-research --run-id run-phase49-smoke-current`
- Quality gate:
  - `reports/quality-gates/phase-49/run-20260428210000/phase-49-quality-gate.json`
  - Regenerate with
    `bun run gate:phase-49 -- --benchmark-root ./fixtures/implicitmembench-research --run-id run-20260428210000`

## Accepted Scope

- external benchmark-root loading without vendoring the full upstream benchmark
- explicit adapter manifest coverage for all upstream task files
- research profiles:
  - `baseline-upstream-chat`
  - `goodmemory-raw-experience`
  - `goodmemory-distilled-feedback`
- scorer families:
  - `structured_first_action`
  - `text_behavior_judge`
  - `priming_pair_judge`
- smoke-gate regression proof that priming stays out of distilled-feedback

## Gate Coverage

The quality gate requires:

- `bun run typecheck`
- targeted Phase 49 research-harness unit tests
- canonical smoke `eval:phase-49` regeneration
- accepted comparison coverage for all three scorer families
- accepted evidence that baseline and GoodMemory profiles both appear and that
  priming is absent from distilled-feedback

## Outside The Accepted Claim

- a checked-in full 300-item live benchmark result
- release hard-gating on ImplicitMemBench scores
- an outcome-telemetry profile for the upstream benchmark
- widening the root `goodmemory` API, public config, or README-level defaults
- vendoring the full upstream benchmark repository into GoodMemory
