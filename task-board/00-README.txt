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
4. 68-phase-63-beam-scale-and-noise-hardening.txt

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
- Phase 62 LongMemEval is accepted as the first sequential external benchmark
  hardening slice; Phase 63 BEAM is now active.
- Current entrypoint: `task-board/68-phase-63-beam-scale-and-noise-hardening.txt`
- Current breakdown:
  `task-board/phase-63-beam-scale-and-noise-hardening/00-README.txt`
- Previous accepted entrypoint:
  `task-board/67-phase-62-longmemeval-sequential-hardening.txt`
- External benchmark order: LongMemEval -> BEAM -> MemoryAgentBench -> LoCoMo.
- Current accepted tooling includes `eval:phase-62`, `gate:phase-62`,
  `eval:phase-62-recall-diagnostic`, `prepare:phase-63-beam`,
  `analyze:phase-63-beam`, `eval:phase-63`,
  `eval:phase-63-recall-diagnostic`, `eval:phase-63-live-slice`, and
  `gate:phase-63`.
- Accepted LongMemEval close checkpoint:
  `run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-retry-r1-merged-20260517T161058Z`
  has `goodmemory-hybrid` at 454/500, evidence-session recall 0.9590, missed
  recall 35, wrong recall 6, wrong answers 46, and `executionFailures: 0`.
  This exceeds the latest accepted full-context reference at 451/500 and
  unblocks BEAM as the next internal hardening phase. It remains internal
  research evidence, not a public benchmark claim.
- Current recovery tooling status: Runtime AI SDK retry treats socket-closed,
  `model_cooldown`, and usage-limit errors as transient. Failed-row recovery is
  now the preferred path over shard reruns and supports `--batch-delay-ms`,
  `--exclude-case-id`, and `--skip-case-id`.
- Current BEAM status: smoke run `run-phase63-beam-smoke-current` and smoke
  gate `run-20260518003000` are accepted; the real 100K adapter run
  `run-phase63-beam-100k-full-initial-20260518T000335Z` covers 400 cases with
  `executionFailures: 0` but is oracle/evidence-contract proof, not a BEAM
  score.
- Current BEAM failure surface: the first real rules-only diagnostic
  `run-phase63-beam-100k-recall-diagnostic-rules-full-20260518T005500Z`
  starts at recall 0.11625896794910878 with missed recall 340/355. The latest
  kept current-code technical-challenge summary gated rerun,
  `run-phase63-beam-100k-recall-diagnostic-rules-full-technical-challenge-summary-gated-current-20260520T060654Z`,
  reaches recall 0.42556470133934937, missed 251/355, and wrong-recall/noise
  386/400. It repairs `1:summarization:2` from 0 to 1.0 recall after the
  career/philosophy rerun repaired `12:summarization:2`, and lifts
  summarization recall to 0.20018738977072315. It is still a narrow recall lift
  with changed-case non-summary tie churn and persistent full-run noise, so
  full-run misses and noise still block closure.
  Same-three-case live evidence tops out at
  `run-phase63-beam-100k-live-slice-rules-context-ordered-pruning-v6-initial3-escalated-20260518T160743`:
  recall 1.0, answer accuracy 3/3, `executionFailures: 0`, and
  wrong-recall/noise 2/3. Next: broaden beyond the representative trio and
  reduce full-run recall misses/noise before any BEAM claim.
- Current provider sanity status: after provider recovery, Phase 62 one-case
  live probes passed for both `baseline-no-memory`
  (`run-phase62-provider-probe-baseline-20260518T-provider-restored`) and
  `goodmemory-hybrid`
  (`run-phase62-provider-probe-hybrid-20260518T-provider-restored`) with
  `executionFailures: 0`; the hybrid probe answered `e47becba` correctly.

Documentation Hygiene
---------------------
- `docs/README.md` is the documentation router.
- `task-board/00-README.txt` must stay a slim execution router.
- Superseded design drafts belong under `docs/archive/design-inputs/`.
- Copied reference material belongs under `docs/archive/reference-corpus/`.
- Do not add a new root-level docs plan if an existing current-truth document can
  be updated.
