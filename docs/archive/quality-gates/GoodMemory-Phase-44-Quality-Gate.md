# GoodMemory Phase 44 Quality Gate

Canonical accepted gate run: `run-20260426160000`

Phase 44 closes the Local Viewer data API and lightweight UI slice as a local
inspection layer only. The accepted viewer surface is:

- `goodmemory runtime viewer --host <codex|claude> --port <n>`
- read-only local data API with no mutation routes
- `127.0.0.1` binding only
- local token requirement
- no CORS
- static packageable viewer shell
- progressive `gmrec:v1` record drill-down through Phase 42 service logic
- redacted writeback audit, runtime session, and trace summaries
- forget/revise CLI handoff commands that are generated but not executed

This is not a dashboard, hosted service, analytics layer, account system, or
write UI. Raw transcripts remain outside the accepted claim.

## Evidence

- Deterministic eval:
  - `reports/eval/fallback/phase-44/run-20260426153000/report.json`
  - Regenerate with `bun run eval:phase-44 --run-id run-20260426153000`
- Quality gate:
  - `reports/quality-gates/phase-44/run-20260426160000/phase-44-quality-gate.json`
  - Regenerate with `bun run gate:phase-44 --run-id run-20260426160000`

## Gate Coverage

The quality gate requires:

- `bun run typecheck`
- viewer route and CLI regressions
- deterministic Phase 44 fallback eval
- release assertions for task-board/current-status/archive alignment
- root API non-widening checks
- package script and export checks
- tarball hygiene, including exclusion of `third-party/claude-mem-main`

## License Boundary

`third-party/claude-mem-main` remains an engineering reference only. Phase 44
does not copy claude-mem source code, does not describe GoodMemory as a fork or
port, and does not include the third-party reference source in the packed
package.
