Phase 63 Breakdown: BEAM Scale And Noise Hardening
==================================================

Workstreams
-----------

1. Source and fixture intake
   - identify the authoritative BEAM repository or dataset release
   - record license and attribution
   - inspect benchmark JSON/task shape before writing adapter code
   - create synthetic shape-compatible smoke fixtures only
   - current source intake:
     - paper: Tavakoli et al., "Beyond a Million Tokens: Benchmarking and
       Enhancing Long-Term Memory in LLMs", arXiv:2510.27246
     - dataset: `https://huggingface.co/datasets/Mohammadta/BEAM`
     - 10M dataset: `https://huggingface.co/datasets/Mohammadta/BEAM-10M`
     - visible BEAM dataset license: `cc-by-sa-4.0`
     - visible BEAM dataset format: Parquet with `100K`, `500K`, and `1M`
       splits
     - initial local adapter target: 100K split first; 500K/1M/10M later
   - current local artifacts:
     - `fixtures/external-benchmarks/beam/beam_100k_smoke.json`
     - `fixtures/external-benchmarks/ATTRIBUTION.md`

2. Adapter and smoke gate
   - follow the Phase 62 external benchmark-root pattern
   - fail closed when full data or live/provider env is missing
   - keep full upstream data outside the repository
   - report profile-level metrics and per-case execution failures
   - current local artifacts:
     - `src/eval/beam.ts`
     - `scripts/analyze-phase-63-beam-report.ts`
     - `scripts/prepare-phase-63-beam-data.ts`
     - `scripts/run-phase-63-beam-live-slice.ts`
     - `scripts/run-phase-63-beam-recall-diagnostic.ts`
     - `scripts/run-phase-63-eval.ts`
     - `scripts/run-phase-63-gate.ts`
     - `tests/unit/analyze-phase-63-beam-report.test.ts`
     - `tests/unit/beam.test.ts`
     - `tests/unit/prepare-phase-63-beam-data.test.ts`
     - `tests/unit/run-phase-63.beam-live-slice.test.ts`
     - `tests/unit/run-phase-63.beam-recall-diagnostic.test.ts`
     - `tests/unit/run-phase-63.script.test.ts`
     - `tests/unit/run-phase-63.gate.test.ts`

3. Initial full comparison
   - run no-memory, full-context, rules-only, and hybrid profiles
   - current 100K external-root run:
     `run-phase63-beam-100k-full-initial-20260518T000335Z`
   - prepared root: `/private/tmp/BEAM/100K.json`
   - preserve execution failures as structured rows
   - treat current oracle/evidence-contract metrics as adapter proof, not final
     BEAM answer-quality proof

4. BEAM-specific miss intake
   - group failures by noise/distractor selection, token budget pressure,
     scale-sensitive recall loss, stale/wrong recall, answer synthesis, and
     provider execution failure
   - current analysis:
     `reports/eval/research/phase-63/beam/run-phase63-beam-100k-full-initial-20260518T000335Z/miss-case-analysis.json`
   - current finding: the initial full report proves the adapter/evidence
     contract but not live GoodMemory ability; do not patch GoodMemory until a
     real recall/live failure family is clear

5. Generic GoodMemory repair loop
   - carry forward Phase 62 mechanisms instead of adding benchmark-specific
     routing
   - repair reusable retrieval, selection, compression, or synthesis behavior
   - rerun the same BEAM slice/full set to prove the delta
   - current diagnostic evidence:
     `run-phase63-beam-100k-recall-diagnostic-rules-full-20260518T005500Z`
     covers 400 real 100K cases with `executionFailures: 0`, evidence-chat
     recall 0.11625896794910878, missed-recall cases 340/355, and
     wrong-recall/noise cases 362/400
  - current live-slice evidence:
    `run-phase63-beam-100k-live-slice-rules-initial3-escalated-20260518T014500Z`
    covers 3 representative diagnostic misses with `executionFailures: 0`,
    answer accuracy 0/3, evidence-chat recall 0.16666666666666666, missed
    recall 3/3, and wrong-recall/noise 3/3
  - first generic source-preservation rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-source-order-chatid-current-20260518T040000Z`
    improves full rules-only evidence-chat recall to 0.2545638985427718 with
    `executionFailures: 0`, missed-recall cases 298/355, and wrong-recall/noise
    cases 388/400
  - paired live rerun:
    `run-phase63-beam-100k-live-slice-rules-source-order-chatid-current-initial3-escalated-20260518T040500Z`
    remains 0/3 with evidence-chat recall 0.27777777777777773 and
    `executionFailures: 0`
  - follow-up contradiction/source-order-companion rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-contradiction-companions-v2-20260518T080000Z`
    raises full rules-only evidence-chat recall to 0.26990036176655896 with
    `executionFailures: 0`, missed-recall cases 296/355, and
    wrong-recall/noise cases 387/400
  - paired same-three-case live rerun:
    `run-phase63-beam-100k-live-slice-rules-contradiction-companions-initial3-escalated-20260518T074500Z`
    improves evidence-chat recall to 0.7222222222222222 with
    `executionFailures: 0`, but answer accuracy remains 0/3
  - paired generic prompt-guidance rerun:
    `run-phase63-beam-100k-live-slice-rules-contradiction-companions-prompt-guidance-initial3-escalated-20260518T081500Z`
    keeps evidence-chat recall at 0.7222222222222222 and raises answer
    accuracy to 1/3 by fixing the contradiction case
  - third milestone/compression/source-order-context rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-milestone-compression-current-20260518T061100Z`
    reaches evidence-chat recall 0.2759374936487613 with
    `executionFailures: 0`, missed-recall cases 294/355, and
    wrong-recall/noise cases 387/400
  - latest same-three-case live rerun:
    `run-phase63-beam-100k-live-slice-rules-structured-order-context-prompt-v2-initial3-escalated-20260518T064500Z`
    reaches evidence-chat recall 1.0, missed-recall cases 0/3, and
    `executionFailures: 0`, but answer accuracy remains 1/3 because the two
    event-ordering answers still over-select noisy early/setup evidence
  - next active step: continue generic repair through source-order noise
    pruning and ordered evidence selection


Current Boundary
----------------

- Phase 62 LongMemEval accepted close evidence:
  `run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-retry-r1-merged-20260517T161058Z`
  with `goodmemory-hybrid` 454/500, evidence-session recall 0.9590, and
  `executionFailures: 0`.
- Phase 63 source intake, synthetic fixture, smoke adapter/report contract, and
  smoke gate are now in place. `bun run eval:phase-63` writes
  `run-phase63-beam-smoke-current` over three synthetic BEAM-shaped questions
  with all four profiles and `executionFailures: 0`; `bun run gate:phase-63`
  writes accepted local gate `run-20260518003000`.
- P63-T005 is complete for the first external-root BEAM 100K comparison. The
  local preparation command writes the Hugging Face rows API export to
  `/private/tmp/BEAM/100K.json`, and the accepted initial full run covers 400
  real BEAM questions with all four profiles and `executionFailures: 0`.
- P63-T006 initial analysis is complete with status
  `needs-live-retrieval-analysis`. P63-T007 is active; the real recall
  diagnostic and first live answer-generation/judge slice are now implemented.
  The source-preservation pass and follow-up contradiction /
  source-order-companion pass are implemented and rerun, and the latest
  milestone/compression/source-order-context pass now gives the representative
  three-case live slice complete evidence recall. They remain only partial:
  prompt guidance fixes the contradiction case, but event-ordering still misses
  under noisy retrieved source turns. The next executable boundary is generic
  source-order noise pruning plus ordered evidence selection on long imported
  conversations.
- Final/public reporting remains deferred until LongMemEval, BEAM,
  MemoryAgentBench, and LoCoMo are all complete.
