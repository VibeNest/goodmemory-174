# GoodMemory Phase 22 Quality Gate

Canonical deterministic gate run: `run-20260420020541`

## Command

```bash
bun run gate:phase-22
```

## Scope

- Internal recall-side LLM router provider hardening after the accepted Phase 21 observe/assist landing
- Provider output normalization for canonical planner/rerank fields and common OpenAI/OpenRouter-style aliases
- Explicit router influence status: `applied`, `partial_fallback`, or `full_fallback`
- Redacted provider diagnostics for fallback stage and validation issues
- Promotion-readiness evidence only; no public/default rollout decision

## Commands Covered

- `bun run typecheck`
- `bun test tests/unit/recall.assistant.test.ts tests/unit/provider.layer.test.ts tests/unit/model-adapters.test.ts tests/unit/recall.router.test.ts tests/unit/run-phase-22.script.test.ts tests/integration/recall.api.test.ts`
- `bun run eval:phase-22`

## Acceptance Standard

- Provider parser accepts canonical fields and common alias fields without weakening candidate safety.
- Planner/rerank failures produce stage-specific fallback metadata and redacted diagnostics.
- Observe mode keeps executed path on the promoted baseline.
- Assist mode can execute `llm-assisted` on a provider-backed memory backend without regressions.
- Existing public `auto` recall semantics remain `rules-only` / `hybrid` only.

## Canonical Artifacts

- Deterministic gate:
  - `reports/quality-gates/phase-22/run-20260420020541/phase-22-quality-gate.json`
- Provider-backed live-memory validation:
  - Observe: `reports/eval/live-memory/phase-22/run-1776650772564-observe/report.json`
  - Assist: `reports/eval/live-memory/phase-22/run-1776650772564-assist/report.json`

## Live-Memory Result

- Memory backend: `provider-backed`
- Embedding: enabled
- Assisted extraction: enabled
- Assisted recall router: enabled
- Observe stress slice: 5 completed cases, 0 execution failures, 0 regressions, gate decision delayed for review as expected
- Assist stress slice: 5 completed cases, 0 execution failures, 0 regressions, controlled assist evidence accepted by the eval gate
- Phase closure treats the committed observe/assist `report.json` summaries as canonical live evidence; trace-level explainability stays regression-covered rather than canonical closure proof.

## Existing Eval Smoke

- Existing `eval:live` semantics preserved:
  - `reports/eval/live/phase-22-smoke/run-1776651237720/report.json`
  - 1 completed in-memory case, 0 execution failures
- Existing `eval:live-memory` semantics preserved:
  - `reports/eval/live-memory/phase-22-smoke/run-1776651268822/report.json`
  - 2 completed provider-backed strategy cases (`rules-only` + `hybrid`), 0 execution failures
- Current note:
  - this Phase 22 document records the then-current generic `eval:live-memory` behavior
  - the current generic CLI contract later moved to auto-storage `eval:live-memory`
  - explicit provider-backed generic runs now use `eval:live-provider-memory`

## Notes

- Phase 22 is accepted as provider hardening plus promotion-readiness evidence, not as a default promotion.
- The current `.env` did not define `GOODMEMORY_RECALL_ROUTER_*`, so live validation used a temporary shell-level mapping onto the already-configured live eval model while keeping repo-tracked `.env` unchanged.
- `.env.example` now documents the phase-specific `GOODMEMORY_RECALL_ROUTER_*` variables; this remains phase/operator guidance, not a README-level public commitment.
- No promotion authorization is generated, and `llm-assisted` is not promoted to default recall behavior.
