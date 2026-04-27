# GoodMemory Phase 46 Quality Gate

Canonical accepted gate run: `run-20260428110000`

Phase 46 closes the Memory Quality and Maintenance 2.0 slice. It uses Phase 45
reference-product evidence to add a conservative maintenance-quality repair path
without widening the root public API or promoting provider-backed retrieval.

This is not a provider-backed retrieval rollout, dashboard, cloud sync, hosted
workspace, viewer mutation surface, raw transcript archive, or new reference
product scope.

## Evidence

- Quality eval:
  - `reports/eval/fallback/phase-46/run-20260427123000-quality-eval/report.json`
  - Regenerate with `bun run eval:phase-46 --run-id run-20260427123000-quality-eval`
- Quality gate:
  - `reports/quality-gates/phase-46/run-20260428110000/phase-46-quality-gate.json`
  - Regenerate with `bun run gate:phase-46 --run-id run-20260428110000`

## Accepted Quality Surface

- `qualityRepair` is an explicit maintenance job, not part of the default
  hygiene maintenance job set.
- Outcome-aware eval maintenance runs `qualityRepair` before dedupe,
  contradiction, consolidation, and embedding repair, so quality-marked bad
  facts are isolated before broader maintenance decisions.
- Recall verification hints persist bounded `verificationPressureCount` and
  `lastVerificationHintAt` without reinforcing normal recent-access counters.
- Stale action-fact repair requires inferred source, low confidence, low
  importance, old age, repeated verification pressure, no recent access, and a
  newer active replacement fact.
- Same-run replacement demotions are rechecked through a mutable active map, so
  a replacement demoted earlier in the same `qualityRepair` run cannot justify
  demoting the stale fact later.
- Over-remembering repair uses generic `memoryQuality*` attributes and demotes
  quality failure-sample facts without reading raw transcripts.

## Evidence Model

The accepted Phase 46 report separates:

- Phase 45 observed failure samples:
  - no-memory missed recall on the historical task-continuation scenario
  - rejected unsafe/noisy observe candidate on the writeback-review scenario
- maintenance guardrail:
  - stale-recall repair on the historical task-continuation family, explicitly
    marked as `observedPhase45Failure: false`

This distinction keeps Phase 46 from claiming that Phase 45 had a stale-recall
failure when the canonical Phase 45 rules-only run passed that family.

## Gate Coverage

The quality gate requires:

- `bun run typecheck`
- Phase 46 quality-eval, gate, maintenance runner/API, recall pressure, recall
  outcome-scoring, and eval-runner regressions
- canonical `eval:phase-46` regeneration
- release assertions for package scripts, current-status, task-board, archive
  alignment, ignored generated fallback evidence, and root API non-widening

## Outside The Accepted Claim

- provider-backed retrieval default promotion or quality-promotion rollout
- hosted dashboard, managed cloud, account system, sync, team workspace, or
  analytics
- viewer mutation routes or browser-executed forget/revise
- raw transcript archive or full assistant-output persistence
- new root `goodmemory` public API
- new installed-host hook capability
