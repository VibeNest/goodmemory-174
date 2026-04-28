# GoodMemory Phase 50 Quality Gate

Canonical accepted gate run: `run-20260428224500`

Phase 50 closes Installer CLI Runtime-Shell Hardening. It keeps the installer
surface on the existing `setup` / `install` / `enable` / `status` family while
adding dry-run planning, read-only doctor diagnostics, and managed-wiring
repair for Codex and Claude.

## Evidence

- Installer eval:
  - `reports/eval/fallback/phase-50/run-20260428223000-installer-eval/report.json`
  - Regenerate with
    `bun run eval:phase-50 -- --run-id run-20260428223000-installer-eval`
- Quality gate:
  - `reports/quality-gates/phase-50/run-20260428224500/phase-50-quality-gate.json`
  - Regenerate with
    `bun run gate:phase-50 -- --run-id run-20260428224500`

## Accepted Scope

- `goodmemory setup --dry-run`
- `goodmemory install <codex|claude> --dry-run`
- `goodmemory enable <codex|claude> --dry-run`
- `goodmemory doctor [codex|claude|both]`
- `goodmemory repair [codex|claude|both]`
- dry-run reflects requested activation, context, writeback, storage, provider,
  and user options without writing files
- doctor reports unmanaged hook/MCP conflicts as manual-fix diagnostics
- repair restores missing GoodMemory-managed wiring while preserving writeback
  mode and existing installed config values

## Gate Coverage

The quality gate requires:

- `bun run typecheck`
- targeted CLI and Phase 50 script regressions
- canonical `eval:phase-50` regeneration
- accepted evidence for dry-run no-mutation, doctor missing-install
  diagnostics, default `install` / `setup --host both` writeback staying `off`,
  managed-wiring repair, and no default writeback escalation
- package script registration for `eval:phase-50` and `gate:phase-50`

## Outside The Accepted Claim

- Cursor, Gemini, or other new host adapters
- a new `goodmemory installer` namespace
- root public API or package subpath widening
- default-on durable writeback
- default-on worker daemon or viewer startup
- hosted dashboard, cloud sync, team workspace, or browser mutation surface
- raw transcript archive
