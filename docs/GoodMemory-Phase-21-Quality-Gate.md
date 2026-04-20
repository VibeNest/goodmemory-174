# GoodMemory Phase 21 Quality Gate

Canonical deterministic gate run: `run-20260419174013`

## Command

```bash
bun run gate:phase-21
```

## Scope

- Internal recall-side LLM router v1 after the accepted phase-17 through phase-20 rollout substrate
- Bounded planner refinement and bounded durable rerank/suppression with deterministic fallback safety
- Observe/assist rollout only; no promote authorization and no public config widening

## Commands Covered

- `bun run typecheck`
- `bun test tests/unit/recall.assistant.test.ts tests/unit/provider.layer.test.ts tests/unit/model-adapters.test.ts tests/unit/recall.router.test.ts tests/unit/run-phase-21.script.test.ts tests/integration/recall.api.test.ts`
- `bun run eval:phase-21`

## Acceptance Standard

- Internal contracts and bounded safety guards pass deterministic regression coverage
- Phase-21 observe eval artifacts are generated without execution failures
- Existing public recall/config semantics remain unchanged
- Owner-managed live-provider validation stays outside the deterministic gate and is tracked separately

## Canonical Artifacts

- Deterministic gate:
  - `reports/quality-gates/phase-21/run-20260419174013/phase-21-quality-gate.json`
- Provider-backed live-memory validation:
  - Observe: `reports/eval/live-memory/phase-21/run-1776620091171-observe/report.json`
  - Assist: `reports/eval/live-memory/phase-21/run-1776620091171-assist/report.json`

## Notes

- Phase 21 is accepted as an internal observe/assist landing, not as a public/default rollout decision.
- The provider-backed assist run proves `requestedStrategy = llm-assisted`, `resolvedStrategy = llm-assisted`, `memoryBackend = provider-backed`, and a non-empty planner influence trace at the case level.
- The current `.env` did not yet define `GOODMEMORY_RECALL_ROUTER_*`, so the live-memory validation used a temporary shell-level mapping onto the already-configured live eval model while keeping repo-tracked files unchanged.
- The current provider/model pairing still falls back on the rerank sub-step with `schema_invalid`, so promote/default rollout remains deferred and future hardening should target provider-rerank compatibility rather than public-surface changes.
