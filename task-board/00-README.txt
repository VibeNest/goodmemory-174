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


Global Exit Criteria
--------------------
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
- At least one chat example works
- Release documentation is written


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
