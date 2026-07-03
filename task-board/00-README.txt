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
- Phase 65 LoCoMo is banked as retrieval-boundary evidence, not performance closure. Dialog windows, rules-light query expansion, and LLM turn-captioning were ruled out; P65-R003 then found a real neural endpoint ties BM25 exactly, so the live bottleneck is candidate-pool admission. Current local code has opt-in semantic candidate-generation union plumbing (`retrieval.semanticCandidates`, `--semantic-candidates`, `--provider-embedding`) plus direct full-root sharding (`--case-id`), targeted QA-category slices (`--category`), and category-summary assembly (`summarize:phase-65-locomo-categories`).
  TopK16/maxAdditions4 is the current bounded-noise point. It lifted conv-1 answer accuracy from 4/199 (0.020) to 97/199 (0.487), held-out conv-30 to 67/105 (0.638), held-out conv-41 to 95/193 (0.492), held-out conv-44 to 85/158 (0.538), and held-out conv-42 to 106/260 (0.408), all `executionFailures: 0`; these live reports were re-scored after the adversarial abstention scorer repair (`No information available` gold accepts explicit abstention aliases, still rejects bait).
  The assembled full-root category artifact `locomo-category-matrix-top16-add4-live-pack-current/category-summary.json` covers 1986 questions at 983/1986 live accuracy (0.4949647533), weighted evidence recall 0.5884050761, 1081/1986 fully retrieved, noise 15235, and `executionFailures: 0`. The category-gap artifact `locomo-category-gap-analysis-top16-add4-live-pack-current/category-gap-analysis.json` splits the 1003 wrong answers into 647 missing-evidence wrong rows and 356 full-recall-but-noisy wrong rows, with 0 clean full-recall wrong rows. Retrieval-only probes show the existing decompose+multihop stack is not the open_domain lever (recall 0.2763991013 -> 0.2822990939), but wider topK32/maxAdditions8 semantic admission improves open_domain to 0.3536560458 / 26/96 fully retrieved and multi_hop to 0.3972616166 / 48/282, at higher noise. The new relative-score floor reduces that wider-admission noise at rel0.8: open_domain 0.3432393791 / 25/96 / noise 936 and multi_hop 0.3767491208 / 42/282 / noise 2939. The budget-delta analyzer ranks open_domain as the better retrieval/noise target (+0.0278501157 recall per 100 added noise turns vs multi_hop +0.0068534205), but the first rel0.8 open_domain live validation did not improve answer accuracy: `locomo-open-domain-semantic-provider-top32-add8-rel08-live-pack-current` stayed 22/96 (0.2291666667), same as topK16/maxAdditions4, with `executionFailures: 0`; gap buckets moved from 66 missing-evidence / 8 full-recall-noisy wrong rows to 59 / 15, and the live-delta artifact shows 3 improvements, 3 regressions, 9 unconverted retrieval gains, and 3 noisy full-recall regressions. Category slices remain blockers: single_hop 457/841, open_domain 22/96, multi_hop 86/282, temporal 178/321, and adversarial 240/446. BEAM rules-only safety comparison passed at `caseDeltaCount: 0`. Next work is more targeted candidate admission plus noise and answer-policy controls before any default or public claim.
- Phase 63 BEAM remains partial: rules-only fitted retrieval recall 0.9621 and an accepted measured full-run checkpoint at 278/400 answer accuracy (0.695) with the answer-hardening evidence pack, but not BEAM performance closure or a public claim; answer-gap hardening is owned by the BEAM workstream.
- Current active lane: v0.3 release readiness / public-surface hardening (Phase 66), unless the BEAM answer-pack workstream owns active code.
- Current entrypoint: `task-board/69-phase-64-memoryagentbench-agent-memory-hardening.txt`
- Current breakdown: `task-board/phase-64-memoryagentbench-agent-memory-hardening/00-README.txt`
- Paused BEAM entrypoint: `task-board/68-phase-63-beam-scale-and-noise-hardening.txt`
- External benchmark order: LongMemEval -> BEAM -> MemoryAgentBench -> LoCoMo.
- Accepted LongMemEval close: `run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-retry-r1-merged-20260517T161058Z`, 454/500, evidence-session recall 0.9590, `executionFailures: 0`.
- Accepted BEAM smoke: `run-phase63-beam-smoke-current`, gate `run-20260518003000`.
- Latest accepted BEAM retained diagnostic: `run-phase63-beam-100k-recall-diagnostic-rules-project-card-total-count-current-20260615T200000Z`, evidence-chat recall 0.9620612564274538, missed 20/355, wrong-recall/noise 167/400, zero-recall 0.
- Latest accepted BEAM measured full-run checkpoint: `run-phase63-beam-100k-live-closure-gpt55-evidence-pack-answer-hardening-current`, 278/400 answer accuracy (0.695), wrong-answer 122/400, same fitted recall 0.9621, `executionFailures: 0`; answer-gap hardening remains open.
- Latest local BEAM answer-gap analysis: `run-phase63-beam-live-answer-gap-answer-hardening-current`, 122 wrong answers: 58 full-recall-clean, 37 full-recall-noisy, 15 missing-evidence; current local buckets are conflict_update 29, instruction_following 27, temporal_order 23, aggregate_count 15, summarization 9, preference_following 8, abstention 7, and judge_or_expected_answer 3.
- Live-measured BEAM answer-pack hardening has landed for question-type-aware temporal_order, conflict_update/CR, aggregate_count/count tables, multi_session_reasoning facets, instruction_following standing/latest constraints, summarization framing, order requested-count/topic answer shape, and contradiction answers that avoid yes/no-only output; local deterministic hardening additionally covers latest-candidate target date/time/quantity cues, contradiction minimal-pair extraction that suppresses adjacent implementation noise, instruction answer-content cues for versioned dependencies and named tools, temporal question-target timeline anchors, required summary source-coverage audits, analyzer-level source-coverage warnings/statuses, preference-following constraints, abstention calibration, summary coverage/value anchors, aggregate/date ledgers, and GitHub raw prep concurrency. The focused summarization value-anchor live slice stayed flat at 1/9 (`run-phase63-beam-live-slice-summary-value-anchors-prelive-current`, `executionFailures: 0`); its analyzer rerun found 5/8 wrong summarization cases with source-coverage warnings, and the full source-coverage audit found status counts of 95 covered-or-no-warning, 15 expected-cues-outside-source, and 12 no-declared-source-ids across the 122 wrong cases. Warning buckets are temporal_order 9/16, summarization 5/21, aggregate_count 2/4, conflict_update 1/2. Manual summarization audit classifies `9:summarization:1`, `14:summarization:1`, and `19:summarization:1` as declared-source mismatches, while `20:summarization:1` and `20:summarization:2` have no declared source ids. The corrected source-covered summarization slice (`run-phase63-beam-live-slice-summary-source-covered-v2-prelive-current`) filtered to `12:summarization:1` and `14:summarization:2`, measured 1/2 with `executionFailures: 0` and evidence recall 1.0, and leaves `14:summarization:2` as expected-answer/source-content compatibility work. The live-slice runner now supports `--answer-gap-source-coverage-status covered-or-no-warning`, so answer-pack-only validation can exclude source metadata mismatches. Summarization now routes to source-coverage / expected-answer compatibility review before more answer-pack-only work. The full run improved to 278/400, but this is still not performance closure.
- Latest local BEAM pre-live infrastructure check: `/private/tmp/BEAM/100K.json` rebuilt from GitHub raw, smoke/gate passed with `executionFailures: 0`, and `run-phase63-beam-100k-recall-diagnostic-rules-prelive-current` matched the postmerge recall baseline with `caseDeltaCount: 0`; this proves refreshed root/recall readiness only, not answer performance.
- Provider sanity: `run-phase62-provider-probe-hybrid-20260518T-provider-restored` passed with `executionFailures: 0`.

Documentation Hygiene
---------------------

- `docs/README.md` is the documentation router.
- `task-board/00-README.txt` must stay a slim execution router.
- Superseded design drafts belong under `docs/archive/design-inputs/`.
- Copied reference material belongs under `docs/archive/reference-corpus/`.
- Do not add a new root-level plan if an existing current-truth document can be updated.
