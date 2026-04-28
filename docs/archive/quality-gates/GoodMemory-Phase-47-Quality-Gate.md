# GoodMemory Phase 47 Quality Gate

Canonical accepted gate run: `run-20260428123000`

Phase 47 closes the Provider-Backed Retrieval Rollout and Quality Promotion
slice. It keeps rules-only recall as the default accepted mode while making
provider-backed retrieval an explicit, diagnostic-rich `hybrid` request through
the existing recall strategy controls and the `goodmemory/http` bridge, with a
rules-only fallback when explicit provider-backed execution fails.

This is not a default-on provider rollout, `llm-assisted` public bridge surface,
hosted dashboard, cloud sync, team workspace, raw transcript archive, viewer
mutation route, root public API widening, or root `goodmemory` API widening.

## Evidence

- Provider rollout eval:
  - `reports/eval/fallback/phase-47/run-20260428120000-provider-rollout-eval/report.json`
  - Regenerate from a clean checkout with
    `bun run eval:phase-46 --run-id run-20260427123000-quality-eval && bun run eval:phase-47 --run-id run-20260428120000-provider-rollout-eval`
- Quality gate:
  - `reports/quality-gates/phase-47/run-20260428123000/phase-47-quality-gate.json`
  - Regenerate with `bun run gate:phase-47 --run-id run-20260428123000`

## Accepted Rollout Contract

- Rules-only remains the default and documented product mode.
- Provider-backed retrieval is explicit via existing `strategy: "hybrid"`.
- The HTTP bridge accepts `auto`, `rules-only`, and `hybrid`, but does not expose
  public `llm-assisted` recall through request bodies.
- Omitted and `auto` HTTP bridge requests resolve to rules-only even when
  provider runtime is configured.
- HTTP bridge responses include routing diagnostics: requested/resolved
  strategy, semantic tie-breaking, LLM refinement status, fallback reason, and
  provider fallback metadata when applicable.
- Provider-backed embedding/vector/semantic/provider failures fall back to
  rules-only context with `provider_error` only for explicit `hybrid` execution;
  non-provider recall errors are not masked as successful fallback.

## Promotion Criteria

The accepted provider rollout eval compares deterministic rules-only and hybrid
paths over real `createGoodMemory().recall()` execution, then blocks promotion
unless all of the following hold:

- useful recall delta is at least `+1`
- wrong recall delta is not above `0`
- stale recall delta is not above `0`
- setup-fragility delta is not above `0`
- fallback is visible and recovers rules-only context
- no-strategy and `auto` HTTP bridge defaults still resolve rules-only with
  provider runtime available

The canonical eval records useful recall delta `+1`, wrong recall delta `-1`,
stale recall delta `-1`, setup-fragility delta `0`, and a deterministic
`provider_error` fallback that recovered rules-only context.

## Gate Coverage

The quality gate requires:

- `bun run typecheck`
- Phase 47 provider rollout eval and gate unit tests
- HTTP bridge provider-backed, provider failure, non-provider error, and
  `llm-assisted` rejection regressions
- canonical Phase 46 quality-eval prerequisite regeneration, so Phase 47 does
  not depend on an ignored local report already existing on the machine
- canonical `eval:phase-47` regeneration
- release assertions for package scripts, current-status, task-board, archive
  alignment, ignored generated fallback evidence, and root API non-widening

## Outside The Accepted Claim

- default-on provider-backed retrieval
- public `llm-assisted` bridge rollout
- hosted dashboard, managed cloud, account system, sync, team workspace, or
  analytics
- viewer mutation routes or browser-executed forget/revise
- raw transcript archive or full assistant-output persistence
- new root `goodmemory` public API
- new installed-host hook capability
