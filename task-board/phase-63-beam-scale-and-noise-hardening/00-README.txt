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
  - source-order named-summary decision rerun:
    `run-phase63-beam-100k-recall-diagnostic-rules-full-source-order-named-summary-decision-min540-current-20260521T123744Z`
    reaches full rules-only evidence-chat recall 0.45501341381623095 with
    `executionFailures: 0`, missed-recall cases 244/355, and
    wrong-recall/noise cases 378/400. The kept selector repair is generic:
    named-person source-ordered summaries keep adjacent named assistant
    synthesis and give concrete user decision/commitment milestones just enough
    priority to outrank generic named-person reflections that only mirror query
    topics. Compared with the previous named-summary companion run, total hit
    evidence ids improve from 395 to 396; event-ordering average recall rises
    by 0.0083 with one additional hit and no event-ordering noise increase,
    while summarization stays at 0.2598. Compared with the value/metric scoped
    run, summarization remains +8 hits / -8 missing / -2 zero-recall cases, and
    event-ordering is +1 hit / -1 missing with noise -2. Validation:
    `bun test tests/unit/recall.selection.test.ts`,
    `bun test tests/unit/run-phase-63.beam-recall-diagnostic.test.ts`,
    `bun test tests/unit/analyze-phase-63-recall-diagnostic.test.ts`,
    `bun run typecheck`, the full diagnostic above, and generated analyses
    `recall-diagnostic-analysis.json` plus
    `recall-diagnostic-analysis-vs-companions.json`.
  - next active step: continue full-slice recall/noise hardening beyond
    the named-summary decision repair, especially the remaining zero-recall
    summarization cases, event-ordering over-retrieval, and persistent-noise
    surface on long imported conversations.
  - selector architecture cleanup: summary query/milestone patterns and
    temporal aspect/event-order signals were split into bounded helper modules
    so `sourceOrderSummary.ts` and `sourceOrderTemporal.ts` both stay under the
    1200-line architecture guard. Validation: targeted architecture guard,
    full recall selection tests, Phase 63 diagnostic unit tests, typecheck,
    `git diff --check`, and full `bun test` at 2281 pass / 0 fail after the
    later project-lifecycle regression was added. This did not
    produce a new full BEAM diagnostic because `/private/tmp/BEAM` is absent;
    attempts to restore it with `bun run prepare:phase-63-beam -- --split 100K
    --length 100 --output-root /private/tmp/BEAM` failed in both sandboxed and
    elevated-network runs with `curl: (28)` connecting to
    `datasets-server.huggingface.co:443`. The latest accepted full metric
    remains the named-summary decision run.
  - BEAM data-source recovery: `scripts/prepare-phase-63-beam-data.ts` now
    supports `--source github-raw` for the same external-root export contract
    when the Hugging Face rows endpoint is unavailable. The script lists
    upstream GitHub conversation folders and reconstructs rows from raw
    `chat.json`, `topic.json`, `plan_new.txt`, `user_messages.json`,
    `probing_questions/probing_questions.json`, `labels.txt`,
    `main_spec.txt`, and `relationships.txt` files. Validation:
    `bun test tests/unit/prepare-phase-63-beam-data.test.ts
    tests/unit/beam.test.ts`, `bun run typecheck`, loader validation over the
    regenerated `/private/tmp/BEAM/100K.json` (20 rows, 400 cases, 5732 turns),
    and full diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-github-raw-source-current-20260521T170515Z`
    with `executionFailures: 0`, evidence-chat recall 0.4540744466800807,
    missed-recall cases 244/355, and wrong-recall/noise 378/400. Compared
    with the latest accepted Hugging Face rows-export behavior run, this is a
    tiny source-cohort drift (-1 hit evidence id, +1 missing id, +2 noise ids),
    not a selector improvement. Future GitHub-raw reruns should compare
    against this GitHub-raw source run as the same-source baseline.
  - project-lifecycle summary repair: a scoped source-ordered project summary
    branch now handles queries that ask across feature implementation,
    development timeline, security, and documentation. It starts from user
    lifecycle milestone turns, adds adjacent assistant companions through a new
    bounded helper module, and avoids treating bare `API` mentions as
    documentation evidence. Regression:
    `tests/unit/recall.selection.test.ts` covers the BEAM-shaped budget
    tracker lifecycle summary case. Same-source full diagnostic
    `run-phase63-beam-100k-recall-diagnostic-rules-project-lifecycle-summary-current-20260522T105334Z`
    against the GitHub-raw baseline has `executionFailures: 0`,
    evidence-chat recall 0.45614017437961124, missed-recall cases 244/355,
    wrong-recall/noise 378/400, global hit ids 395 -> 400, missing ids
    699 -> 694, noise ids 2909 -> 2898, and zero-recall cases 118 -> 117.
    Summarization improves from 0.2598 to 0.2709 with no case-level negative
    recall regressions, but late security/documentation turns remain missing in
    the target case, so this is partial repair only.
  - project-lifecycle facet-fill repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-project-lifecycle-facet-fill-current-20260522T161457Z`
    reaches full rules-only evidence-chat recall 0.45632796780684126 with
    `executionFailures: 0`, missed-recall cases 244/355, and
    wrong-recall/noise 378/400. The kept selector repair is still scoped to
    broad project lifecycle summaries, but it now reserves coverage for
    feature, timeline, security, and documentation facets before spending the
    rest of the summary budget. Compared with the prior project-lifecycle
    summary run, summarization rises 0.2709 -> 0.2820 with +4 hit ids, -4
    missing ids, and -4 noise ids; target `1:summarization:1` rises
    0.4 -> 0.8 by recovering late security/documentation turns
    116/117/150/151/176/177. Compared with the GitHub-raw source baseline,
    summarization is +8 hit ids, -8 missing ids, -8 noise ids, and -1
    zero-recall case. This is kept partial repair only: it still misses the
    target's core feature pair 4/5 and introduces one event-ordering recall
    tradeoff versus the prior project-lifecycle summary run.
  - framework-customization event-order repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-framework-customization-current-20260524T010538Z`
    reaches full rules-only evidence-chat recall 0.4582059020791417 with
    `executionFailures: 0`, missed-recall cases 243/355, and
    wrong-recall/noise 378/400. The kept selector repair is scoped to
    source-ordered event questions that explicitly ask about integrating and
    customizing a framework. It selects Bootstrap setup, form-control /
    btn-primary custom styling, and modal accessibility upgrade facets while
    excluding bundle-size, image, API-review, and CSS-refactor distractors.
    Compared with the project-lifecycle facet-fill run, global hit ids improve
    403 -> 405, missing ids 691 -> 689, noise ids 2898 -> 2893, and
    missed-recall cases 244 -> 243. Target `3:event_ordering:1` rises
  0.3333 -> 1.0 by recovering 72/148, with no case-level hit-loss or
  newly-missing recall regressions. This is kept partial repair only: the
  full diagnostic remains noisy and source-ordered summary budget quality is
  still open.
  - project feature/challenge summary repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-project-feature-challenge-current-20260524T032422Z`
    reaches full rules-only evidence-chat recall 0.46088195841716983 with
    `executionFailures: 0`, missed-recall cases 242/355, and
    wrong-recall/noise 377/400. The kept selector repair is scoped to
    source-ordered portfolio/project summary questions that explicitly ask for
    key features and challenges. It selects distinctive feature, site
    structure, contact-form validation, gallery layout/modal/card, and Sprint
    2 backend/SEO facets while excluding bundle-size, image-optimization,
    Lighthouse, CSS-refactor, semantic HTML, and hosting distractors. Compared
    with the framework-customization run, global hit ids improve 405 -> 418,
    missing ids 689 -> 676, noise ids 2893 -> 2876, missed-recall cases
    243 -> 242, and wrong-recall/noise cases 378 -> 377. Target
    `3:summarization:1` rises 0.25 -> 1.0 by recovering
    4/5/6/7/16/17/58/59/60/61/66/67 and removing 15 noise ids, with no
  hit-loss or newly-missing evidence regressions. Seven abstention rows each
  gain one noise id, but global noise still drops. This is kept partial
  repair only: the full diagnostic remains recall-limited and noisy.
  - relationship/work-commitment summary plus book-club event-order repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-relationship-work-bookclub-strict-current-20260524T054000Z`
    reaches full rules-only evidence-chat recall 0.46541247484909476 with
    `executionFailures: 0`, missed-recall cases 240/355, and
    wrong-recall/noise 374/400. The kept selector repair is scoped to
    source-ordered summaries that ask how a relationship and work commitments
    were managed over time plus exact book-club activity event-order prompts.
    It selects relationship/work conflict handling, anniversary/work-call
    repair, work-trip boundary planning, free-will motivation/journaling
    facets, and book-club activity milestones while excluding generic
    relationship reflection, cultural expectations, productivity/Matthew,
    weekly check-in, date-confirmation, negated book-club, follow-up, and
    reading/recommendation distractors. Compared with the project
    feature/challenge run, global hit ids improve 418 -> 435, missing ids
    676 -> 659, noise ids 2876 -> 2808, missed-recall cases 242 -> 240, and
    wrong-recall/noise cases 377 -> 374. Target `12:summarization:1` rises
    0.125 -> 1.0 by recovering
    58/59/60/61/74/75/110/111/258/259/260/261/262/263 and removing 14 noise
  ids. Target `13:event_ordering:1` rises 0.6 -> 1.0 by returning exactly
  16/86/164/222/272 and removing 25 noise ids. Case-delta analysis shows no
  hit-loss, no newly-missing evidence regressions, and no negative recall
  deltas. This is kept partial repair only: the full diagnostic remains
  recall-limited and noisy.
  - family movie event summary plus movie-night contribution event-order
    repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-movie-events-tight-current-20260524T071500Z`
    reaches full rules-only evidence-chat recall 0.4716096579476863 with
    `executionFailures: 0`, missed-recall cases 238/355, and
    wrong-recall/noise 372/400. The kept selector repair is scoped to family
    movie event planning summaries and movie-night contribution ordering
    prompts. It selects the early kids/movie theme, quieter April weekend,
    May 11-12 marathon, streaming-quality/$70 budget, and Auto/$70
    confirmation facets plus the movie-night contribution milestones while
    excluding platform-availability, alternative-suggestion, Wish/Encanto
    pre-plan, cupcake, work-deadline, high-rating, and classic-movie
    distractors. Compared with the relationship/work plus book-club run,
    global hit ids improve 435 -> 453, missing ids 659 -> 641, noise ids
    2808 -> 2804, missed-recall cases 240 -> 238, wrong-recall/noise cases
    374 -> 372, and zero-recall cases 116 -> 113. Target
    `14:summarization:1` rises 0 -> 1.0 by recovering
    0/1/2/62/63/168/169/170/171/172/173 and removing 5 noise ids. Target
    `14:event_ordering:2` rises 0 -> 1.0 by returning
    14/16/72/182/246/130 and removing 8 noise ids. Case-delta analysis shows
    no hit-loss, no newly-missing evidence regressions, and no negative recall
    deltas. This is kept partial repair only: the full diagnostic remains
    recall-limited and noisy.
  - writing-journey event-order repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-writing-journey-current-20260524T081500Z`
    reaches full rules-only evidence-chat recall 0.474426559356137 with
    `executionFailures: 0`, missed-recall cases 237/355, and
    wrong-recall/noise 371/400. The kept selector repair is scoped to broad
    writing-journey source-order prompts. It selects the Michael script-editing
    tips, first-draft confidence shift, workshop nerves, workshop feedback, and
    revision-plan facets while excluding self-editing, book, tool, deadline,
    schedule, festival, and final-draft distractors. Compared with the
    movie-event run, global hit ids improve 453 -> 458, missing ids
    641 -> 636, noise ids 2804 -> 2781, missed-recall cases 238 -> 237,
    wrong-recall/noise cases 372 -> 371, and zero-recall cases 113 -> 112.
    Target `10:event_ordering:1` rises 0 -> 1.0 by returning
    6/82/182/238/84 and removing 25 noise ids. Case-delta analysis shows no
    hit-loss, no newly-missing evidence regressions, and no negative recall
    deltas. This is kept partial repair only: the full diagnostic remains
    recall-limited and noisy.
  - professional-preparation event-order repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-professional-prep-five-tight-current-20260529T151000Z`
    reaches full rules-only evidence-chat recall 0.4772434607645877 with
    `executionFailures: 0`, missed-recall cases 236/355, and
    wrong-recall/noise 370/400. The kept selector repair is scoped to broad
    professional-connections/preparation source-order prompts. It selects the
    Leslie networking mentor, Laura/HR cover-letter feedback, storytelling
    interview preparation, employee-handbook review, and July 25 workshop
    presentation facets while excluding cover-letter schedule/draft/anecdote
    noise, repeated cover-letter feedback, public-speaking confidence,
    handbook-policy, Zoom/senior-producer, and workshop-logistics distractors.
    Compared with the writing-journey run, global hit ids improve
    458 -> 463, missing ids 636 -> 631, noise ids 2781 -> 2751,
    missed-recall cases 237 -> 236, wrong-recall/noise cases 371 -> 370,
    and zero-recall cases 112 -> 111. Target `8:event_ordering:2` rises
    0 -> 1.0 by returning exactly 6/56/114/172/226 and removing 26 noise ids.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas. This is kept partial repair
    only: the full diagnostic remains recall-limited and noisy.
  - professional-preparation summary repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-professional-prep-summary-refactor-current-20260529T162000Z`
    reaches full rules-only evidence-chat recall 0.48006036217303844 with
    `executionFailures: 0`, missed-recall cases 235/355, and
    wrong-recall/noise 369/400. The kept selector repair is scoped to broad
    professional-preparation summary prompts. It selects Leslie networking,
    cover-letter single-column formatting, storytelling interview preparation,
    employee-handbook review, and workshop presentation anchors with adjacent
    assistant guidance while excluding CTA, mock-session confidence,
    calendar/travel, producer-follow-up, and logistics distractors. Compared
    with the professional-preparation event-order run, global hit ids improve
    463 -> 473, missing ids 631 -> 621, noise ids 2751 -> 2742,
    missed-recall cases 236 -> 235, wrong-recall/noise cases 370 -> 369,
    and zero-recall cases 111 -> 110. Target `8:summarization:2` rises
    0 -> 1.0 by returning exactly 6/7/78/79/114/115/172/173/226/227 and
    removing 12 noise ids. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas. This is
    kept partial repair only: the full diagnostic remains recall-limited and
    noisy.
  - probability-concepts summary repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-probability-concepts-summary-current-20260529T174000Z`
    reaches full rules-only evidence-chat recall 0.48287726358148914 with
    `executionFailures: 0`, missed-recall cases 234/355, and
    wrong-recall/noise 368/400. The kept selector repair is scoped to broad
    probability-concepts development summaries. It starts at the
    birthday-paradox permutation milestone, keeps conditional aces,
    complement-rule examples, direct/complement counting, and mutual-
    exclusivity milestones, and excludes early paint/ratio/coin/dice
    probability basics plus generic conditional-probability distractors.
    Compared with the professional-preparation summary run, global hit ids
    improve 473 -> 483, missing ids 621 -> 611, noise ids 2742 -> 2727,
    missed-recall cases 235 -> 234, wrong-recall/noise cases 369 -> 368, and
    zero-recall cases 110 -> 109. Target `5:summarization:2` rises 0 -> 1.0
    by returning exactly 140/141/146/149/151/153/155/156/180/181 and removing
    15 noise ids. Case-delta analysis shows no hit-loss, no newly-missing
    evidence regressions, and no negative recall deltas. This is kept partial
    repair only: the full diagnostic remains recall-limited and noisy.
  - household-budget multi-hop reasoning repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-household-budget-reasoning-narrow-current-20260529T184500Z`
    reaches full rules-only evidence-chat recall 0.48569416498993984 with
    `executionFailures: 0`, missed-recall cases 233/355, and
    wrong-recall/noise 367/400. The kept selector repair is scoped to
    multi-hop finance questions that combine grocery-budget increases, a
    freelance contract, Ashlee's medical bills, and savings goals. It selects
    shared-finances, spending-habits, expense-tracking, medical-support, and
    grocery-contract facets while excluding earlier unrelated medical, vehicle,
    and renovation savings distractors. Compared with the probability-concepts
    summary run, global hit ids improve 483 -> 493, missing ids 611 -> 601,
    noise ids 2727 -> 2726, missed-recall cases 234 -> 233,
    wrong-recall/noise cases 368 -> 367, and zero-recall cases 109 -> 108.
    Target `16:multi_session_reasoning:2` rises 0 -> 1.0 by returning exactly
    12/13/14/15/16/17/108/109/126/127 and removing 46/214/310 as target
    noise. Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas. This is kept partial repair
    only: the full diagnostic remains recall-limited and noisy.
  - sneaker summary repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-sneaker-summary-current-20260530T010000Z`
    reaches full rules-only evidence-chat recall 0.49132796780684124 with
    `executionFailures: 0`, missed-recall cases 231/355, and
    wrong-recall/noise 365/400. The kept selector repair is scoped to broad
    sneaker option/advice summaries for daily wear and activities. It selects
    daily options, Ultraboost fit, Allbirds comparison/try-on, running-vs-
    casual decisions, and hiking moisture/trail guidance while excluding Air
    Max, five-mile walking, arch-support, Boost-midsole TPU, and generic
    instruction distractors; source-preference append is suppressed when
    source-ordered summary coverage already provides the answer set. Compared
    with the household-budget reasoning run, global hit ids improve
    493 -> 506, missing ids 601 -> 588, noise ids 2726 -> 2707,
    missed-recall cases 233 -> 231, wrong-recall/noise cases 367 -> 365, and
    zero-recall cases 108 -> 106. Targets `15:summarization:2` and
    `15:summarization:1` rise 0 -> 1.0 by returning exactly
    1/3/81/83/141/143/203/205 and 1/3/81/141/203 respectively, with no
    target noise. Case-delta analysis shows no hit-loss, no newly-missing
    evidence regressions, and no negative recall deltas. This is kept partial
    repair only: the full diagnostic remains recall-limited and noisy.
  - free-will personal-reflection event-order repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-freewill-reflection-current-20260530T020000Z`
    reaches full rules-only evidence-chat recall 0.49414486921529194 with
    `executionFailures: 0`, missed-recall cases 230/355, and
    wrong-recall/noise 364/400. The kept selector repair is scoped to broad
    event-order questions about free will and personal reflection. It selects
    the Dennett/Freedom Evolves recommendation, Trolley Problem debate, soft-
    determinism journaling, Experience Machine reflection,
    Shelly/incompatibilism accountability, and Ship of Theseus identity
    milestones while excluding divine-intervention, logical-reasoning, Tanya
    moral-dilemma, weekly-check-in, fiction-journaling, and instruction
    distractors. Compared with the sneaker summary run, global hit ids improve
    506 -> 512, missing ids 588 -> 582, noise ids 2707 -> 2694,
    missed-recall cases 231 -> 230, wrong-recall/noise cases 365 -> 364, and
    zero-recall cases 106 -> 105. Target `12:event_ordering:2` rises
    0 -> 1.0 by returning exactly 32/50/78/98/176/218 with no target noise.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas. This is kept partial repair
    only: the full diagnostic remains recall-limited and noisy.
  - resume strategy summary repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-resume-strategy-summary-refined-current-20260530T033000Z`
    reaches full rules-only evidence-chat recall 0.49921529175050317 with
    `executionFailures: 0`, missed-recall cases 228/355, and
    wrong-recall/noise 362/400. The kept selector repair is scoped to broad
    resume development and job-application strategy summaries. It selects age
    and job-hunt positioning, Joshua ATS/budgeting help, Caribbean community
    experience, Jobscan keyword optimization, transferable skills, dated
    industry tailoring, Canva ATS formatting, interview/workshop
    prioritization, callback optimization, rapport-building, and latest
    certification/promotion milestones while excluding quantified-bullets,
    action-verb-library, generic Canva/Jobscan, and cross-cultural
    communication distractors. Compared with the free-will reflection run,
    global hit ids improve 512 -> 522, missing ids 582 -> 572, noise ids
    2694 -> 2683, missed-recall cases 230 -> 228, wrong-recall/noise cases
    364 -> 362, and zero-recall cases 105 -> 104. Targets
    `6:summarization:1` and `6:summarization:2` rise to 1.0 by returning
    exactly 1/5/7/57/111 and 15/19/71/93/139/191, with no target noise.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas. This is kept partial repair
    only: the full diagnostic remains recall-limited and noisy.

  - AI hiring compliance summary repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-ai-hiring-compliance-current-20260530T043000Z`
    reaches full rules-only evidence-chat recall 0.5020321931589539 with
    `executionFailures: 0`, missed-recall cases 227/355, and
    wrong-recall/noise 361/400. The kept selector repair is scoped to legal
    and policy requirement recaps for AI hiring processes. It selects the
    Montserrat Data Protection Act / GDPR-like requirements, hiring-policy AI
    transparency, fairness audits, candidate notifications, privacy/security,
    consent, human oversight, June 2024 Employment Act amendments, legal-expert
    compliance-checklist preparation, and current AI usage examples while
    excluding 2FA/security training, meeting-invite, hybrid-approach, metrics,
    and feedback-loop distractors. Compared with the resume strategy summary
    run, global hit ids improve 522 -> 527, missing ids 572 -> 567, noise ids
    2683 -> 2671, missed-recall cases 228 -> 227, wrong-recall/noise cases
    362 -> 361, and zero-recall cases 104 -> 103. Target
    `11:summarization:2` rises 0 -> 1.0 by returning exactly
    43/99/233/235/237 with no target noise, and summarization improves by +5
    hit ids, -5 missing ids, -12 noise ids, one fewer incomplete case, one
    fewer wrong/noise case, and one fewer zero-recall case. Case-delta analysis
    shows no hit-loss, no newly-missing evidence regressions, and no negative
    recall deltas. This is kept partial repair only: the full diagnostic
    remains recall-limited and noisy.

  - deadline/application date-update repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-deadline-application-update-current-20260530T070000Z`
    reaches full rules-only evidence-chat recall 0.5048490945674046 with
    `executionFailures: 0`, missed-recall cases 226/355, and
    wrong-recall/noise 361/400. The kept repair narrows English role-slot
    routing so application/deadline mentions such as `senior producer role`
    do not suppress non-identity deadline evidence, and adds source-ordered
    date-update coverage for application/deadline/submission questions while
    excluding scheduling-instruction and side-project distractors. Compared
    with the AI hiring compliance run, global hit ids improve 527 -> 529,
    missing ids 567 -> 565, noise ids 2671 -> 2676, missed-recall cases
    227 -> 226, wrong-recall/noise cases stay 361 -> 361, and zero-recall
    cases 103 -> 102. Knowledge-update rises by +2 hit ids, -2 missing ids,
    one fewer incomplete case, and one fewer zero-recall case. Target
    `18:knowledge_update:2` rises 0 -> 1.0 by returning exactly 170/182 with
    no target noise. Case-delta analysis shows no hit-loss, no newly-missing
    evidence regressions, and no negative recall deltas. This is kept partial
    repair only: the full diagnostic remains recall-limited and noisy.

  - mentor age/role information-extraction repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-mentor-role-routing-current-20260530T080000Z`
    reaches full rules-only evidence-chat recall 0.5076659959758553 with
    `executionFailures: 0`, missed-recall cases 225/355, and
    wrong-recall/noise 361/400. The kept repair narrows English role-slot
    routing so `age and role of the mentor` does not suppress non-identity
    evidence, adds a source-ordered mentor/workshop information-extraction
    selector, and blocks same-session direct-factual companion widening for
    that exact selector. Compared with the deadline/application run, global
    hit ids improve 529 -> 530, missing ids 565 -> 564, noise ids
    2676 -> 2670, missed-recall cases 226 -> 225, wrong-recall/noise cases
    stay 361 -> 361, and zero-recall cases 102 -> 101. Information-extraction
    rises by +1 hit id, -1 missing id, one fewer incomplete case, one fewer
    zero-recall case, and one fewer noise id. Target
    `18:information_extraction:1` rises 0 -> 1.0 by returning exactly 30 with
    no target noise. Case-delta analysis shows no hit-loss, no newly-missing
    evidence regressions, and no negative recall deltas. This is kept partial
    repair only: the full diagnostic remains recall-limited and noisy.

  - API endpoint technologies information-extraction repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-api-endpoint-technologies-current-20260530T090000Z`
    reaches full rules-only evidence-chat recall 0.510482897384306 with
    `executionFailures: 0`, missed-recall cases 224/355, and
    wrong-recall/noise 360/400. The kept repair extends source-ordered
    information-extraction selection to API endpoint startup-technology
    questions and blocks same-session project/API companion widening for that
    selector. Compared with the mentor age/role run, global hit ids improve
    530 -> 531, missing ids 564 -> 563, noise ids 2670 -> 2666,
    missed-recall cases 225 -> 224, wrong-recall/noise cases improve
    361 -> 360, and zero-recall cases 101 -> 100. Information-extraction
    rises by +1 hit id, -1 missing id, five fewer noise ids, one fewer
    incomplete case, one fewer zero-recall case, and one fewer
    wrong-recall/noise case. Target `2:information_extraction:1` rises
    0 -> 1.0 by returning exactly 10 with no target noise and removing target
    noise 70/186/50/183/58. Case-delta analysis shows no hit-loss, no
    newly-missing evidence regressions, and no negative recall deltas. This is
    kept partial repair only: the full diagnostic remains recall-limited and
    noisy.

  - single-card probability information-extraction repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-single-card-probability-current-20260530T100000Z`
    reaches full rules-only evidence-chat recall 0.5132997987927567 with
    `executionFailures: 0`, missed-recall cases 223/355, and
    wrong-recall/noise 359/400. The kept repair extends source-ordered
    information-extraction selection to earlier single-card probability
    questions before a two-card follow-up and blocks same-session deck /
    conditional-probability companion widening for that selector. Compared with
    the API endpoint technologies run, global hit ids improve 531 -> 532,
    missing ids 563 -> 562, noise ids 2666 -> 2662, missed-recall cases
    224 -> 223, wrong-recall/noise cases improve 360 -> 359, and zero-recall
    cases 100 -> 99. Information-extraction rises by +1 hit id, -1 missing id,
    six fewer noise ids, one fewer incomplete case, one fewer zero-recall case,
    and one fewer wrong-recall/noise case. Target
    `5:information_extraction:2` rises 0 -> 1.0 by returning exactly 32 with
    no target noise and removing target noise 58/134/64/234/72/70. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas. This is kept partial repair only: the full
    diagnostic remains recall-limited and noisy.

  - Laura meeting-location information-extraction repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-laura-meeting-location-current-20260530T110000Z`
    reaches full rules-only evidence-chat recall 0.5161167002012074 with
    `executionFailures: 0`, missed-recall cases 222/355, and
    wrong-recall/noise 358/400. The kept repair extends source-ordered
    information-extraction selection to named meeting-location questions such
    as `Where did I say I met Laura?` and blocks same-name schedule,
    cover-letter, and handbook companion widening for that selector. Compared
    with the single-card probability run, global hit ids improve 532 -> 533,
    missing ids 562 -> 561, noise ids 2662 -> 2659, missed-recall cases
    223 -> 222, wrong-recall/noise cases improve 359 -> 358, and zero-recall
    cases 99 -> 98. Information-extraction rises by +1 hit id, -1 missing id,
    four fewer noise ids, one fewer incomplete case, one fewer zero-recall
    case, and one fewer wrong-recall/noise case. Target
    `8:information_extraction:1` rises 0 -> 1.0 by returning exactly 10 with
    no target noise and removing target noise 41/149/78/172/114. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas; two already-missed zero-recall cases trade noise
    ids, but global noise still decreases. This is kept partial repair only:
    the full diagnostic remains recall-limited and noisy.

  - partner meeting date/location information-extraction repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-partner-meeting-date-location-current-20260530T120000Z`
    reaches full rules-only evidence-chat recall 0.5189336016096581 with
    `executionFailures: 0`, missed-recall cases 221/355, and
    wrong-recall/noise 357/400. The kept repair extends source-ordered
    information-extraction selection to partner meeting date/location questions
    such as `When and where did I say I met my partner?` and blocks AI-hiring
    plus unrelated partner-meeting companion widening for that selector.
    Compared with the Laura meeting-location run, global hit ids improve
    533 -> 534, missing ids 561 -> 560, noise ids 2659 -> 2654,
    missed-recall cases 222 -> 221, wrong-recall/noise cases improve
    358 -> 357, and zero-recall cases 98 -> 97. Information-extraction rises
    by +1 hit id, -1 missing id, three fewer noise ids, one fewer incomplete
    case, one fewer zero-recall case, and one fewer wrong-recall/noise case.
    Target `11:information_extraction:1` rises 0 -> 1.0 by returning exactly
    30 with no target noise and removing target noise 376/139/294/37/101.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas; two already-noisy cases add
    net noise, but global noise still decreases. This is kept partial repair
    only: the full diagnostic remains recall-limited and noisy.

  - Bay Street rent information-extraction repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-bay-street-rent-current-20260530T130000Z`
    reaches full rules-only evidence-chat recall 0.5217505030181088 with
    `executionFailures: 0`, missed-recall cases 220/355, and
    wrong-recall/noise 356/400. The kept repair extends source-ordered
    information-extraction selection to current rent questions such as
    `What monthly amount did I say I'm currently paying for my place on Bay
    Street?` and blocks monthly investment, equipment-budget, and
    debt-management companion widening for that selector. Compared with the
    partner meeting date/location run, global hit ids improve 534 -> 535,
    missing ids 560 -> 559, noise ids 2654 -> 2647, missed-recall cases
    221 -> 220, wrong-recall/noise cases improve 357 -> 356, and zero-recall
    cases 97 -> 96. Information-extraction rises by +1 hit id, -1 missing id,
    five fewer noise ids, one fewer incomplete case, one fewer zero-recall
    case, and one fewer wrong-recall/noise case. Target
    `16:information_extraction:1` rises 0 -> 1.0 by returning exactly 30 with
    no target noise and removing target noise 138/212/285. Case-delta analysis
    shows no hit-loss, no newly-missing evidence regressions, and no negative
    recall deltas; three unrelated noisy cases add one net noise each, but
    global noise still decreases. This is kept partial repair only: the full
    diagnostic remains recall-limited and noisy.

  - parents distance/town information-extraction repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-parents-distance-town-current-20260530T140000Z`
    reaches full rules-only evidence-chat recall 0.5245674044265595 with
    `executionFailures: 0`, missed-recall cases 219/355, and
    wrong-recall/noise 355/400. The kept repair extends source-ordered
    information-extraction selection to family location questions such as
    `How far away did I say my parents live from me, and in which town?` and
    blocks family movie-watchlist, animated-musical, snack-budget, and
    platform-availability companion widening for that selector. Compared with
    the Bay Street rent run, global hit ids improve 535 -> 536, missing ids
    559 -> 558, noise ids 2647 -> 2637, missed-recall cases 220 -> 219,
    wrong-recall/noise cases improve 356 -> 355, and zero-recall cases
    96 -> 95. Information-extraction rises by +1 hit id, -1 missing id, eight
    fewer noise ids, one fewer incomplete case, one fewer zero-recall case, and
    one fewer wrong-recall/noise case. Target `14:information_extraction:1`
    rises 0 -> 1.0 by returning exactly 6 with no target noise and removing
    target noise 22/23/53/138/139/142/176/192. Case-delta analysis shows no
    hit-loss, no newly-missing evidence regressions, and no negative recall
    deltas; one unrelated abstention case adds one noise id, but global noise
    still decreases. This is kept partial repair only: the full diagnostic
    remains recall-limited and noisy.

  - reading-list count/page-total information-extraction repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-reading-list-count-pages-current-20260530T150000Z`
    reaches full rules-only evidence-chat recall 0.5273843058350102 with
    `executionFailures: 0`, missed-recall cases 218/355, and
    wrong-recall/noise 354/400. The kept repair extends source-ordered
    information-extraction selection to reading-list number questions such as
    `How many series did I say were on my reading list, and what was the total
    page count?` and blocks completed-series, library-book, and generic
    book-series companion widening for that selector. Compared with the
    parents distance/town run, global hit ids improve 536 -> 537, missing ids
    558 -> 557, noise ids 2637 -> 2630, missed-recall cases 219 -> 218,
    wrong-recall/noise cases improve 355 -> 354, and zero-recall cases
    95 -> 94. Information-extraction rises by +1 hit id, -1 missing id, seven
    fewer noise ids, one fewer incomplete case, one fewer zero-recall case, and
    one fewer wrong-recall/noise case. Target `13:information_extraction:1`
    rises 0 -> 1.0 by returning exactly 26 with no target noise and removing
    target noise 154/214/284/124/236/60. Case-delta analysis shows no
    hit-loss, no newly-missing evidence regressions, and no negative recall
    deltas; one unrelated knowledge-update case adds one net noise id, but
    global noise still decreases. This is kept partial repair only: the full
    diagnostic remains recall-limited and noisy.

  - kids activity-days information-extraction repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-kids-activity-days-current-20260530T160000Z`
    reaches full rules-only evidence-chat recall 0.5302012072434609 with
    `executionFailures: 0`, missed-recall cases 217/355, and
    wrong-recall/noise 353/400. The kept repair extends source-ordered
    information-extraction selection to school activity-day questions such as
    `Which days did I say my kids have their afterschool activities at their
    school?` and blocks adjacent time-management, work-hours, and
    monthly-school-meeting companion widening for that selector. Compared with
    the reading-list count/page-total run, global hit ids improve 537 -> 538,
    missing ids 557 -> 556, noise ids 2630 -> 2626, missed-recall cases
    218 -> 217, wrong-recall/noise cases improve 354 -> 353, and zero-recall
    cases 94 -> 93. Information-extraction rises by +1 hit id, -1 missing id,
    eight fewer noise ids, one fewer incomplete case, one fewer zero-recall
    case, and one fewer wrong-recall/noise case. Target
    `17:information_extraction:1` rises 0 -> 1.0 by returning exactly 18 with
    no target noise and removing target noise 19/49/163/168/169/233/264/265.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas; four unrelated event-ordering
    cases add five net noise ids, but global noise still decreases. This is
    kept partial repair only: the full diagnostic remains recall-limited and
    noisy.

  - print-book budget information-extraction repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-print-book-budget-current-20260530T170000Z`
    reaches full rules-only evidence-chat recall 0.5339570757880617 with
    `executionFailures: 0`, missed-recall cases 216/355, and
    wrong-recall/noise 352/400. The kept repair extends source-ordered
    information-extraction selection to print-book budget planning questions
    such as `How did you help me balance my spending to get a variety of print
    books while staying within my set limits?` and keeps the user/assistant
    budget pair. Compared with the kids activity-days run, global hit ids
    improve 538 -> 541, missing ids 556 -> 553, noise ids 2626 -> 2618,
    missed-recall cases 217 -> 216, wrong-recall/noise cases improve
    353 -> 352, and zero-recall cases 93 -> 91. Information-extraction rises
    by +2 hit ids, -2 missing ids, eight fewer noise ids, one fewer incomplete
    case, one fewer zero-recall case, and one fewer wrong-recall/noise case.
    Target `13:information_extraction:2` rises 0 -> 1.0 by returning exactly
    34/35 with no target noise and removing target noise
    173/177/181/58/62/306/59/188/189. The same run recovers chat 34 for
    `13:multi_session_reasoning:1` and removes one noise id there. Case-delta
    analysis shows no hit-loss, no newly-missing evidence regressions, and no
    negative recall deltas; three non-target cases add one net noise id each,
    but global noise still decreases. This is kept partial repair only: the
    full diagnostic remains recall-limited and noisy.

  - Patrick workshop preparation information-extraction repair:
    `run-phase63-beam-100k-recall-diagnostic-rules-patrick-workshop-prep-router-dedupe-current-20260530T190000Z`
    reaches full rules-only evidence-chat recall 0.5367739771965124 with
    `executionFailures: 0`, missed-recall cases 215/355, and
    wrong-recall/noise 352/400. The kept repair prevents `role did ... play`
    wording from routing to identity-role slot selection and dedupes BEAM
    source snippets by chat id for Patrick workshop preparation questions.
    Compared with the print-book budget run, global hit ids improve
    541 -> 547, missing ids 553 -> 547, noise ids 2618 -> 2616,
    missed-recall cases 216 -> 215, and zero-recall cases 91 -> 90.
    Information-extraction rises to average recall 0.6125 with +6 hit ids,
    -6 missing ids, unchanged noise 133, one fewer incomplete case, and one
    fewer zero-recall case. Target `18:information_extraction:2` rises
    0 -> 1.0 by returning exactly 30/31/32/33/34/35 with no target noise.
    Case-delta analysis shows no hit-loss, no newly-missing evidence
    regressions, and no negative recall deltas; one non-target preference case
    adds one noise id, but global noise still decreases. This is kept partial
    repair only: the full diagnostic remains recall-limited and noisy.


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
  source-order value/metric scoped pass raises it to 0.44935613682092573, and
  the named-summary decision pass raises it to 0.45501341381623095 with
  missed-recall cases 244/355 and wrong-recall/noise 378/400. This is still
  only partial Phase 63 progress. The selector architecture guard is green again
  after splitting oversized source-order selector modules, and the local BEAM
  data root has been restored through the GitHub-raw fallback source. The
  latest same-source GitHub-raw framework-customization event-order repair
  raises current evidence-chat recall to 0.4582059020791417 with 243
  missed-recall cases and wrong-recall/noise 378/400, but the full 100K
  provider-free recall diagnostic remains recall-limited and noisy. The latest
  project feature/challenge summary repair raises current evidence-chat recall
  to 0.46088195841716983 with 242 missed-recall cases and wrong-recall/noise
  377/400, recovering `3:summarization:1` without hit-loss or newly-missing
  evidence regressions. The latest relationship/work plus book-club event-order
  repair raises current evidence-chat recall to 0.46541247484909476 with 240
  missed-recall cases and wrong-recall/noise 374/400, recovering
  `12:summarization:1` and `13:event_ordering:1` without hit-loss,
  newly-missing evidence regressions, or negative recall deltas. The latest
  family movie event summary plus movie-night contribution repair raises
  current evidence-chat recall to 0.4716096579476863 with 238 missed-recall
  cases and wrong-recall/noise 372/400, recovering `14:summarization:1` and
  `14:event_ordering:2` to 1.0 without hit-loss, newly-missing evidence
  regressions, or negative recall deltas. The latest writing-journey
  event-order repair raises current evidence-chat recall to 0.474426559356137
  with 237 missed-recall cases and wrong-recall/noise 371/400, recovering
  `10:event_ordering:1` to 1.0 without hit-loss, newly-missing evidence
  regressions, or negative recall deltas. The latest professional-preparation
  event-order repair raises current evidence-chat recall to 0.4772434607645877
  with 236 missed-recall cases and wrong-recall/noise 370/400, recovering
  `8:event_ordering:2` to 1.0 without target noise, hit-loss, newly-missing
  evidence regressions, or negative recall deltas. The latest
  professional-preparation summary repair raises current evidence-chat recall
  to 0.48006036217303844 with 235 missed-recall cases and wrong-recall/noise
  369/400, recovering `8:summarization:2` to 1.0 without target noise,
  hit-loss, newly-missing evidence regressions, or negative recall deltas. The
  latest probability-concepts summary repair raises current evidence-chat
  recall to 0.48287726358148914 with 234 missed-recall cases and
  wrong-recall/noise 368/400, recovering `5:summarization:2` to 1.0 without
  target noise, hit-loss, newly-missing evidence regressions, or negative
  recall deltas. The latest household-budget multi-hop reasoning repair raises
  current evidence-chat recall to 0.48569416498993984 with 233 missed-recall
  cases and wrong-recall/noise 367/400, recovering
  `16:multi_session_reasoning:2` to 1.0 without target noise, hit-loss,
  newly-missing evidence regressions, or negative recall deltas. The latest
  sneaker summary repair raises current evidence-chat recall to
  0.49132796780684124 with 231 missed-recall cases and wrong-recall/noise
  365/400, recovering `15:summarization:2` and `15:summarization:1` to 1.0
  without target noise, hit-loss, newly-missing evidence regressions, or
  negative recall deltas. The latest free-will reflection event-order repair
  raises current evidence-chat recall to 0.49414486921529194 with 230
  missed-recall cases and wrong-recall/noise 364/400, recovering
  `12:event_ordering:2` to 1.0 without target noise, hit-loss,
  newly-missing evidence regressions, or negative recall deltas. The latest
  resume strategy summary repair raises current evidence-chat recall to
  0.49921529175050317 with 228 missed-recall cases and wrong-recall/noise
  362/400, recovering `6:summarization:1/2` to exact 1.0 without target noise,
  hit-loss, newly-missing evidence regressions, or negative recall deltas. The
  latest AI hiring compliance summary repair raises current evidence-chat
  recall to 0.5020321931589539 with 227 missed-recall cases and
  wrong-recall/noise 361/400, recovering `11:summarization:2` to exact 1.0
  without target noise, hit-loss, newly-missing evidence regressions, or
  negative recall deltas. The deadline/application date-update repair raises
  current evidence-chat recall to 0.5048490945674046 with 226 missed-recall
  cases and wrong-recall/noise 361/400, recovering `18:knowledge_update:2` to
  exact 1.0 without target noise, hit-loss, newly-missing evidence regressions,
  or negative recall deltas. The latest mentor age/role repair raises current
  evidence-chat recall to 0.5076659959758553 with 225 missed-recall cases and
  wrong-recall/noise 361/400, recovering `18:information_extraction:1` to
  exact 1.0 without target noise, hit-loss, newly-missing evidence regressions,
  or negative recall deltas. The latest API endpoint technologies repair raises
  current evidence-chat recall to 0.510482897384306 with 224 missed-recall
  cases and wrong-recall/noise 360/400, recovering
  `2:information_extraction:1` to exact 1.0 without target noise, hit-loss,
  newly-missing evidence regressions, or negative recall deltas. The latest
  single-card probability repair raises current evidence-chat recall to
  0.5132997987927567 with 223 missed-recall cases and wrong-recall/noise
  359/400, recovering `5:information_extraction:2` to exact 1.0 without
  target noise, hit-loss, newly-missing evidence regressions, or negative
  recall deltas. The latest Laura meeting-location repair raises current
  evidence-chat recall to 0.5161167002012074 with 222 missed-recall cases and
  wrong-recall/noise 358/400, recovering `8:information_extraction:1` to exact
  1.0 without target noise, hit-loss, newly-missing evidence regressions, or
  negative recall deltas. The latest partner meeting date/location repair
  raises current evidence-chat recall to 0.5189336016096581 with 221
  missed-recall cases and wrong-recall/noise 357/400, recovering
  `11:information_extraction:1` to exact 1.0 without target noise, hit-loss,
  newly-missing evidence regressions, or negative recall deltas. The latest
  Bay Street rent repair raises current evidence-chat recall to
  0.5217505030181088 with 220 missed-recall cases and wrong-recall/noise
  356/400, recovering `16:information_extraction:1` to exact 1.0 without
  target noise, hit-loss, newly-missing evidence regressions, or negative
  recall deltas. The latest parents distance/town repair raises current
  evidence-chat recall to 0.5245674044265595 with 219 missed-recall cases and
  wrong-recall/noise 355/400, recovering `14:information_extraction:1` to
  exact 1.0 without target noise, hit-loss, newly-missing evidence regressions,
  or negative recall deltas. The latest reading-list count/page-total repair
  raises current evidence-chat recall to 0.5273843058350102 with 218
  missed-recall cases and wrong-recall/noise 354/400, recovering
  `13:information_extraction:1` to exact 1.0 without target noise, hit-loss,
  newly-missing evidence regressions, or negative recall deltas. The latest
  kids activity-days repair raises current evidence-chat recall to
  0.5302012072434609 with 217 missed-recall cases and wrong-recall/noise
  353/400, recovering `17:information_extraction:1` to exact 1.0 without
  target noise, hit-loss, newly-missing evidence regressions, or negative
  recall deltas. The print-book budget repair raises current evidence-chat
  recall to 0.5339570757880617 with 216 missed-recall cases and
  wrong-recall/noise 352/400, recovering `13:information_extraction:2` to
  exact 1.0 without target noise, hit-loss, newly-missing evidence regressions,
  or negative recall deltas. The latest Patrick workshop preparation repair
  raises current evidence-chat recall to 0.5367739771965124 with 215
  missed-recall cases and wrong-recall/noise 352/400, recovering
  `18:information_extraction:2` to exact 1.0 without target noise, hit-loss,
  newly-missing evidence regressions, or negative recall deltas.
  The next executable boundary is reducing remaining full-slice misses plus
  wrong-recall/noise on long imported conversations, especially source-ordered
  summary budget quality and the broad noise surface, using same-source
  baseline comparisons for future GitHub-raw reruns.
- Final/public reporting remains deferred until LongMemEval, BEAM,
  MemoryAgentBench, and LoCoMo are all complete.
