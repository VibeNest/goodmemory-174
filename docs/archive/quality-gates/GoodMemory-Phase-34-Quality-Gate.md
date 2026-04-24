# GoodMemory Phase 34 Quality Gate

Canonical gate run: `run-20260423102636`

Canonical Codex action-gate live report: `run-phase34-live-current`

## Command

```bash
bun run gate:phase-34
```

## Scope

- explicit host pre-action policy and veto behavior on `goodmemory/host`
- packaged `HostActionIntent`, `HostActionAssessmentResult`, `HostActionDecision`, `HostAdapter.assessAction()`, and `resolveHostActionExecutionPlan()`
- root `goodmemory` public surface cleanup so internal evolution contracts and constructors no longer leak from the root barrel
- proposal-first automatic adapter correction: event-backed `user_correction` creates selective evidence and feedback experience lineage before reviewer/gate/compiler, not an intermediate active feedback memory
- public `feedback()` remains the explicit durable procedural feedback entrypoint and still writes active feedback memory directly
- coding-agent procedural targeting for repeated coding-agent corrections and coding-agent tool-outcome lineage
- deterministic policy compilation from active validated patterns, linked evidence, working memory, and session journal
- auditable action-assessment recording keyed by `actionId`
- installed-package Codex bootstrap assets for the action-gate runtime path:
  - `AGENTS.md`
  - `.goodmemory/bootstrap/codex-action.mjs`
  - `.codex/hooks.json`
  - `.codex/config.toml`
  - `codex/rules/goodmemory.rules`
- one canonical installed-package Codex action-gate live evidence chain for:
  - executable first-step rewrite
  - destructive veto
  - low-risk non-regression

Out of scope:

- claiming native Codex hook interception is the canonical live blocker without direct runtime evidence
- widening the root API or adding public `goodmemory/evolution`
- making Claude a second live gate blocker
- new memory capability work beyond the accepted host pre-action slice

## Canonical Artifacts

- Quality gate:
  - `reports/quality-gates/phase-34/run-20260423102636/phase-34-quality-gate.json`
- Deterministic fallback replay output (ignored generated):
  - `reports/eval/fallback/phase-34/run-20260422213045/report.json`
- Codex action-gate live report:
  - `reports/eval/live-memory/phase-34/run-phase34-live-current/report.json`

## Results

- Deterministic fallback replay output (ignored generated): accepted.
- Canonical Codex action-gate live report: accepted.
- `gate:phase-34` proves:
  - `bun run typecheck` passed
  - targeted host/action/bootstrap/release regressions passed
  - root public-surface regressions prove no root evolution export leak
  - adapter-event regressions prove automatic corrections are proposal-first and correction receipts remain visible without `feedbackMemoryId`
  - reviewer/evolution regressions prove experience-only corrections and coding-agent outcome lineage compile to targeted procedural guidance
  - the deterministic Phase 34 report still beats the Phase 32 soft-guard and no-memory baselines on first-action interception, corrected first-step behavior, false-block control, and completion non-regression
  - the canonical Codex live report is tarball-first and installed-package based, not repo-internal
  - the canonical Codex live report proves one executable first-step rewrite, one destructive veto, and one low-risk non-regression case on the installed-package action-gate wrapper path
  - the canonical live enforcement path is `.goodmemory/bootstrap/codex-action.mjs`
  - `.codex/hooks.json` and `codex/rules/goodmemory.rules` are generated and regression-covered as parity scaffolds, but they are not treated as the canonical live blocker
  - Claude remains parity-only and non-blocking

## Canonical Evidence Rule

Only the gate run above and the Codex action-gate live report above are canonical for Phase 34. Earlier local runs built before the DeepAnalyzer high-risk policy fix or before the action-gate wrapper was declared as the canonical live path are superseded and must not be used as closure evidence. Later local reruns are validation artifacts only and must not be checked in as another canonical Phase 34 chain unless the archive doc, current-status doc, task-board references, and release tests are intentionally repointed together.

## Decision

Phase 34 is accepted after the seven-standard closure refresh.
GoodMemory now has an explicit host pre-action policy and veto contract on `goodmemory/host`, proposal-first automatic adapter corrections, targeted coding-agent procedural promotion, and a cleaned root public surface without widening into `goodmemory/evolution`.
