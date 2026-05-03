# GoodMemory Phase 57 Quality Gate

Canonical accepted gate run: `run-20260504013000`

Phase 57 closes Raw Internalization Generalization and Enactment as a targeted
internal mechanism slice. It keeps the public API/config and durable memory
taxonomy unchanged while making raw experience carryover compile into harder
control signals for text responses and exact procedural actions.

## Evidence

- Deterministic targeted eval:
  - `reports/eval/fallback/phase-57/run-phase57-fallback-current/report.json`
  - Regenerate with
    `bun run eval:phase-57 -- --run-id run-phase57-fallback-current`
- Raw diagnosis report:
  - `reports/eval/fallback/phase-57/run-phase57-fallback-current/raw-diagnostics.json`
  - Regenerate with
    `bun run eval:phase-57-diagnostics -- --report reports/eval/fallback/phase-57/run-phase57-fallback-current/report.json --output reports/eval/fallback/phase-57/run-phase57-fallback-current/raw-diagnostics.json`
- Quality gate:
  - `reports/quality-gates/phase-57/run-20260504013000/phase-57-quality-gate.json`
  - Regenerate with `bun run gate:phase-57`

## Accepted Scope

- raw diagnosis aggregation over full ImplicitMemBench-style GoodMemory reports
  with stable buckets for `memory_miss`, `support_conflict`, `wrong_exemplar`,
  `selected_but_not_enacted`, and operator failures
- raw support/conflict resolution that skips uncorrected failed attempts and
  prefers correction-backed inhibition/replacement when a conflict is really
  failed behavior versus safer replacement
- expanded internal `RawTaskHypothesis` mappings:
  `hard_constraint_contract`, `exact_format_contract`,
  `conditional_precondition`, and `symbolic_rule_execution`
- raw text-response hard-control plumbing through the shared structured
  enactment plan, including forbidden terms, protocol replacement, safe path
  replacement, precondition checks, warnings, and leak suppression
- raw computed responses and exact first actions are allowed to override
  model-only drift before scoring or execution recovery
- targeted deterministic evidence proving:
  - `goodmemory-raw-experience` passes `10 / 12`
  - `goodmemory-distilled-feedback` passes `12 / 12`
  - targeted execution failures are `0`
  - targeted explicit recall leaks are `0`
  - raw remaining failures are now isolated to one selected-but-not-enacted
    symbolic text case and one support-conflict operator case

## Gate Coverage

The quality gate requires:

- `bun run typecheck`
- targeted unit/regression suites for Phase 57, raw behavioral exemplars,
  diagnosis aggregation, ImplicitMemBench research, runner scripts, and
  runtime-kit controls
- canonical `eval:phase-57` regeneration
- deterministic evidence with raw targeted blocking passes above the Phase 56
  frozen deterministic baseline and distilled targeted behavior still at the
  full targeted baseline

## Outside The Accepted Claim

- public API or public config widening
- a new durable public memory kind or public record collection
- full-300 ImplicitMemBench as a release hard gate or public product claim
- claiming the full-300 raw target until the separate five-shard
  Postgres-backed follow-up rerun is executed
- benchmark-specific runtime hacks or task-file-specific patches as the
  accepted product mechanism
