GoodMemory Task Board
=====================

Purpose
-------
This folder is the executable development plan for GoodMemory v1.
It translates the following source documents into step-by-step implementation work:

- docs/GoodMemory-PRD.md
- docs/GoodMemory-TDD-and-Evaluation-Strategy.md
- docs/GoodMemory-OSS-Architecture-v1.md
- docs/GoodMemory-First-Principles-and-Reference-Architecture.md
- docs/GoodMemory-Unified-Self-Evolving-Roadmap.md
- docs/GoodMemory-记忆数据分层设计.md

This is not a product spec.
This is the build order, task breakdown, and definition of done for engineering.


Working Rules
-------------
1. Runtime and language are fixed:
   - Bun
   - TypeScript

2. Development style is fixed:
   - TDD first
   - Every feature starts with failing tests
   - Every phase ends with targeted regression runs

3. Product evaluation is mandatory:
   - Unit/integration/scenario tests are not enough
   - Product eval suite is a core deliverable

4. Public API simplicity is mandatory:
   - createGoodMemory
   - recall
   - buildContext
   - remember
   - forget
   - feedback
   - exportMemory
   - deleteAllMemory

5. Procedural memory is first-class:
   - It is not merged into preference or fact

6. Main product priorities are fixed:
   - Better identity/background understanding
   - Better historical task/open-loop continuation


Status Conventions
------------------
Use the following status markers when updating tasks later:

- [TODO] not started
- [WIP] in progress
- [BLOCKED] waiting on dependency or decision
- [DONE] completed and accepted


Execution Order
---------------
Read and execute files in this order:

1. 01-phase-0-project-governance-and-bootstrap.txt
2. 02-phase-1-test-harness-and-eval-scaffold.txt
3. 03-phase-2-domain-taxonomy-and-types.txt
4. 04-phase-3-storage-and-core-state.txt
5. 05-phase-4-runtime-context-engine.txt
6. 06-phase-5-remember-pipeline.txt
7. 07-phase-6-recall-and-context-builder.txt
8. 08-phase-7-feedback-forget-and-verify.txt
9. 09-phase-8-maintenance-and-consolidation.txt
10. 10-phase-9-persona-scenarios-and-product-eval.txt
11. 11-phase-10-cli-examples-and-release.txt
12. 12-phase-11-api-polish-and-surface-alignment.txt
13. 14-phase-13-governance-and-memory-control.txt
14. 15-phase-14-archive-evidence-and-host-artifacts.txt
15. 13-phase-12-provider-layer-embedding-and-router.txt
16. 16-phase-15-reflective-review-and-proposal-pipeline.txt
17. 17-phase-16-procedural-promotion-and-outcome-maintenance.txt
18. 18-phase-17-eval-gated-promotion-and-strategy-rollout.txt
19. 19-phase-18-host-adapters-and-file-authoritative-integration.txt
20. 20-phase-19-reviewer-and-maintenance-strategy-rollout.txt
21. 21-phase-20-integrated-quality-gate-and-release-hardening.txt
22. 22-phase-21-recall-side-llm-router-rollout.txt
23. 23-phase-22-recall-router-provider-hardening-and-promotion-readiness.txt
24. 24-phase-23-recall-router-controlled-default-promotion.txt
25. 25-phase-24-implicit-behavioral-adaptation-eval.txt
26. 26-phase-25-behavioral-adaptation-closure.txt
27. 27-phase-26-local-sqlite-vector-fallback.txt
28. 28-phase-27-reference-integration-gate-and-adoption-evidence.txt
29. 29-phase-28-canonical-sqlite-vss-local-backend.txt
30. 30-phase-29-bun-only-release-hardening-0.1.0-rc.1.txt
31. 31-phase-30-trace-backed-behavioral-enactment-and-live-closure.txt


Current Sequencing Note
-----------------------
- Phase 15, Phase 16, Phase 17, Phase 18, and Phase 19 are now closed.
- Phase 20 is now closed and accepted as the integrated release-hardening slice.
- Phase 21 is now closed as the internal recall-side LLM router v1 slice.
- Phase 22 is now closed as the recall-router provider hardening and promotion-readiness evidence slice.
- Phase 23 is now closed as the internal recall-router controlled default-promotion slice.
- Phase 24 is now closed as the implicit behavioral adaptation eval-harness slice.
- Phase 25 is now closed as the deterministic outcome-telemetry runtime and Layer D evidence slice; provider-backed live behavioral closure remains unproven here.
- Phase 19 closure is backed by accepted reviewer and maintenance quality gates:
  - `docs/archive/quality-gates/GoodMemory-Phase-19-Reviewer-Quality-Gate.md`
  - `docs/archive/quality-gates/GoodMemory-Phase-19-Maintenance-Quality-Gate.md`
  - `reports/quality-gates/phase-19-reviewer/run-20260419101816/phase-19-reviewer-quality-gate.json`
  - `reports/quality-gates/phase-19-maintenance/run-20260419101816/phase-19-maintenance-quality-gate.json`
- Phase 20 closure is backed by the accepted integrated gate:
  - `docs/archive/quality-gates/GoodMemory-Phase-20-Quality-Gate.md`
  - `reports/quality-gates/phase-20/run-20260420023503/phase-20-quality-gate.json`
- Phase 21 closure is backed by:
  - `reports/quality-gates/phase-21/run-20260419174013/phase-21-quality-gate.json`
  - `reports/eval/live-memory/phase-21/run-1776620091171-observe/report.json`
  - `reports/eval/live-memory/phase-21/run-1776620091171-assist/report.json`
- Phase 22 closure is backed by:
  - `docs/archive/quality-gates/GoodMemory-Phase-22-Quality-Gate.md`
  - `reports/quality-gates/phase-22/run-20260420020541/phase-22-quality-gate.json`
  - `reports/eval/live-memory/phase-22/run-1776650772564-observe/report.json`
  - `reports/eval/live-memory/phase-22/run-1776650772564-assist/report.json`
- Phase 23 closure is backed by:
  - `docs/archive/quality-gates/GoodMemory-Phase-23-Quality-Gate.md`
  - `reports/quality-gates/phase-23/run-20260420061039/phase-23-quality-gate.json`
  - `reports/eval/fallback/phase-23/run-1776658356917-observe/report.json`
  - `reports/eval/fallback/phase-23/run-1776658356917-assist/report.json`
  - `reports/eval/fallback/phase-23/run-1776658356917-promote/report.json`
  - `reports/eval/live-memory/phase-23/run-1776658376536-observe/report.json`
  - `reports/eval/live-memory/phase-23/run-1776658376536-assist/report.json`
  - `reports/eval/live-memory/phase-23/run-1776658376536-promote/report.json`
- Phase 24 closure is backed by:
  - `docs/archive/quality-gates/GoodMemory-Phase-24-Quality-Gate.md`
  - `reports/quality-gates/phase-24/run-20260420154540-contrastive-fix/phase-24-quality-gate.json`
  - `reports/eval/fallback/phase-24/run-20260420154540-contrastive-fix/report.json`
- Phase 25 deterministic slice is backed by:
  - `docs/archive/quality-gates/GoodMemory-Phase-25-Quality-Gate.md`
  - `reports/quality-gates/phase-25/run-20260420082358/phase-25-quality-gate.json`
  - `reports/eval/fallback/phase-25/run-1776673441250/report.json`
- Phase 26 is now closed as the local SQLite vector fallback slice:
  - `docs/archive/quality-gates/GoodMemory-Phase-26-Quality-Gate.md`
  - `reports/quality-gates/phase-26/run-20260420193000/phase-26-quality-gate.json`
- Phase 27 is now closed as the reference-integration gate and adoption-evidence slice:
  - deterministic adoption evidence: `reports/eval/fallback/phase-27/run-20260421165000/report.json`
  - live-memory adoption evidence: `reports/eval/live-memory/phase-27/run-20260421170500/report.json`
  - quality gate: `reports/quality-gates/phase-27/run-20260421172000/phase-27-quality-gate.json`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-27-Quality-Gate.md`
- Phase 28 is now closed as the canonical local sqlite-vss backend slice:
  - `docs/archive/quality-gates/GoodMemory-Phase-28-Quality-Gate.md`
  - `reports/quality-gates/phase-28/run-20260421093000/phase-28-quality-gate.json`
- Phase 29 is now closed as the Bun-only release-hardening slice for `0.1.0-rc.1`:
  - `docs/archive/quality-gates/GoodMemory-Phase-29-Quality-Gate.md`
  - `reports/quality-gates/phase-29/run-20260421213000/phase-29-quality-gate.json`
  - `reports/quality-gates/phase-29/run-20260421214500/phase-29-rc-dry-run.json`
- Phase 30 is queued as the trace-backed behavioral enactment and live closure slice; it is not implemented or accepted yet.
- Any work outside queued Phase 30 should start by adding a new phase file or explicitly reopening a closed phase with failing regression or gate evidence.
- Phase 17 closed retrieval-first with dedicated fallback/live-memory gates, trusted promotion authorization, and official CLI public-surface evidence.
- Phase 18 closed the host-adapter layer with a dedicated host quality gate archived in `docs/archive/quality-gates/GoodMemory-Phase-18-Quality-Gate.md`.
- Phase 19 closed reviewer and maintenance rollout with dedicated family gates while keeping rollout controls internal by default.
- Phase 22 hardened the internal recall-side LLM router provider path enough for promotion-readiness evaluation, while leaving promotion/default rollout deferred.
- Phase 23 landed internal-only controlled default promotion for `llm-assisted` recall, with trusted authorization consumption and high-value-query runtime gating while keeping public rollout controls internal.
- Phase 24 added a first-action implicit behavioral adaptation eval harness with separate raw-experience and distilled-feedback profiles, while keeping runtime behavior unchanged.
- Phase 25 added outcome-derived `tool_outcome` promotion and canonical Layer D deterministic behavioral evidence while keeping the surface area internal.
- Reviewer and maintenance rollout no longer sit as implicit unfinished scope inside earlier phases; that deferred scope is now closed in its dedicated phase.
- Phase 15 through Phase 29 extended the board from "usable memory core" into "proposal-driven, eval-gated, host-integrated, provider-hardened, internally promotable, behaviorally measurable, local-first, adoption-proven, sqlite-vss-accelerated, and Bun-releasable memory system".
- Dependency-matrix tests now act as a merge gate for archive/evidence/proposal and future host-adapter changes.
- Historical filenames for Phase 12 and Phase 13 are preserved to avoid churn; follow the execution order above rather than filename numbering.


Priority Bands
--------------
Use these bands when choosing what to work on next:

1. Immediate focus
   - Preserve the closed Phase 17 through Phase 29 guarantees while local changes land
   - Keep the accepted Phase 27 adoption evidence, accepted Phase 28 supported local acceleration guarantees, and accepted Phase 29 Bun-only release boundary regression-covered while future work lands
   - Execute queued Phase 30 through trace-backed behavioral evidence rather than reopening closed Phase 25 or Phase 29 work implicitly
2. Near-term product differentiation
   - Use Phase 30 to prove real first-action behavioral enactment on the accepted Codex host path
   - Keep retrieval-first, host-adapter, reviewer, maintenance, release-hardening, internal recall-router, implicit-behavioral-eval, phase-25 deterministic behavioral-evidence, phase-26 local-first runtime guarantees, Phase 27 adoption evidence, Phase 28 supported local acceleration, and Phase 29 Bun-only release hardening regression-covered while later phases execute
3. Medium-term system hardening
   - Extend the roadmap only through new phase files or explicit reopen decisions backed by failing evidence
4. Host integration track
   - Keep the closed Phase 18 adapter surface and closed Phase 19 rollout families stable while later work lands


V1 Exit Criteria
----------------
GoodMemory v1 is not complete until all of the following are true:

- Bun + TypeScript project boots cleanly
- Public API exists and is stable
- Core logic has unit coverage
- Main API chain has integration coverage
- Scenario layer exists
- Product eval suite exists with about 40 personas
- Baseline vs GoodMemory A/B exists
- LLM-as-judge reports are generated and stored
- CLI inspect/trace/export works
- Governance controls exist:
  - exportMemory
  - deleteAllMemory
  - ignoreMemory
  - policy hooks
- At least one chat example works
- Release documentation is written


Post-v1 Growth Exit Criteria
----------------------------
The next development track is not complete until all of the following are true:

- Session archive exists for cross-session continuity
- Evidence artifacts exist for explainable recall
- Human-readable memory artifacts can be compiled from canonical state
- Provider-backed retrieval can be evaluated against rules-only behavior without changing app integration shape
- Proposal-driven review and salvage exist with inspectable gate outcomes
- Outcome-aware maintenance measurably reduces stale/corrected-memory problems
- Strategy rollout is shadowable, eval-gated, and reversible
- Optional host adapters can consume compiled artifacts without redefining truth sources


Files in This Folder
--------------------
- 01-phase-0-project-governance-and-bootstrap.txt
  Project skeleton, standards, ADR setup, repo layout, Bun and TS bootstrap

- 02-phase-1-test-harness-and-eval-scaffold.txt
  Test runner, fixture layout, eval runner, report formats, test utilities

- 03-phase-2-domain-taxonomy-and-types.txt
  Memory taxonomy, public types, core contracts, data shapes, invariants

- 04-phase-3-storage-and-core-state.txt
  Storage abstractions, sqlite/in-memory/postgres design, persistence contract

- 05-phase-4-runtime-context-engine.txt
  Session buffer, working memory, session journal, runtime behavior

- 06-phase-5-remember-pipeline.txt
  Memory candidate extraction, classification, scoring, merge/supersede pipeline

- 07-phase-6-recall-and-context-builder.txt
  Retrieval planning, recall profiles, packet building, token budgeting

- 08-phase-7-feedback-forget-and-verify.txt
  Procedural memory, deletion/correction, verification before action

- 09-phase-8-maintenance-and-consolidation.txt
  Decay, dedupe cleanup, contradiction repair, dream-style consolidation

- 10-phase-9-persona-scenarios-and-product-eval.txt
  Persona dataset, replay suite, LLM-as-judge, A/B regression

- 11-phase-10-cli-examples-and-release.txt
  CLI, examples, docs, packaging, release readiness

- 12-phase-11-api-polish-and-surface-alignment.txt
  Public surface cleanup, architecture/doc alignment, release-facing API polish

- 13-phase-12-provider-layer-embedding-and-router.txt
  Future provider-layer planning for llm, embedding, and router capabilities

- 14-phase-13-governance-and-memory-control.txt
  Export/delete APIs, policy hooks, ignore-memory, scope guards, governance release gate

- 15-phase-14-archive-evidence-and-host-artifacts.txt
  Session archive, evidence substrate, Markdown artifacts, and recall/context integration foundation

- 16-phase-15-reflective-review-and-proposal-pipeline.txt
  Experience records, proposal pipeline, reflective review, and salvage flows

- 17-phase-16-procedural-promotion-and-outcome-maintenance.txt
  Validated-pattern promotion, outcome-aware scoring, verify-driven demotion, and dream orchestration

- 28-phase-27-reference-integration-gate-and-adoption-evidence.txt
  Public reference hardening, adoption evidence, and Codex handoff gating on top of the stable local-first runtime

- 29-phase-28-canonical-sqlite-vss-local-backend.txt
  Real sqlite-vss indexed local backend, runtime asset/bootstrap contract, and closure of the remaining gap between Phase 26 durable fallback and the stronger original local-SQLite design

- 18-phase-17-eval-gated-promotion-and-strategy-rollout.txt
  Shadow/assist/promote rollout, strategy comparison, eval gates, and public surface decisions

- 19-phase-18-host-adapters-and-file-authoritative-integration.txt
  Optional Claude/Codex-style adapter surfaces over compiled artifacts without changing core truth sources

- 20-phase-19-reviewer-and-maintenance-strategy-rollout.txt
  Dedicated reviewer/maintenance rollout after retrieval-first phase-17 closure and host-adapter stabilization

- 22-phase-21-recall-side-llm-router-rollout.txt
  Internal recall-side LLM router v1 with bounded planning/rerank, observe/assist rollout, and dedicated phase-21 gate evidence

- 23-phase-22-recall-router-provider-hardening-and-promotion-readiness.txt
  Recall-router provider wire-shape hardening, influence diagnostics, stress eval, and promotion-readiness evidence without default promotion

- 24-phase-23-recall-router-controlled-default-promotion.txt
  Internal-only trusted authorization consumption, high-value llm-assisted promote path, and dedicated phase-23 observe/assist/promote evidence

- 25-phase-24-implicit-behavioral-adaptation-eval.txt
  Internal implicit behavioral adaptation eval harness with first-action scoring and split raw/distilled profiles

- 26-phase-25-behavioral-adaptation-closure.txt
  Internal outcome-telemetry promotion, canonical Layer D reporting, and non-blocking paired priming evidence

- 27-phase-26-local-sqlite-vector-fallback.txt
  Local SQLite vector fallback, runtime bootstrap rules, and semantic-storage parity for non-Postgres deployments

- 30-phase-29-bun-only-release-hardening-0.1.0-rc.1.txt
  Bun-only `0.1.0-rc.1` packaging, tarball-installed consumer smoke, installed CLI smoke, release workflow, and RC dry-run evidence

- 31-phase-30-trace-backed-behavioral-enactment-and-live-closure.txt
  Trace-backed first-action behavioral enactment on the accepted Codex host path with provider-backed live-memory closure
