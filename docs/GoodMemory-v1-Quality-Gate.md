# GoodMemory v1 Quality Gate

Generated at: `2026-04-02 23:35:11 +0800`

## Commands Run

```bash
bun test tests/cli tests/examples tests/eval tests/unit/persona.dataset.test.ts tests/unit/scenario.dataset.test.ts tests/scenarios/replay.smoke.test.ts
bun test tests/integration/governance.api.test.ts tests/unit/governance.policy.test.ts tests/eval/runners.test.ts tests/cli/cli.test.ts
bun run typecheck
bun run cli -- inspect --run-dir <latest-fallback-run-dir> --case-id <latest-case-id>
bun run cli -- trace --run-dir <latest-fallback-run-dir> --case-id <latest-case-id>
bun run example:chat
bun run example:coding-agent
bun run eval:smoke
bun run eval:fallback -- --limit=1 --scenario-id=<scenario-id>
```

## Results

- Targeted Phase 10 / eval gate: passed
- Governance patch gate: passed
- Typecheck: passed
- CLI inspect command: passed
- CLI trace command: passed
- Basic chat example: passed
- Coding-agent example: passed
- Eval smoke: passed
- Eval fallback: passed

## Scope Notes

- This quality gate intentionally focused on Phase 9 through Phase 13 deliverables.
- Postgres / pgvector environment-dependent validation remains owner-managed and is not part of this gate.

## Latest Eval Artifacts

- Latest live eval report directory: `reports/eval/live/<run-id>`
- Latest fallback eval report directory: `reports/eval/fallback/<run-id>`

## Release Readiness

- CLI: ready
- Governance controls: ready
- Examples: ready
- Eval artifact inspection: ready
- Docs and package metadata: ready
- Final owner-managed Postgres gate: pending outside this checklist
