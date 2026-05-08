GoodMemory Task Board
=====================

Purpose
-------
This folder is the executable development plan for GoodMemory. This file is a
router, not a history dump. Read it to find the current phase and the few recent
accepted boundaries that matter for new work.

Source documents:

- `docs/README.md`
- `docs/GoodMemory-PRD.md`
- `docs/GoodMemory-TDD-and-Evaluation-Strategy.md`
- `docs/GoodMemory-OSS-Architecture-v1.md`
- `docs/GoodMemory-First-Principles-and-Reference-Architecture.md`
- `docs/GoodMemory-Current-Status-and-Evidence.md`

Do not bulk-read all phase files. Closed phase detail lives in its own phase
file, quality-gate archive, and generated reports.

Working Rules
-------------
1. TypeScript is the implementation language.
2. Bun is the canonical repo-local development, eval, and gate runner.
3. Node LTS remains a public package/runtime boundary for package consumers.
4. Development is TDD-first; phases close only with targeted regressions and
   synchronized evidence.
5. Public API simplicity remains mandatory: `createGoodMemory`, `recall`,
   `buildContext`, `remember`, `forget`, `feedback`, `exportMemory`, and
   `deleteAllMemory`.
6. Full benchmark artifacts are research evidence unless explicitly promoted by
   a release gate.
7. A benchmark transition only counts after the decision is recorded as executed evidence,
   not after a speculative plan note.

Generic Eval Command Contract
-----------------------------
- `eval:live-memory` means auto-storage live memory. It resolves storage through
  the runtime resolver: default local SQLite unless `GOODMEMORY_STORAGE_PROVIDER`
  / `GOODMEMORY_STORAGE_URL` points to a provider backend.
- `eval:live-auto-memory` is an alias for `eval:live-memory`.
- `eval:live-provider-memory` is the explicit provider-backed path and requires
  `GOODMEMORY_TEST_POSTGRES_URL`, embedding env vars, and assisted-extractor
  env vars.
- Phase-specific provider-backed runners may still write under
  `reports/eval/live-memory/phase-*`; those historical phase paths do not
  redefine the generic command contract.

Current Execution Order
-----------------------
Read and execute these current/recent phase files in order:

1. 65-phase-60-implicitmembench-overall-priming-protocol.txt
2. 66-phase-61-priming-abstraction-and-contamination-safe-output.txt
3. 67-phase-62-longmemeval-sequential-hardening.txt

For older phases, open the specific numbered phase file only when a task names
that phase or a current document points to a specific archived gate/report.

Recent Accepted Boundary
------------------------
- Phase 60 is closed as the ImplicitMemBench overall and priming protocol.
  Canonical overall summary:
  `reports/eval/fallback/phase-60/run-phase60-fallback-current/overall-summary.json`
  Canonical fallback report (ignored generated):
  `reports/eval/fallback/phase-60/run-phase60-fallback-current/report.json`
  Canonical gate:
  `reports/quality-gates/phase-60/run-20260505120000/phase-60-quality-gate.json`
- Phase 61 is accepted as priming abstraction and contamination-safe output.
  The post-Phase-61 / Phase 62A recovery full-300 rerun is the latest canonical
  internal research result for this protocol line:
  `reports/eval/live/phase-61-full300/run-phase61-full300-20260505T170001Z/overall-summary.json`
  It reports `213.26 / 300 = 71.09%` for
  `goodmemory-distilled-feedback+controlled-priming`, versus baseline
  `128 / 300 = 42.67%`. This remains internal research evidence, not a release
  gate or public leaderboard claim.

Active Phase
------------
- Phase 62 is active as the LongMemEval sequential hardening slice.
- Entrypoint: `task-board/67-phase-62-longmemeval-sequential-hardening.txt`
- Breakdown: `task-board/phase-62-longmemeval-sequential-hardening/00-README.txt`
- External benchmark order: LongMemEval -> BEAM -> MemoryAgentBench -> LoCoMo.
- Current accepted tooling: `eval:phase-62`, `gate:phase-62`, and
  `eval:phase-62-recall-diagnostic`.
- Current live status:
  - fixed 18-case type-balanced manifest: both GoodMemory profiles reached
    18/18 answer accuracy with zero execution failures and zero wrong recall.
  - 60-case type-balanced slice initially exposed broader weakness:
    GoodMemory profiles reached 19/60 while `baseline-full-context` reached
    55/60.
  - post-repair rules-only live rerun now reaches 60/60 with evidence-session
    recall 0.9292 and `executionFailures: 0`.
  - post-household-issue hybrid live rerun now reaches 60/60 with
    evidence-session recall 0.9292 and `executionFailures: 0`.
- Current blocker: Phase 62 remains WIP after the clean full 500-case LongMemEval
  execution
  `run-phase62-longmemeval-full500-current-merged-gpt55-cooldown-resume3-20260507T191000Z`.
  Execution is closed (`executionFailures: 0`), but quality is not:
  `baseline-full-context` is 454/500, `goodmemory-rules-only` is 344/500, and
  `goodmemory-hybrid` is 337/500. This was recovered from failed profile/case
  rows, not rerun from scratch for every clean row. The first post-full500
  quality repair now
  fixes four basic explicit personal-attribute misses (`dog breed`, `cat name`,
  `undergraduate school`, `shampoo brand`) in a targeted live rules-only rerun,
  and the second repair fixes six countable multi-session misses (`movie
  festivals`, `baking`, `health devices`, `aquarium fish`, `kitchen items`,
  `market earnings`) in provider-free recall plus a targeted live rules-only
  rerun. The third repair fixes seven temporal-reasoning misses in
  provider-free recall plus a targeted live rules-only rerun
  `run-phase62-longmemeval-live-temporal-after-answerfacts-20260507T163300Z`
  with 7/7 answer accuracy and `executionFailures: 0`. The fourth repair fixes
  three additional multi-session aggregate misses (`game hours`, `wedding
  attendance`, `babies born`) in provider-free recall plus
  `run-phase62-longmemeval-live-multi-aggregate2-after-20260508T004900Z`
  with 3/3 answer accuracy and `executionFailures: 0`. A later
  provider-cooldown resume check retried only the one failed row
  from `run-phase62-longmemeval-full500-current-merged-after-retry-live-20260507T030000Z`
  and produced
  `run-phase62-longmemeval-full500-current-merged-after-retry-live-20260507T070500Z`
  with `executionFailures: 0`; dry-run against the clean `033000Z` merged
  report correctly produced no retry batches. A later real `gpt-5.5` cooldown
  recovery used the same failed-row path: 9-way retry left 744 provider
  failures, low-concurrency retry reduced that to 3, and final
  single-concurrency retry produced the clean `191000Z` merge. The full-500
  result still needs
  broader quality repair. Do not open BEAM until the remaining multi-session
  and temporal-reasoning gap is repaired or explicitly deferred.

Documentation Hygiene
---------------------
- `docs/README.md` is the documentation router.
- `task-board/00-README.txt` must stay a slim execution router.
- Superseded design drafts belong under `docs/archive/design-inputs/`.
- Copied reference material belongs under `docs/archive/reference-corpus/`.
- Do not add a new root-level docs plan if an existing current-truth document can
  be updated.
