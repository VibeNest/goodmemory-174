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
1. Language is fixed:
   - TypeScript

2. Runtime support is phase-bound:
   - Bun remains the canonical repo-local development, eval, and gate runner
   - starting in Phase 33, Node LTS becomes a gate-blocking public consumer/runtime boundary for `goodmemory`, `goodmemory/ai-sdk`, and `goodmemory/host`

3. Development style is fixed:
   - TDD first
   - Every feature starts with failing tests
   - Every phase ends with targeted regression runs

4. Product evaluation is mandatory:
   - Unit/integration/scenario tests are not enough
   - Product eval suite is a core deliverable

5. Public API simplicity is mandatory:
   - createGoodMemory
   - recall
   - buildContext
   - remember
   - forget
   - feedback
   - exportMemory
   - deleteAllMemory

6. Procedural memory is first-class:
   - It is not merged into preference or fact

7. Main product priorities are fixed:
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
32. 32-phase-31-native-host-outcome-and-correction-closure.txt
33. 33-phase-32-external-host-integration-productization.txt
34. 34-phase-33-node-compatible-package-boundary-and-node-first-integration.txt
35. 35-phase-34-host-pre-action-policy-and-veto-contract.txt
36. 36-phase-35-installed-host-memory-middleware-and-hooks.txt
37. 37-phase-36-public-domain-write-profiles-and-rules.txt
38. 38-phase-37-installed-host-selective-writeback.txt
39. 39-phase-37-1-writeback-productization-polish.txt
40. 40-phase-38-governed-runtime-surface.txt
41. 41-phase-39-python-http-integration-bridge.txt
42. 42-phase-40-v0-2-release-proof-and-product-eval.txt
43. 43-phase-41-installed-host-pre-action-unification.txt
44. 44-phase-41-9-status-task-board-sync.txt
45. 45-phase-42-progressive-recall-protocol.txt
46. 46-phase-43-runtime-kit.txt
47. 47-phase-43-5-optional-runtime-worker.txt
48. 48-phase-44-local-viewer-data-api-and-lightweight-ui.txt
49. 49-phase-44-1-post-phase-44-roadmap-sync.txt
50. 50-phase-45-first-reference-product-and-adoption-evidence.txt
51. 51-phase-46-memory-quality-and-maintenance-2-0.txt
52. 52-phase-47-provider-backed-retrieval-rollout-and-quality-promotion.txt
53. 53-phase-48-dashboard-cloud-sync-and-team-workspace-decision.txt


Current Sequencing Note
-----------------------
- Current generic eval command semantics are:
  - `eval:live` = in-memory live baseline
  - `eval:live-memory` = auto-storage live memory, aligned with the normal runtime storage resolver
  - `eval:live-provider-memory` = explicit provider-backed live memory when Postgres-backed evidence is required
  - dedicated phase `*-live-memory` runners may still write provider-backed evidence into `reports/eval/live-memory/phase-*`; those historical phase paths do not redefine the generic CLI contract
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
- Phase 30 is now closed as the trace-backed behavioral enactment and provider-backed live closure slice:
  - live-memory behavioral evidence: `reports/eval/live-memory/phase-30/run-phase30-live-current/report.json`
  - quality gate: `reports/quality-gates/phase-30/run-20260421153410/phase-30-quality-gate.json`
  - warning fallback hardening remains regression-covered: unrelated warning prose no longer fabricates `approval_required`, while approval-warning variants keep their actual raw text
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-30-Quality-Gate.md`
- Phase 31 is now closed as the native host outcome and correction closure slice:
  - live-memory behavioral evidence: `reports/eval/live-memory/phase-31/run-phase31-live-current/report.json`
  - quality gate: `reports/quality-gates/phase-31/run-20260422041616/phase-31-quality-gate.json`
  - executable blocking outcomes are now host-lifecycle derived for all canonical live cases
  - native targeted correction lineage is now proven on the provider-backed live path
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-31-Quality-Gate.md`
- Phase 32 is now closed as the external host-integration productization slice:
  - deterministic fallback replay output (ignored generated): `reports/eval/fallback/phase-32/run-20260422173045/report.json`
  - live external-host evidence: `reports/eval/live-memory/phase-32/run-phase32-live-current/report.json`
  - quality gate: `reports/quality-gates/phase-32/run-20260422085720/phase-32-quality-gate.json`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-32-Quality-Gate.md`
- Phase 33 is now closed as the formal Node-compatible package-boundary and Node-first integration slice:
  - quality gate: `reports/quality-gates/phase-33/run-20260422212752/phase-33-quality-gate.json`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-33-Quality-Gate.md`
  - public package boundary now ships `dist/` plus `.d.ts` outputs for `goodmemory`, `goodmemory/ai-sdk`, and `goodmemory/host`
  - Bun-only CLI execution and Bun-local sqlite/sqlite-vss runtime behavior are now isolated from the Node-compatible library contract
  - Node 20/22 package-boundary CI and canonical plain AI SDK server integration are now part of the accepted package boundary
- Phase 34 is now closed again as the host pre-action policy, proposal-first correction, and public-surface closure slice:
  - deterministic fallback replay output (ignored generated): `reports/eval/fallback/phase-34/run-20260422213045/report.json`
  - live Codex action-gate evidence: `reports/eval/live-memory/phase-34/run-phase34-live-current/report.json`
  - quality gate: `reports/quality-gates/phase-34/run-20260423102636/phase-34-quality-gate.json`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-34-Quality-Gate.md`
  - `goodmemory/host` now exposes `HostActionIntent`, `HostActionAssessmentResult`, `HostActionDecision`, `HostAdapter.assessAction()`, and the execution-plan bridge for pre-action rewrite/veto outcomes
  - root `goodmemory` no longer re-exports internal evolution contracts or constructors
  - automatic adapter/event `user_correction` path now takes the proposal-first route: evidence plus feedback experience lineage, then reviewer/gate/compiler, without first creating active durable feedback; public `feedback()` remains the explicit durable procedural feedback entrypoint
  - repeated coding-agent corrections and coding-agent outcome lineage compile to `coding_agent` scoped procedural guidance
  - the canonical live enforcement path is the installed-package Codex action-gate wrapper, while `.codex/hooks.json` and `codex/rules/goodmemory.rules` remain parity scaffolds instead of the live blocker
- Phase 35 is now closed as the installed host-memory middleware and hooks slice:
  - deterministic fallback replay output (ignored generated): `reports/eval/fallback/phase-35/run-20260423173045/report.json`
  - live Codex installed middleware evidence: `reports/eval/live-memory/phase-35/run-phase35-live-current/report.json`
  - quality gate: `reports/quality-gates/phase-35/run-20260423213045/phase-35-quality-gate.json`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-35-Quality-Gate.md`
  - global install, explicit repo opt-in, hook-injected recall, read-only MCP, and explicit write CLI are accepted on the installed-host path
  - this slice did not claim automatic writeback, transcript persistence, `Stop` hooks, public `goodmemory/evolution`, or Claude as a second live blocker
- Phase 36 is now closed as the public domain write profiles and rules slice:
  - deterministic fallback replay output (ignored generated): `reports/eval/fallback/phase-36/run-20260423221045/report.json`
  - provider-backed live-memory evidence: `reports/eval/live-memory/phase-36/run-phase36-live-current/report.json`
  - quality gate: `reports/quality-gates/phase-36/run-20260423223045/phase-36-quality-gate.json`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-36-Quality-Gate.md`
  - accepted surface: public `remember` config, profiles, rules, annotations, assistant-output policy, domain metadata, and traceable extractor composition with stable custom extractor ids
  - OneLife / life-coach remains a reference pattern, not a built-in preset
- Phase 37 is now closed as the installed host selective writeback slice:
  - task-board entrypoint: `task-board/38-phase-37-installed-host-selective-writeback.txt`
  - breakdown folder: `task-board/phase-37-installed-host-selective-writeback/`
  - deterministic fallback replay output (ignored generated): `reports/eval/fallback/phase-37/run-20260424101045/report.json`
  - provider-backed assisted-extraction live-memory evidence: `reports/eval/live-memory/phase-37/run-phase37-live-current/report.json`
  - external consumer evidence: `reports/eval/live-memory/phase-37/run-phase37-external-consumer/report.json`
  - quality gate: `reports/quality-gates/phase-37/run-20260424104045/phase-37-quality-gate.json`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-37-Quality-Gate.md`
  - accepted surface: Codex installed host supports opt-in `off` / `observe` / `selective` writeback through public `remember` profiles/rules/annotations, with no raw transcript persistence and assistant output still gated by host confirmation or verification
  - still out of scope: default-on writeback, transcript archives, dashboard, managed cloud, built-in OneLife preset, recall-router reopening, and Claude as a provider-backed live blocker
- Phase 37.1 is now closed as the writeback productization polish slice:
  - task-board entrypoint: `task-board/39-phase-37-1-writeback-productization-polish.txt`
  - breakdown folder: `task-board/phase-37-1-writeback-productization-polish/`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-37.1-Quality-Gate.md`
  - dogfood report: `reports/eval/dogfood/phase-37-1/run-phase37-1-dogfood-current/report.json`
  - quality gate: `reports/quality-gates/phase-37-1/run-20260424100757/phase-37-1-quality-gate.json`
  - goal: make installed-host writeback inspectable, undoable, and dogfood-measurable without changing Phase 37 accepted claims
  - constraints: writeback remains opt-in, raw transcripts are not persisted, and no root public writeback API is added
  - accepted status: audit ledger, inspect/forget CLI, deterministic fixture-backed dogfood summary, local real-ledger dogfood mode, and Phase 37.1 gate tooling are implemented and accepted
- Phase 38 is now closed as the governed runtime surface slice:
  - task-board entrypoint: `task-board/40-phase-38-governed-runtime-surface.txt`
  - breakdown folder: `task-board/phase-38-governed-runtime-surface/`
  - accepted scope: traceSink, targeted `reviseMemory()`, `memory.runtime.*`, background jobs, provider facade, Express/Fastify examples
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-38-Quality-Gate.md`
  - quality gate: `reports/quality-gates/phase-38/run-20260425084045/phase-38-quality-gate.json`
  - current status: P38-T001 through P38-T007 are implemented and accepted
- Phase 39 is now closed as the Python HTTP integration bridge slice:
  - task-board entrypoint: `task-board/41-phase-39-python-http-integration-bridge.txt`
  - breakdown folder: `task-board/phase-39-python-http-integration-bridge/`
  - focus: public `goodmemory/http` bridge API and packaged `goodmemory-http-bridge` server for Python/FastAPI consumers, built on the accepted public memory APIs and governed runtime surface; OneLife is the first reference consumer, not the product boundary
  - refined bridge boundary: backend-only/authenticated service calls, scoped authorization for export/forget/revise, bridge-level async remember mode, targeted `/memory/revise` only by explicit `memoryId`, and product-owned session lifecycle with runtime archive off by default
  - contract doc: `docs/GoodMemory-Python-HTTP-Integration-Bridge.md`
  - public bridge API: `src/http/index.ts` exported as `goodmemory/http`
  - packaged server bin: `scripts/goodmemory-http-bridge.ts`
  - local compatibility re-export: `examples/support/http-memory-bridge.ts`
  - Python consumer smoke: `examples/python-fastapi-memory-consumer.py`
  - quality gate: `reports/quality-gates/phase-39/run-20260425041112/phase-39-quality-gate.json`
  - dependency preflight: Phase 38 gate writes under `.tmp-goodmemory-phase39/quality-gates/phase-38/run-phase39-preflight-38`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-39-Quality-Gate.md`
  - current status: P39-T001 through P39-T006 are implemented and accepted
- Phase 40 is now closed as the v0.2 release proof and product eval slice:
  - task-board entrypoint: `task-board/42-phase-40-v0-2-release-proof-and-product-eval.txt`
  - breakdown folder: `task-board/phase-40-v0-2-release-proof-and-product-eval/`
  - sequencing: Phase 40 started only after Phase 39 closed with bridge regression and quality-gate evidence
  - focus: public quickstart/15-minute integration guide, v0.2 package release proof, cross-consumer adoption smoke, and product eval rollup versus no-memory baseline
  - cross-consumer adoption evidence: `reports/eval/adoption/phase-40/run-20260425163012-cross-consumer/report.json`
  - product eval evidence: `reports/eval/product/phase-40/run-20260425165544-product-eval/report.json`
  - quality gate: `reports/quality-gates/phase-40/run-20260425172323/phase-40-quality-gate.json`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-40-Quality-Gate.md`
  - current status: P40-T001 through P40-T006 are implemented and accepted
- Phase 41 is now closed as the installed-host pre-action unification slice:
  - task-board entrypoint: `task-board/43-phase-41-installed-host-pre-action-unification.txt`
  - breakdown folder: `task-board/phase-41-installed-host-pre-action-unification/`
  - focus: make `goodmemory install|enable codex` register managed `PreToolUse` and route high-risk Bash commands through an installed `goodmemory codex action` bridge on the same installed config/storage/providers path as recall and writeback
  - deterministic evidence: `reports/eval/fallback/phase-41/run-20260425213045/report.json`
  - installed live evidence: `reports/eval/live-memory/phase-41/run-phase41-live-current/report.json`
  - quality gate: `reports/quality-gates/phase-41/run-20260425223045/phase-41-quality-gate.json`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-41-Quality-Gate.md`
  - fixed runtime shape: two-stage installed path, where `goodmemory codex hook pre-tool-use` denies or redirects and `goodmemory codex action` performs rewrite/veto/execution/lineage
  - fixed boundary: do not reopen Phase 34 canonical bootstrap-wrapper evidence, do not widen the root API, do not make Claude a live blocker
- Phase 41.9 is now closed as a bookkeeping-only status/task-board sync:
  - task-board entrypoint: `task-board/44-phase-41-9-status-task-board-sync.txt`
  - breakdown folder: `task-board/phase-41-9-status-task-board-sync/`
  - focus: align Phase 41 leaf task-board statuses with the accepted current-status and top-level Phase 41 closure without reopening Phase 41 or changing accepted behavior
  - release-facing assertion: current status cannot say Phase 41 is closed while Phase 41 leaf files still say `[TODO] Not started`
- Phase 42 is now closed as the Progressive Recall Protocol slice:
  - task-board entrypoint: `task-board/45-phase-42-progressive-recall-protocol.txt`
  - breakdown folder: `task-board/phase-42-progressive-recall-protocol/`
  - focus: implement ProgressiveRecallService, `gmrec:v1` recordRef, progressive renderer, MCP adapters, installed-host `contextMode`, and redaction/scope/fallback gates
  - boundary: MCP wraps the shared service; it does not own the protocol
  - deterministic evidence: `reports/eval/fallback/phase-42/run-20260426093000/report.json`
  - quality gate: `reports/quality-gates/phase-42/run-20260426100000/phase-42-quality-gate.json`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-42-Quality-Gate.md`
- Phase 43 is now closed as the Runtime Kit slice:
  - task-board entrypoint: `task-board/46-phase-43-runtime-kit.txt`
  - breakdown folder: `task-board/phase-43-runtime-kit/`
  - focus: add `goodmemory/runtime-kit`, lifecycle orchestration, preAction reuse of Phase 41, afterModelCall governance, deterministic Codex/Claude adapter parity, and AI SDK integration
  - deterministic evidence: `reports/eval/fallback/phase-43/run-20260426113000/report.json`
  - quality gate: `reports/quality-gates/phase-43/run-20260426120000/phase-43-quality-gate.json`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-43-Quality-Gate.md`
  - boundary: afterModelCall does not become default-on durable writeback, runtime events expose `scopeDigest` instead of raw scope ids, and root `goodmemory` is not widened
- Phase 43.5 is now closed as the Optional Runtime Worker slice:
  - task-board entrypoint: `task-board/47-phase-43-5-optional-runtime-worker.txt`
  - breakdown folder: `task-board/phase-43-5-optional-runtime-worker/`
  - focus: bounded runtime-kit jobs, drain-once/status/recover, audit/redaction, failure isolation, and optional daemon start/stop
  - deterministic evidence: `reports/eval/fallback/phase-43-5/run-20260426133000/report.json`
  - quality gate: `reports/quality-gates/phase-43-5/run-20260426140000/phase-43-5-quality-gate.json`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-43.5-Quality-Gate.md`
  - boundary: worker is optional, stores only redacted preview/scopeDigest envelopes, and must not block inline runtime behavior
- Phase 44 is now closed as the Local Viewer data API and lightweight UI slice:
  - task-board entrypoint: `task-board/48-phase-44-local-viewer-data-api-and-lightweight-ui.txt`
  - breakdown folder: `task-board/phase-44-local-viewer-data-api-and-lightweight-ui/`
  - focus: read-only local data API, static viewer shell, progressive record drill-down, writeback audit, trace/session views, local-token security, and package/license hygiene
  - deterministic evidence: `reports/eval/fallback/phase-44/run-20260426153000/report.json`
  - quality gate: `reports/quality-gates/phase-44/run-20260426160000/phase-44-quality-gate.json`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-44-Quality-Gate.md`
  - boundary: viewer is inspectability, not dashboard/admin/cloud/analytics, and it exposes no mutation routes, CORS, or raw transcript display
- Phase 44.1 is now closed as a bookkeeping-only post-Phase-44 roadmap sync:
  - task-board entrypoint: `task-board/49-phase-44-1-post-phase-44-roadmap-sync.txt`
  - breakdown folder: `task-board/phase-44-1-post-phase-44-roadmap-sync/`
  - focus: remove stale Phase 44 implementation routing, add Phase 44 to regression preservation, and make Phase 45 a new phase rather than a Phase 44 reopen
  - boundary: this does not change Phase 44 accepted behavior, evidence, or local viewer scope
- Phase 45 is now closed as the First Reference Product and Adoption Evidence slice:
  - task-board entrypoint: `task-board/50-phase-45-first-reference-product-and-adoption-evidence.txt`
  - breakdown folder: `task-board/phase-45-first-reference-product-and-adoption-evidence/`
  - focus: prove GoodMemory can be adopted by a real reference product through public package exports or the HTTP bridge, with observable end-to-end memory value
  - adoption evidence: `reports/eval/adoption/phase-45/run-20260427104530-adoption-eval/report.json`
  - quality gate: `reports/quality-gates/phase-45/run-20260427110000/phase-45-quality-gate.json`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-45-Quality-Gate.md`
  - boundary: no hosted dashboard, no viewer mutation routes, no raw transcript archive, no new root public API, and no additional installed-host hook expansion as a gate blocker
- Phase 46 is now closed as the Memory Quality and Maintenance 2.0 slice:
  - task-board entrypoint: `task-board/51-phase-46-memory-quality-and-maintenance-2-0.txt`
  - breakdown folder: `task-board/phase-46-memory-quality-and-maintenance-2-0/`
  - focus: use Phase 45 redacted product evidence to repair memory quality through observed failure samples plus guarded stale-recall maintenance repair
  - quality eval: `reports/eval/fallback/phase-46/run-20260427123000-quality-eval/report.json`
  - quality gate: `reports/quality-gates/phase-46/run-20260428110000/phase-46-quality-gate.json`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-46-Quality-Gate.md`
  - boundary: no new adoption surface, dashboard, provider rollout, cloud claim, root public API, raw transcript archive, or viewer mutation route
- Phase 47 is now closed as the Provider-Backed Retrieval Rollout and Quality Promotion slice:
  - task-board entrypoint: `task-board/52-phase-47-provider-backed-retrieval-rollout-and-quality-promotion.txt`
  - breakdown folder: `task-board/phase-47-provider-backed-retrieval-rollout-and-quality-promotion/`
  - focus: promote explicit provider-backed `hybrid` retrieval from optional uplift to controlled product capability when Phase 45/46 evidence proves it improves memory quality
  - provider rollout eval: `reports/eval/fallback/phase-47/run-20260428120000-provider-rollout-eval/report.json`
  - quality gate: `reports/quality-gates/phase-47/run-20260428123000/phase-47-quality-gate.json`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-47-Quality-Gate.md`
  - boundary: rules-only remains default; provider-backed retrieval remains explicit, measurable, fail-visible, and safely fallback-capable; no default-on rollout, root API widening, hosted dashboard, cloud claim, raw transcript archive, or public HTTP bridge `llm-assisted` rollout
- Phase 48 is now closed as the Dashboard, Cloud Sync, and Team Workspace Decision slice:
  - task-board entrypoint: `task-board/53-phase-48-dashboard-cloud-sync-and-team-workspace-decision.txt`
  - breakdown folder: `task-board/phase-48-dashboard-cloud-sync-and-team-workspace-decision/`
  - focus: close hosted dashboard, cloud sync, and team workspace as an accepted no-go decision after Phase 44-47 evidence failed to justify a hosted/shared surface
  - decision report: `reports/eval/fallback/phase-48/run-20260428170000-dashboard-cloud-decision/report.json`
  - quality gate: `reports/quality-gates/phase-48/run-20260428173000/phase-48-quality-gate.json`
  - archive summary: `docs/archive/quality-gates/GoodMemory-Phase-48-Quality-Gate.md`
  - boundary: Phase 44 local viewer remains local-only/read-only; no hosted dashboard, cloud sync, team workspace, raw transcript archive, browser-executed viewer mutation, root public API widening, or dashboard/cloud/team package export is accepted
- Any work beyond the closed Phase 41 slice should add a later phase file or explicitly reopen a closed phase with failing regression or gate evidence.
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
   - Preserve the closed Phase 17 through Phase 48 guarantees while future work lands
   - Keep the accepted Phase 27 adoption evidence, accepted Phase 28 supported local acceleration guarantees, accepted Phase 29 historical Bun-only release hardening, accepted Phase 30 behavioral evidence, accepted Phase 31 native-host evidence, accepted Phase 32 external-host evidence, accepted Phase 33 package-boundary evidence, accepted Phase 34 host pre-action policy evidence, accepted Phase 35 installed-host middleware evidence, accepted Phase 36 public write-profile evidence, Phase 37 installed-host writeback evidence, Phase 37.1 productization evidence, Phase 38 governed runtime evidence, Phase 39 Python/FastAPI bridge evidence, Phase 40 release-proof/product-eval evidence, Phase 41 installed pre-action unification evidence, Phase 41.9 status-sync evidence, Phase 42 progressive recall evidence, Phase 43 runtime-kit evidence, Phase 43.5 optional-worker evidence, Phase 44 local-viewer evidence, Phase 45 reference-product evidence, Phase 46 quality-maintenance evidence, Phase 47 provider-backed rollout evidence, and Phase 48 hosted-surface no-go evidence regression-covered while future work lands
   - If new Phase 30 through Phase 48 evidence fails, including the Phase 37.1 and Phase 48 slices, explicitly reopen the affected phase or add a new phase file rather than treating it as still queued
   - Execute future product-adoption work on top of the accepted Phase 35 installed-host middleware boundary, Phase 37 installed-host writeback boundary, Phase 39 Python/FastAPI bridge boundary, Phase 40 public release proof, Phase 41 installed pre-action boundary, Phase 42 ProgressiveRecallService boundary, Phase 43 Runtime Kit boundary, Phase 43.5 Optional Worker boundary, Phase 44 Local Viewer boundary, Phase 45 reference-product boundary, Phase 46 quality-maintenance boundary, Phase 47 explicit provider-backed retrieval boundary, and Phase 48 hosted-surface no-go boundary instead of widening the core API or reintroducing repo-internal integration paths
2. Near-term product differentiation
   - Extend the roadmap only through new phase files or explicit reopen decisions backed by failing evidence
   - Execute future reference-product or consumer proof on top of Phase 39 HTTP bridge, Phase 40 release-proof/product-eval evidence, Phase 42 progressive recall, Phase 43 runtime-kit, Phase 43.5 optional-worker, Phase 44 local-viewer inspection, Phase 45 adoption, Phase 46 quality repair, Phase 47 explicit `hybrid` retrieval, and Phase 48 no-go hosted-surface boundaries instead of adding hosted dashboard, viewer mutation, root API widening, or more installed-host hooks as the next blocker
   - Route new real product failure samples into a new phase or explicit reopen decision rather than guessing at new infrastructure
   - Keep retrieval-first, host-adapter, reviewer, maintenance, release-hardening, internal recall-router, implicit-behavioral-eval, phase-25 deterministic behavioral-evidence, phase-26 local-first runtime guarantees, Phase 27 adoption evidence, Phase 28 supported local acceleration, Phase 29 Bun-only release hardening, Phase 30 behavioral enactment guarantees, Phase 31 native-host outcome/correction guarantees, Phase 35 installed-host middleware guarantees, Phase 36 public write-profile guarantees, Phase 37 installed-host writeback guarantees, Phase 37.1 audit/undo guarantees, Phase 38 governed runtime guarantees, Phase 39 bridge guarantees, Phase 40 release-proof guarantees, Phase 41 installed pre-action guarantees, Phase 42 progressive recall guarantees, Phase 43 runtime-kit guarantees, Phase 43.5 optional-worker guarantees, Phase 44 local-viewer guarantees, Phase 45 adoption guarantees, Phase 46 quality guarantees, Phase 47 explicit provider-backed guarantees, and Phase 48 hosted-surface no-go guarantees regression-covered while later phases execute
3. Medium-term system hardening
   - Keep the accepted Codex host integration surface stable while future host-runtime evidence deepens through runtime-kit, optional worker, local viewer, reference-product adoption, memory-quality repair, and provider-backed retrieval rollout slices
   - Keep Phase 48 hosted dashboard, cloud sync, and team workspace scope closed as no-go unless a later measured adoption blocker and full privacy/security pilot design explicitly reopen it
4. Host integration track
   - Keep the closed Phase 18 adapter surface and closed Phase 19 rollout families stable while Phase 42-44 runtime-shell work lands


V1 Exit Criteria
----------------
GoodMemory v1 is not complete until all of the following are true:

- TypeScript package boots cleanly in the Bun repo/dev path and in the public Node/Bun install boundary
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

- 33-phase-32-external-host-integration-productization.txt
  External Codex/Claude Code productization on the canonical `coding_agent + goodmemory + goodmemory/ai-sdk + goodmemory/host` line with thin public event ingestion and installed-package bootstrap

- 34-phase-33-node-compatible-package-boundary-and-node-first-integration.txt
  Formal Node-compatible dist/types package boundary, Bun-runtime isolation, Node/Bun consumer matrix, and one canonical plain AI SDK server integration path

- 35-phase-34-host-pre-action-policy-and-veto-contract.txt
  Host-level pre-action assessment, veto/rewrite policy, Codex action-gate wrapper, and canonical live enforcement evidence

- 36-phase-35-installed-host-memory-middleware-and-hooks.txt
  Global install, repo opt-in, hook-injected recall, `goodmemory-mcp`, and manual write CLI for Codex/Claude host middleware productization

- 37-phase-36-public-domain-write-profiles-and-rules.txt
  Public domain write profiles, rules, annotations, and assistant-output policy on the stable root API

- 38-phase-37-installed-host-selective-writeback.txt
  Installed-host selective writeback for Codex with no raw transcript persistence and automatic next-session recall

- 39-phase-37-1-writeback-productization-polish.txt
  Installed-host writeback audit ledger, inspect/forget CLI, dogfood evidence, and productization polish without reopening Phase 37

- 40-phase-38-governed-runtime-surface.txt
  Governed runtime surface: traceSink, targeted revise, runtime facade, background jobs, provider facade, and thin server examples

- 41-phase-39-python-http-integration-bridge.txt
  Public Python/FastAPI bridge surface through `goodmemory/http` and `goodmemory-http-bridge`

- 42-phase-40-v0-2-release-proof-and-product-eval.txt
  v0.2 release proof, cross-consumer adoption smoke, and product eval rollup versus a no-memory baseline

- 43-phase-41-installed-host-pre-action-unification.txt
  Installed Codex `PreToolUse` hook plus installed action bridge so pre-action policy, recall, and writeback share one managed host path
