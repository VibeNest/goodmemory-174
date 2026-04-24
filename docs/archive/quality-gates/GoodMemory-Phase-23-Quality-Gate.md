# GoodMemory Phase 23 Quality Gate

Canonical deterministic gate run: `run-20260420061039`

## Command

```bash
bun run gate:phase-23
```

## Scope

- Internal-only controlled default promotion for recall-side `llm-assisted`
- Trusted retrieval promotion authorization consumption inside internal runtime
- High-value-query runtime gating so promoted `llm-assisted` does not expand into profile-only or procedural queries
- Observe, assist, and promote evidence for fallback and provider-backed live-memory runs
- No public config widening and no README-level default rollout commitment

## Commands Covered

- `bun run typecheck`
- `bun test tests/unit/eval.strategy-rollout.test.ts tests/unit/eval.strategy-promotion-gate.test.ts tests/unit/run-phase-23.script.test.ts tests/integration/recall.api.test.ts tests/eval/reporting.test.ts tests/eval/runners.test.ts tests/eval/suite.test.ts tests/release/api-boundary.test.ts`
- `bun run eval:phase-23`

## Acceptance Standard

- Internal runtime can consume a trusted promotion authorization and upgrade authorized high-value auto recall to `llm-assisted`.
- Observe evidence remains clean and known-safe before authorization issuance.
- Assist evidence remains accepted with zero regressions.
- Promote evidence proves selective runtime application: high-value cases promote, role-only negative cases stay rules-only.
- Public rollout controls remain internal and delayed.

## Canonical Artifacts

- Deterministic gate:
  - `reports/quality-gates/phase-23/run-20260420061039/phase-23-quality-gate.json`
- Deterministic eval chain:
  - Observe: `reports/eval/fallback/phase-23/run-1776658356917-observe/report.json`
  - Assist: `reports/eval/fallback/phase-23/run-1776658356917-assist/report.json`
  - Promote: `reports/eval/fallback/phase-23/run-1776658356917-promote/report.json`
  - Authorization: `reports/eval/fallback/phase-23/run-1776658356917-assist/strategy-promotion-authorization.json`
- Provider-backed live-memory chain:
  - Observe: `reports/eval/live-memory/phase-23/run-1776658376536-observe/report.json`
  - Assist: `reports/eval/live-memory/phase-23/run-1776658376536-assist/report.json`
  - Promote: `reports/eval/live-memory/phase-23/run-1776658376536-promote/report.json`
  - Authorization: `reports/eval/live-memory/phase-23/run-1776658376536-assist/strategy-promotion-authorization.json`

## Results

- Deterministic gate: accepted
- Fallback observe replay output (ignored generated): 5 completed cases, 0 regressions, known-safe observe coverage `5/5`
- Fallback assist replay output (ignored generated): 5 completed cases, 0 regressions, assist gate `accepted/passed`
- Fallback promote replay output (ignored generated): 5 completed cases, 0 regressions, promote gate `accepted/passed`
- Live-memory observe: 5 completed cases, 0 regressions, known-safe observe coverage `5/5`
- Live-memory assist: 5 completed cases, 0 regressions, assist gate `accepted/passed`
- Live-memory promote: 5 completed cases, 0 regressions, promote gate `accepted/passed`
- Promote selectivity is tracked in both promote `report.json` files under `summary.strategySummary.runtimePromotionSelectivity`:
  - `scenario-medium-13-reference-next-step`: `auto -> llm-assisted`
  - `scenario-medium-13-blocker-slot`: `auto -> llm-assisted`
  - `scenario-medium-11-reference-slot-zh`: `auto -> llm-assisted`
  - `scenario-complex-01`: `auto -> llm-assisted`
  - `scenario-medium-13-role-slot`: `auto -> rules-only`

## Notes

- Phase 23 is accepted as an internal rollout landing, not as a public/default OSS rollout decision.
- The current `.env` still did not define `GOODMEMORY_RECALL_ROUTER_*`, so the provider-backed live-memory validation used a temporary shell mapping onto the already-configured live eval model while keeping repo-tracked `.env` unchanged.
- Trusted authorization is now consumable by internal runtime, but rollout controls remain internal and delayed in the public-surface decision.
