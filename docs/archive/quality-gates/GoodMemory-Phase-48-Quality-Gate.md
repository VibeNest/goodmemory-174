# GoodMemory Phase 48 Quality Gate

Canonical accepted gate run: `run-20260428173000`

Phase 48 closes the Dashboard, Cloud Sync, and Team Workspace Decision slice as
an evidence-backed no-go. The accepted Phase 45-47 evidence does not justify a
hosted dashboard, cloud sync, account system, analytics surface, or team
workspace runtime today. The Phase 44 local viewer remains local-only,
token-gated, read-only, no-CORS, and non-mutating.

This is a product boundary decision, not a hosted implementation. Any future
reconsideration must start from a measured adoption blocker and a separate
hosted product design with auth, tenancy, redaction, export, deletion, audit,
and raw transcript policy before code is accepted.

## Evidence

- Decision report:
  - `reports/eval/fallback/phase-48/run-20260428170000-dashboard-cloud-decision/report.json`
  - Regenerate from a clean checkout with
    `bun run gate:phase-47 --run-id run-20260428123000 && bun run eval:phase-48 --run-id run-20260428170000-dashboard-cloud-decision`
- Quality gate:
  - `reports/quality-gates/phase-48/run-20260428173000/phase-48-quality-gate.json`
  - Regenerate with `bun run gate:phase-48 --run-id run-20260428173000`

## Accepted Decision

- `hosted_dashboard`: no-go
- `cloud_sync`: no-go
- `team_workspace`: no-go
- raw transcript persistence: blocked by default
- browser-executed viewer mutation: blocked
- root `goodmemory` public API widening: blocked

## Why No-Go Is The Accepted Result

- Phase 45 proved reference-product value without hosted dashboard, cloud sync,
  team workspace, accounts, analytics, or browser-executed viewer mutation.
- Phase 46 addressed observed quality gaps through local memory-quality repair
  and maintenance boundaries, not a hosted product surface.
- Phase 47 addressed provider-backed need through explicit `hybrid` recall with
  visible `provider_error` fallback, while preserving rules-only defaults.
- Phase 44 already provides local inspectability through the local viewer
  without turning it into a dashboard.

## Gate Coverage

The quality gate requires:

- `bun run typecheck`
- Phase 48 decision-report and gate unit tests
- canonical Phase 47 gate regeneration as the upstream evidence prerequisite
- canonical `eval:phase-48` regeneration
- release assertions for package scripts, current-status, task-board, archive
  alignment, ignored generated fallback evidence, root API non-widening, and
  local viewer boundary preservation

## Future Reconsideration Bar

Before any hosted or shared surface can move out of no-go, the next phase must
prove all of the following:

- concrete adoption blocker tied to dashboard, cloud sync, or team workspace
- auth and tenancy model
- redaction and raw-transcript persistence policy
- export, deletion, and audit semantics
- separate hosted product design that does not mutate the local viewer contract

## Outside The Accepted Claim

- hosted dashboard, managed cloud, account system, sync, team workspace, or
  analytics
- turning the Phase 44 local viewer into a hosted product
- browser-executed forget/revise or other mutation routes on the local viewer
- raw transcript archive or full assistant-output persistence
- new package subpath exports for dashboard, cloud, or team surfaces
- new root `goodmemory` public API
