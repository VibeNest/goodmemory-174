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
  - source-order context pruning rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-context-pruning-current-20260518T155045`
    keeps the current-code full rules-only recall surface recall-limited at
    evidence-chat recall 0.2731205922403106 with `executionFailures: 0`,
    missed-recall cases 295/355, and wrong-recall/noise cases 387/400
  - latest same-three-case live rerun:
    `run-phase63-beam-100k-live-slice-rules-context-ordered-pruning-v6-initial3-escalated-20260518T160743`
    reaches answer accuracy 3/3, evidence-chat recall 1.0, missed-recall cases
    0/3, wrong-recall/noise cases 2/3, and `executionFailures: 0`
  - source-summary coverage rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-source-summary-coverage16-current-20260518T180000`
    reaches full rules-only evidence-chat recall 0.2787997683068106 with
    `executionFailures: 0`, missed-recall cases 295/355, wrong-recall/noise
    cases 387/400, and summarization recall 0.08068883277216612
  - source-provenance instruction rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-source-provenance-instruction-append2-current-20260518T194500`
    reaches full rules-only evidence-chat recall 0.31746732922789267 with
    `executionFailures: 0`, missed-recall cases 282/355, wrong-recall/noise
    cases 390/400, and instruction-following recall 0.7333333333333333
  - instruction-applicability rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-source-provenance-instruction-applicability-v3-current-20260518T220000`
    reaches full rules-only evidence-chat recall 0.32561286913399595 with
    `executionFailures: 0`, missed-recall cases 280/355, wrong-recall/noise
    cases 389/400, and instruction-following recall 0.7583333333333333
  - temporal date-content boundary rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-temporal-date-content-boundary-rerun-current-20260519T001500`
    reaches full rules-only evidence-chat recall 0.3364892384610695 with
    `executionFailures: 0`, missed-recall cases 278/355, wrong-recall/noise
    cases 389/400, and temporal-reasoning recall 0.4875
  - source preference evidence rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-source-preference-v2-rerun-current-20260519T020000`
    reaches full rules-only evidence-chat recall 0.3629658760644676 with
    `executionFailures: 0`, missed-recall cases 270/355, wrong-recall/noise
    cases 390/400, and preference-following recall 0.3803418803418803
  - timeline planning evidence rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-timeline-planning-v3-current-20260519T041500`
    reaches full rules-only evidence-chat recall 0.37368575086884953 with
    `executionFailures: 0`, missed-recall cases 267/355, wrong-recall/noise
    cases 388/400, and Timeline Integration recall 0.5333333333333333
  - contradiction support evidence rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-contradiction-support-v2-current-20260519T070000`
    reaches full rules-only evidence-chat recall 0.4026215881145459 with
    `executionFailures: 0`, missed-recall cases 257/355, wrong-recall/noise
    cases 388/400, and contradiction-resolution recall 0.4841666666666667
  - summary contradiction-guard rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-summary-contradiction-guard-current-20260519T090000`
    reaches full rules-only evidence-chat recall 0.4034666585370811 with
    `executionFailures: 0`, missed-recall cases 257/355, and
    wrong-recall/noise cases 387/400
  - event-ordering challenge rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-event-order-challenge-current-20260519T093000`
    reaches full rules-only evidence-chat recall 0.40735666524398917 with
    `executionFailures: 0`, missed-recall cases 256/355,
    wrong-recall/noise cases 387/400, and event-ordering recall
    0.2180059523809524
  - summary learning/evolution narrow rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-summary-learning-evolution-narrow-current-20260519T160000`
    reaches full rules-only evidence-chat recall 0.4116411600918644 with
    `executionFailures: 0`, missed-recall cases 255/355, and
    wrong-recall/noise cases 387/400. It restores the post-refactor
    source-ordered summary drift and adds English/Chinese selector coverage
    for creative project timelines, concept-learning progression, and
    essay-performance goal/feedback evolution.
  - summary issue-resolution earliest rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-summary-issue-resolution-earliest-current-20260519T180000`
    reaches full rules-only evidence-chat recall 0.4117931833424793 with
    `executionFailures: 0`, missed-recall cases 255/355, and
    wrong-recall/noise cases 387/400. Broader issue-resolution variants were
    rejected after regressing full recall to 0.41126557323740437 and
    0.41023270938763906; the kept variant only preserves earliest explicit
    bug/error/fix/debug source-order chains for issue-summary queries.
  - declined financial opportunity aggregate rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-declined-financial-aggregate-current-20260519T193000`
    reaches full rules-only evidence-chat recall 0.41554905188708025 with
    `executionFailures: 0`, missed-recall cases 255/355, and
    wrong-recall/noise cases 387/400. The kept selector repair is narrow:
    declined raise/freelance/bonus amount comparisons now retrieve matching
    direct evidence while rejecting accepted-offer noise.
  - professional-profile/resume event-order rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-profile-resume-event-order-current-20260519T174704`
    reaches full rules-only evidence-chat recall 0.41767737739568733 with
    `executionFailures: 0`, missed-recall cases 254/355, and
    wrong-recall/noise cases 387/400. The kept selector repair is narrow:
    broad resume/profile/ATS/LinkedIn aspect timelines now prefer distinct
    user-source milestones while unrelated broad event-order timelines stay on
    the established selectors.
  - writing-progress summary rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-writing-progress-summary-current-20260520T033228Z`
    reaches full rules-only evidence-chat recall 0.4202438875678314 with
    `executionFailures: 0`, missed-recall cases 253/355, and
    wrong-recall/noise cases 387/400. The kept selector repair is narrow:
    broad writing-progress strategy summaries now preserve concrete
    user-source milestones with their adjacent assistant strategy replies
    before extra writing anchors consume the recall budget.
  - career/philosophy summary rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-career-philosophy-scoped-current-20260520T054505Z`
    reaches full rules-only evidence-chat recall 0.4233111802125888 with
    `executionFailures: 0`, missed-recall cases 252/355, and
    wrong-recall/noise cases 386/400. The kept selector repair is narrow:
    career/philosophy summary queries dedupe duplicate facts from the same
    source turn only inside that branch, then pair user decision/reflection
    milestones with adjacent assistant synthesis replies.
  - technical-challenge summary gated rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-technical-challenge-summary-gated-current-20260520T060654Z`
    reaches full rules-only evidence-chat recall 0.42556470133934937 with
    `executionFailures: 0`, missed-recall cases 251/355, and
    wrong-recall/noise cases 386/400. The kept selector repair is narrow:
    security/database challenge summary queries require summary intent,
    dedupe duplicate facts from the same source turn, and prioritize named
    challenge milestones such as password hashing, UNIQUE constraint failures,
    OperationalError handling, CSRF token errors, and Redis account lockout.
  - source-order value/metric scoped rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-source-order-value-metric-scoped-current-20260521T002541Z`
    reaches full rules-only evidence-chat recall 0.44935613682092573 with
    `executionFailures: 0`, missed-recall cases 244/355, and
    wrong-recall/noise cases 378/400. The kept selector repair is generic:
    source-ordered update evidence now handles exact time changes, duration
    questions, and percentage transition pairs from user source turns while
    leaving broad `how many` / cross-session amount comparisons on the
    aggregate and multi-hop selectors. The workbench delta versus the
    technical-challenge accepted run shows missed cases -7, wrong-recall -8,
    knowledge-update recall +0.0542 with noise -31, temporal-reasoning noise
    -36 with total hits/missing unchanged, event-ordering recall +0.033, and
    multi-session reasoning slightly positive instead of regressed. Validation:
    `bun test tests/unit/recall.selection.test.ts`,
    `bun test tests/unit/run-phase-63.beam-recall-diagnostic.test.ts`,
    `bun test tests/unit/analyze-phase-63-recall-diagnostic.test.ts`,
    `bun run typecheck`, the full diagnostic above, and its generated
    `recall-diagnostic-analysis.json`.
  - next active step: continue full-slice recall/noise hardening beyond
    the value/metric scoped repair, especially the remaining zero-recall
    summarization cases, event-ordering over-retrieval, and persistent-noise
    surface on long imported conversations.


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
  milestone/compression/source-order-context pass gives the representative
  three-case live slice complete evidence recall. The latest ordered-context
  pruning pass now fixes the same representative live trio at 3/3 answer
  accuracy, the source-summary coverage pass gives a narrow full-run recall
  lift, and the source-provenance instruction pass gives a larger
  instruction-following lift. The instruction-applicability pass now preserves
  that lift while slightly improving full-run recall and noise. The temporal
  date-content pass recovers date-in-content interval cases, the source
  preference pass gives a larger preference-following lift, and the timeline
  planning pass recovers most Timeline Integration cases. The contradiction
  support pass recovers a large share of contradiction-resolution evidence
  without keeping the intermediate Timeline regression, the summary
  contradiction-guard pass gives a small full-run lift, and the event-ordering
  challenge pass lifts full recall. The summary learning/evolution pass raises
  full recall to 0.4116411600918644, the summary issue-resolution earliest pass
  nudges it to 0.4117931833424793, the declined-financial aggregate
  pass raises it to 0.41554905188708025, and the professional-profile/resume
  event-order pass raises it to 0.41767737739568733. The writing-progress
  summary pass raises it to 0.4202438875678314, the career/philosophy scoped
  summary pass raises it to 0.4233111802125888, and the technical-challenge
  summary gated pass raises it to 0.42556470133934937. The latest
  source-order value/metric scoped pass raises it to 0.44935613682092573 with
  missed-recall cases 244/355 and wrong-recall/noise 378/400. This is still
  only partial Phase 63 progress: the full 100K provider-free recall diagnostic
  remains recall-limited and noisy. The next executable boundary is reducing
  remaining full-slice misses plus wrong-recall/noise on long imported
  conversations, especially summarization and event-ordering.
- Final/public reporting remains deferred until LongMemEval, BEAM,
  MemoryAgentBench, and LoCoMo are all complete.
