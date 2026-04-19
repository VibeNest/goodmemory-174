# GoodMemory Phase 20 Quality Gate

Canonical gate run: `run-20260419164837`

## Command

```bash
bun run gate:phase-20
```

## Scope

- Integrated release-hardening closure after the accepted phase-16, phase-17, phase-18, and phase-19 slices
- Canonical typecheck and coverage regressions on the repository test tree
- CLI, examples, release metadata, and host-path verification on the supported OSS surface

## Commands Covered

- `bun run typecheck`
- `bun run test:coverage`
- `bun test tests/cli/cli.test.ts tests/examples/examples.test.ts tests/release/release.test.ts`
- `bun run eval:smoke`
- `bun run eval:phase-16`
- `bun run eval:phase-17`
- `bun run gate:phase-18`
- `bun run gate:phase-19-reviewer`
- `bun run gate:phase-19-maintenance`
- `bun run example:chat`
- `bun run example:coding-agent`
- `bun run example:host-claude`
- `bun run example:host-codex`

## Acceptance Standard

- All integrated commands pass
- Earlier accepted phase closures remain non-regressing
- Public OSS surface stays aligned with release docs and examples
- Owner-managed live-provider validation remains explicitly out of scope for this deterministic integrated gate

## Canonical Artifacts

- Output root: `reports/quality-gates/phase-20`
- Canonical run: `run-20260419164837`
- Accepted report:
  - `reports/quality-gates/phase-20/run-20260419164837/phase-20-quality-gate.json`

## Notes

- This gate closes the current integrated release-hardening slice. It does not widen the public surface beyond the existing phase-19 decision.
- `docs/GoodMemory-v1-Quality-Gate.md` remains as the historical phase-9 through phase-13 snapshot rather than the current all-up acceptance record.
- Phase 20 integrated release hardening is accepted on the current repo state.
