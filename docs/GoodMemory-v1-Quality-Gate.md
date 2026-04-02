# GoodMemory v1 Quality Gate

Generated at: `2026-04-02 22:30:55 +0800`

## Commands Run

```bash
bun test tests/cli tests/examples tests/eval tests/unit/persona.dataset.test.ts tests/unit/scenario.dataset.test.ts tests/scenarios/replay.smoke.test.ts
bun run typecheck
bun run cli -- inspect --run-dir <latest-run-dir> --case-id <latest-case-id>
bun run example:chat
bun run example:coding-agent
bun run eval:smoke
```

## Results

- Targeted Phase 10 / eval gate: passed
- Typecheck: passed
- CLI inspect command: passed
- Basic chat example: passed
- Coding-agent example: passed
- Eval smoke: passed

## Scope Notes

- This quality gate intentionally focused on Phase 9 and Phase 10 deliverables.
- Postgres / pgvector environment-dependent validation remains owner-managed and is not part of this gate.

## Latest Eval Artifact

- Latest full eval report directory: `reports/eval/run-1775139551824`

## Release Readiness

- CLI: ready
- Examples: ready
- Eval artifact inspection: ready
- Docs and package metadata: ready
- Final owner-managed Postgres gate: pending outside this checklist
