GoodMemory Task Board
=====================

Purpose
-------

This folder is the executable development plan. This file is a compact router, not a history dump.

Source documents: `docs/README.md`, `docs/GoodMemory-PRD.md`, `docs/GoodMemory-TDD-and-Evaluation-Strategy.md`, `docs/GoodMemory-OSS-Architecture-v1.md`, `docs/GoodMemory-First-Principles-and-Reference-Architecture.md`, and `docs/GoodMemory-Current-Status-and-Evidence.md`.

Do not bulk-read all phase files. Open the named phase only.

Working Rules
-------------

1. TypeScript is the implementation language.
2. Bun is the canonical repo-local development, eval, and gate runner.
3. Node LTS remains a public package/runtime boundary for consumers.
4. Development is TDD-first.
5. Public API simplicity remains mandatory.
6. Full benchmark artifacts are research evidence unless a release gate promotes them.
7. A benchmark transition only counts after the decision is recorded as executed evidence.

Generic Eval Command Contract
-----------------------------

- `eval:live-memory` means auto-storage live memory. It resolves through the runtime resolver: default local SQLite unless `GOODMEMORY_STORAGE_PROVIDER` / `GOODMEMORY_STORAGE_URL` points to a provider backend.
- `eval:live-auto-memory` is an alias for `eval:live-memory`.
- `eval:live-provider-memory` is the explicit provider-backed path and requires `GOODMEMORY_TEST_POSTGRES_URL`, embedding env vars, and assisted-extractor env vars.
- Historical phase-specific provider-backed reports may still live under `reports/eval/live-memory/phase-*`.

Current Execution Order
-----------------------

1. 65-phase-60-implicitmembench-overall-priming-protocol.txt
2. 66-phase-61-priming-abstraction-and-contamination-safe-output.txt
3. 67-phase-62-longmemeval-sequential-hardening.txt
4. 68-phase-63-beam-scale-and-noise-hardening.txt

Open older phase files only when a task names them.

Recent Accepted Boundary
------------------------

- Phase 60 is closed: `reports/eval/fallback/phase-60/run-phase60-fallback-current/overall-summary.json`
  and `reports/eval/fallback/phase-60/run-phase60-fallback-current/report.json`.
- Phase 61 is accepted: `reports/eval/live/phase-61-full300/run-phase61-full300-20260505T170001Z/overall-summary.json`, `213.26 / 300 = 71.09%` versus baseline `128 / 300 = 42.67%`. This is internal research evidence, not a release claim.

Active Phase
------------

- Phase 62 LongMemEval is accepted as the first sequential external benchmark hardening slice.
- Phase 64 MemoryAgentBench is now active. Phase 63 BEAM was explicitly paused on 2026-06-15 (parked at rules-only retrieval recall 0.9621; README benchmark row recorded).
- Current entrypoint: `task-board/69-phase-64-memoryagentbench-agent-memory-hardening.txt`
- Current breakdown: `task-board/phase-64-memoryagentbench-agent-memory-hardening/00-README.txt`
- Paused BEAM entrypoint: `task-board/68-phase-63-beam-scale-and-noise-hardening.txt`
- External benchmark order: LongMemEval -> BEAM -> MemoryAgentBench -> LoCoMo.
- Accepted LongMemEval close: `run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-retry-r1-merged-20260517T161058Z`, 454/500, evidence-session recall 0.9590, `executionFailures: 0`.
- Accepted BEAM smoke: `run-phase63-beam-smoke-current`, gate `run-20260518003000`.
- Latest accepted BEAM retained diagnostic (paused leg): `run-phase63-beam-100k-recall-diagnostic-rules-project-card-total-count-current-20260615T200000Z`, evidence-chat recall 0.9620612564274538, missed 20/355, wrong-recall/noise 167/400, zero-recall 0.
- Provider sanity: `run-phase62-provider-probe-hybrid-20260518T-provider-restored` passed with `executionFailures: 0`.

Documentation Hygiene
---------------------

- `docs/README.md` is the documentation router.
- `task-board/00-README.txt` must stay a slim execution router.
- Superseded design drafts belong under `docs/archive/design-inputs/`.
- Copied reference material belongs under `docs/archive/reference-corpus/`.
- Do not add a new root-level plan if an existing current-truth document can be updated.
