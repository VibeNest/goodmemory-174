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


Current Sequencing Note
-----------------------
- Phase 15 is closed. The active execution focus is now Phase 16 procedural promotion and outcome-aware maintenance.
- Phase 16 work should build on the new internal ports and provider-boundary guardrails: core behavior uses narrow subsystem ports, and provider-backed runtime code lives under `src/provider/`.
- Phase 15 through Phase 18 extend the board from "usable memory core" into "proposal-driven, eval-gated, host-integrated memory system".
- Dependency-matrix tests now act as a merge gate for archive/evidence/proposal and future host-adapter changes.
- Historical filenames for Phase 12 and Phase 13 are preserved to avoid churn; follow the execution order above rather than filename numbering.


Priority Bands
--------------
Use these bands when choosing what to work on next:

1. Immediate focus
   - Close any local WIP without widening scope
   - Execute Phase 16 procedural promotion and outcome-aware maintenance
2. Near-term product differentiation
   - Build validated promotion, demotion, and maintenance outcomes on top of the completed Phase 15 proposal substrate
   - Keep proposal visibility and gate behavior regression-covered while Phase 16 outcome loops land
3. Medium-term system hardening
   - Execute Phase 17 eval-gated rollout
4. Host integration track
   - Execute Phase 18 adapters for Claude/Codex-style hosts only after canonical/archive/artifact surfaces are stable


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

- 18-phase-17-eval-gated-promotion-and-strategy-rollout.txt
  Shadow/assist/promote rollout, strategy comparison, eval gates, and public surface decisions

- 19-phase-18-host-adapters-and-file-authoritative-integration.txt
  Optional Claude/Codex-style adapter surfaces over compiled artifacts without changing core truth sources
