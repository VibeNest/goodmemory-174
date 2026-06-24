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
- Phase 64 MemoryAgentBench has an accepted internal AR/CR zero-failure live closure (CR 0.959, AR 0.67, `executionFailures: 0`); internal small-slice evidence, not a public claim.
- Phase 65 LoCoMo is banked as retrieval-boundary evidence; paused until a real neural semantic retrieval endpoint is available (next entry P65-R003). Dialog windows, rules-light query expansion, and LLM turn-captioning were ruled out under the current lexical/rules substrate.
- Phase 63 BEAM remains partial: rules-only fitted retrieval recall 0.9621 and an accepted measured full-run checkpoint at 278/400 answer accuracy (0.695) with the answer-hardening evidence pack, but not BEAM performance closure or a public claim; answer-gap hardening is owned by the BEAM workstream.
- Current active lane: claim hygiene / release docs, unless the BEAM answer-pack workstream owns active code.
- Current entrypoint: `task-board/69-phase-64-memoryagentbench-agent-memory-hardening.txt`
- Current breakdown: `task-board/phase-64-memoryagentbench-agent-memory-hardening/00-README.txt`
- Paused BEAM entrypoint: `task-board/68-phase-63-beam-scale-and-noise-hardening.txt`
- External benchmark order: LongMemEval -> BEAM -> MemoryAgentBench -> LoCoMo.
- Accepted LongMemEval close: `run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-retry-r1-merged-20260517T161058Z`, 454/500, evidence-session recall 0.9590, `executionFailures: 0`.
- Accepted BEAM smoke: `run-phase63-beam-smoke-current`, gate `run-20260518003000`.
- Latest accepted BEAM retained diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-project-card-total-count-current-20260615T200000Z`, evidence-chat recall 0.9620612564274538, missed 20/355, wrong-recall/noise 167/400, zero-recall 0.
- Latest accepted BEAM measured full-run checkpoint: `run-phase63-beam-100k-live-closure-gpt55-evidence-pack-answer-hardening-current`, 278/400 answer accuracy (0.695), wrong-answer 122/400, same fitted recall 0.9621, `executionFailures: 0`; answer-gap hardening remains open.
- Latest local BEAM answer-gap analysis: `run-phase63-beam-live-answer-gap-answer-hardening-current`, 122 wrong answers: 58 full-recall-clean, 37 full-recall-noisy, 15 missing-evidence; top lanes are conflict_update, instruction_following, and temporal_order.
- Live-measured BEAM answer-pack hardening has landed for question-type-aware temporal_order, conflict_update/CR, aggregate_count/count tables, multi_session_reasoning facets, instruction_following standing/latest constraints, summarization framing, order requested-count/topic answer shape, and contradiction answers that avoid yes/no-only output; hard-slice reached 10/12 and the full run improved to 278/400, but this is still not performance closure.
- Provider sanity: `run-phase62-provider-probe-hybrid-20260518T-provider-restored` passed with `executionFailures: 0`.

Documentation Hygiene
---------------------

- `docs/README.md` is the documentation router.
- `task-board/00-README.txt` must stay a slim execution router.
- Superseded design drafts belong under `docs/archive/design-inputs/`.
- Copied reference material belongs under `docs/archive/reference-corpus/`.
- Do not add a new root-level plan if an existing current-truth document can be updated.
