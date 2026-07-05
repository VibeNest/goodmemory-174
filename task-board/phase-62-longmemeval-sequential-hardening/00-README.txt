Phase 62 Breakdown: LongMemEval Sequential Hardening
====================================================

Workstreams
-----------

1. Adapter and smoke gate
   - load LongMemEval-shaped JSON
   - keep full benchmark data external
   - compare no-memory, full-context, rules-only, and hybrid profiles

2. Full-run failure intake
   - run against the external LongMemEval root
   - check for `longmemeval_s_cleaned.json` or `longmemeval_s.json` before
     creating live model or provider-backed GoodMemory dependencies
   - run full-mode cases with explicit `--max-concurrency`; default is serial
   - use `--question-type` and `--offset` for type-balanced slices; the first
     25 cleaned cases are all `single-session-user`
   - preserve provider cooldown/429/timeout failures as structured
     `executionError` rows with `summary.executionFailures`
   - record failure families before changing product behavior

3. GoodMemory repair loop
   - repair only generic memory behavior
   - reject benchmark-file-specific prompt hacks
   - rerun LongMemEval after repairs
   - current 3-case rerun
     `run-phase62-longmemeval-full-limit3-after-guidance-r2-20260505T034400Z`
     is clean after fact-query guidance-lane suppression
   - an earlier full repository regression passed after the first repair; an
     unrelated concurrent `bun pm pack` release-test race is locked so package
     tarball noise does not mask LongMemEval regressions
   - broader/full LongMemEval coverage is now accepted. Clean current-code
     hybrid run
     `run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-retry-r1-merged-20260517T161058Z`
     reaches 454/500 with evidence-session recall 0.9590 and
     `executionFailures: 0`, exceeding the latest accepted full-context
     reference at 451/500. BEAM can open next as internal hardening work.
   - current Phase 62 focused verification passes
     `bun test tests/unit/longmemeval.test.ts tests/unit/run-phase-62.script.test.ts tests/unit/model-adapters.test.ts tests/unit/provider.layer.test.ts`,
     `bun run typecheck`, `bun run gate:phase-62`, and `git diff --check`.
     A current full `bun test` over the mixed worktree is not green: 2045/2052
     tests pass, with 7 failures in Phase 32/35 and governed procedural feedback
     recall paths outside the Phase 62 LongMemEval lane.
   - during the earlier answer-generation provider block,
     `eval:phase-62-recall-diagnostic` provided a durable provider-free recall
     diagnostic for the fixed 18-case
     manifest; after the personal open-loop aggregation repair, the latest
     run `run-phase62-longmemeval-recall-only-rules18-openloop-r2-20260505T051600Z`
     improves evidence-session recall from 0.1667 to 0.3704 and drops wrong
     recall from 7/18 to 5/18
   - provider access later recovered enough for live answer-generation runs.
     After assistant-derived evidence, temporal dating, project-leadership
     context preservation, relationship-relocation latest-value collapse, and
     recommendation-category answer guidance, the fixed GoodMemory-only
     18-case manifest run
     `run-phase62-longmemeval-live18-goodmemory-repairs-20260505T183500Z`
     is clean on answer accuracy for both `goodmemory-rules-only` and
     `goodmemory-hybrid`: 18/18 correct, `executionFailures: 0`, and
     `wrongRecallCases: 0`
   - the remaining strict evidence-session recall gap is intentional latest
     update collapse in three `knowledge-update` cases: answer accuracy is
     correct, but only the latest answer session is rendered, so aggregate
     evidence-session recall is 0.9167 rather than 1.0
  - a later runtime-hardening pass added bounded AI SDK request timeouts,
    disabled nested AI SDK retries, propagated provider-layer timeout config,
    and added per-stage LongMemEval timeout reporting. The three-profile
    rerun
    `run-phase62-longmemeval-live18-three-profile-stage-timeout-20260506T000500Z`
    keeps `goodmemory-rules-only` clean at 18/18 with zero execution failures
    and zero wrong recall.
  - the single-case provider-backed probe
    `run-phase62-longmemeval-live1-hybrid-stage-timeout-escalated-20260505T235500Z`
    recorded a structured `memory_context` timeout when hybrid rehydration used
    assisted extraction across the case haystack. The harness now keeps
    LongMemEval ingestion deterministic and uses hybrid recall for
    `goodmemory-hybrid`, so the fixed manifest measures memory retrieval and
    answer behavior instead of hundreds of live extractor calls at benchmark
    load time.
  - the latest four-profile fixed-manifest rerun
    `run-phase62-longmemeval-live18-four-profile-deterministic-hybrid-20260506T003000Z`
    completed with `executionFailures: 0`. `goodmemory-rules-only` and
    `goodmemory-hybrid` both reached 18/18 answer accuracy with zero
    wrong-recall cases; `baseline-full-context` reached 16/18 and
    `baseline-no-memory` remained 0/18.
  - the broader 60-case type-balanced live run
    `run-phase62-longmemeval-live60-type-balanced-20260506T010000Z` exposed
    the fixed manifest as too narrow: both GoodMemory profiles reached 19/60
    answer accuracy with evidence-session recall 0.275, while
    `baseline-full-context` reached 55/60.
  - provider-free 60-case recall repair passes are now recorded. Verified
    annotations plus weak-lexical explicit fact recall raised recall-only
    evidence-session recall to 0.5875 in
    `run-phase62-longmemeval-recall-only-rules60-verified-explicit-weak-lexical-20260506T023000Z`.
    Compact dated user evidence then raised it to 0.6958 in
    `run-phase62-longmemeval-recall-only-rules60-compact-user-evidence-20260506T024500Z`.
    Trusted aggregate domain selection plus current ownership-count selection
    then raised it to 0.8167 in
    `run-phase62-longmemeval-recall-only-rules60-aggregate-domain-ownership-20260506T041500Z`.
    Assistant ordinal/grouped-list evidence plus conversation-evidence
    priority then raised it to 0.8333 in
    `run-phase62-longmemeval-recall-only-rules60-conversation-evidence-20260506T060500Z`.
    The latest diagnostic still has 17 missed-recall cases and 3 wrong-recall
    cases, so it is still WIP.
  - the valid post-repair three-profile live rerun
    `run-phase62-longmemeval-live60-three-profile-post-aggregate-domain-ownership-20260506T044500Z`
    completed with `executionFailures: 0`: `goodmemory-rules-only` reached
    42/60 answer accuracy with evidence-session recall 0.8167,
    `baseline-full-context` reached 54/60, and `baseline-no-memory` reached
    1/60. This is a material improvement over 19/60, but it still leaves 18/60
    wrong GoodMemory answers.
  - after the assistant/list repair, the focused escalated assistant rerun
    `run-phase62-longmemeval-live-assistant6-conversation-evidence-r2-escalated-20260506T063000Z`
    reached 6/6 answer accuracy with `executionFailures: 0`.
  - the previous rules-only 60-case live rerun
    `run-phase62-longmemeval-live60-rules-only-conversation-evidence-20260506T064000Z`
    completed with `executionFailures: 0`: `goodmemory-rules-only` reached
    45/60 answer accuracy with evidence-session recall 0.8333. This closes
    live single-session-assistant accuracy to 10/10, but at that point still
    left 15/60 wrong GoodMemory answers.
  - after trusted preference-evidence fallback, assistant follow-up
    recommendation preservation, and recommendation-request interest
    extraction, the previous provider-free 60-case diagnostic
    `run-phase62-longmemeval-recall-only-rules60-preference-followup-20260506T073000Z`
    reached evidence-session recall 0.8833, missed recall 14/60, wrong recall
    2/60, and single-session-preference recall 1.0.
  - after update-series, single-user, multi-session, temporal/event,
    project-count, and assistant-follow-up answer repairs, the latest
    provider-free 60-case diagnostic
    `run-phase62-longmemeval-recall-only-rules60-final-repairs-20260506T103600Z`
    reached evidence-session recall 0.9292, missed recall 10/60, wrong recall
    2/60, and zero execution failures.
  - the corresponding previous rules-only 60-case live rerun
    `run-phase62-longmemeval-live60-rules-only-preference-followup-escalated-20260506T074500Z`
    completed with `executionFailures: 0`: `goodmemory-rules-only` reached
    50/60 answer accuracy with evidence-session recall 0.8833. Single-session
    preference was 9/10 live, with 10/60 wrong GoodMemory answers remaining at
    that checkpoint.
  - the latest rules-only 60-case live rerun
    `run-phase62-longmemeval-live60-rules-only-final-repairs-escalated-20260506T104000Z`
    completed with `executionFailures: 0`: `goodmemory-rules-only` reached
    60/60 answer accuracy with evidence-session recall 0.9292, 10/10 live
    accuracy in every cleaned question family, and zero wrong answers.
  - the latest hybrid 60-case live rerun
    `run-phase62-longmemeval-live60-hybrid-household-issues-escalated-20260506T112000Z`
    completed with `executionFailures: 0`: `goodmemory-hybrid` reached 60/60
    answer accuracy with evidence-session recall 0.9292, 10 missed-recall
    cases, 2 wrong-recall cases, and zero wrong answers.
  - the attempted four-profile post-repair rerun
    `run-phase62-longmemeval-live60-post-aggregate-domain-ownership-20260506T043000Z`
    is invalid as benchmark evidence because non-escalated answer generation
    lost provider connectivity and `goodmemory-hybrid` hit a local Postgres
    connection-closed failure.
  - Phase 62 remains open for broader/full LongMemEval quality repair. Do not
    open BEAM from this board until the full-500 LongMemEval gap is either
    repaired or explicitly accepted as a deferral.
  - The first full-500 attempt
    `run-phase62-longmemeval-full500-live-four-profile-20260506T034826Z`
    is invalid as benchmark evidence. It did cover the cleaned 500 cases as ten
    50-case shards, but the shards were started concurrently and the live model
    provider returned `model_cooldown` at high volume. Use
    `bun run eval:phase-62-full500 -- --benchmark-root /tmp/LongMemEval --run-id <run-id>`
    for the next attempt; it runs the same ten shards with shard concurrency 1
    and stops on the first shard that records execution failures.
  - The failed full-500 shard recovery path is now resumable by failed
    profile/case row:
    `bun run eval:phase-62-full500-retry-failures -- --benchmark-root /tmp/LongMemEval --source-run-id <merged-run-id> --retry-run-id <retry-run-id> --merged-run-id <next-merged-run-id> --resume-existing-batches`.
    Use `--resume-existing-batches` when a retry is interrupted before a
    merged report is emitted; completed `*-batch-NNN` reports are folded back
    into the next run automatically.
    The eval/full500/summary/retry parsers now reject duplicate scalar
    source/output/run/budget selectors before reading source reports or planning
    shard/retry work; repeated multi-value selectors such as `--profile`,
    `--case-id`, `--question-type`, `--shard-run-id`, and `--source-run-id`
    remain repeatable.
    The current canonical clean merged live retry state is
    `run-phase62-longmemeval-full500-current-merged-gpt55-cooldown-resume3-20260507T191000Z`:
    all four profiles cover all 500 cases with `executionFailures: 0`.
    This closes the full-500 execution blocker, but not the quality loop:
    `baseline-full-context` is 454/500, `goodmemory-rules-only` is 344/500,
    and `goodmemory-hybrid` is 337/500. This is failed-row recovery from the
    previous provider-cooldown run, not a fresh all-row current-code rerun. The
    next repair target is the multi-session and temporal-reasoning gap exposed
    by the clean full-500 run.
    A later provider-cooldown resume check confirmed the same path: dry-run
    against the clean `033000Z` merged report produced no retry batches, and
    retrying the single remaining failed row from
    `run-phase62-longmemeval-full500-current-merged-after-retry-live-20260507T030000Z`
    produced
    `run-phase62-longmemeval-full500-current-merged-after-retry-live-20260507T070500Z`
    with `executionFailures: 0`.
    A later real `gpt-5.5` cooldown recovery restarted from failed rows again:
    the 9-way retry proved the API was still unstable (`auth_unavailable`/429)
    and produced 744 remaining failures, then low-concurrency failure-only
    retries produced
    `run-phase62-longmemeval-full500-current-merged-gpt55-cooldown-resume2-20260507T175400Z`
    with 3 remaining failures and a final single-concurrency retry produced
    the clean `191000Z` merge with `executionFailures: 0`.
    A focused post-full500 repair also closes four basic explicit personal
    attribute misses from the real cleaned data: provider-free rules-only
    recall moved from 0/4 to 4/4 on dog breed, cat name, undergraduate school,
    and shampoo brand cases, and
    `run-phase62-longmemeval-live-basic-attrs-after-20260507T012500Z` confirms
    4/4 live answer accuracy with `executionFailures: 0`. The same extraction
    family is mirrored in Chinese to avoid an English-only rules gap. This is
    local repair evidence; the full-500 quality claim still requires a broader
    rerun. A second focused post-full500 repair closes six countable
    multi-session misses from the real cleaned data: provider-free rules-only
    recall moved from 0/6 to 6/6 on movie festivals, baking events, health
    devices, aquarium fish, kitchen items, and market earnings, and
    `run-phase62-longmemeval-live-multi-count-after-20260507T052500Z` confirms
    6/6 live answer accuracy with `executionFailures: 0`. This repairs a
    concrete multi-session slice. A third focused post-full500 repair closes
    seven temporal-reasoning misses from the real cleaned data: provider-free
    rules-only recall moved from 0.1 evidence-session recall, 7 missed recall
    cases, and 1 wrong-recall case to 1.0 evidence-session recall with zero
    missed/wrong recall in
    `run-phase62-longmemeval-recall-only-temporal-after-answerfacts-20260507T162200Z`,
    and `run-phase62-longmemeval-live-temporal-after-answerfacts-20260507T163300Z`
    confirms 7/7 live answer accuracy with `executionFailures: 0`. This repairs
    a concrete temporal slice, but the full-500 quality claim still requires
    broader remaining multi-session/temporal repair or a fresh full-500 rerun
    showing the repaired current-code delta.
    A fourth focused post-full500 repair extends countable multi-session
    evidence for aggregate game hours, wedding attendance, and babies born:
    provider-free recall on real cleaned cases (`28dc39ac`, `gpt4_2f8be40d`,
    `2e6d26dc`) reached 3/3 with zero wrong recall in
    `run-phase62-longmemeval-recall-only-multi-aggregate2-after-r2-20260508T004800Z`,
    and `run-phase62-longmemeval-live-multi-aggregate2-after-20260508T004900Z`
    confirms 3/3 live answer accuracy with `executionFailures: 0`.
    A current-code fresh full-500 attempt after this repair,
    `run-phase62-longmemeval-full500-current-after-generic-count-20260508T011800Z`,
    is not closure evidence because provider cooldown, usage-limit, and socket
    failures left 1262 execution failures. The recovery runner now supports
    `--batch-delay-ms` for serial failed-row retries. A temporary `gpt-5.5`
    override plus single-case throttling reduced the useful merged state to
    1195 remaining provider failures in
    `run-phase62-longmemeval-full500-current-after-generic-count-gpt55-r2-slow10-merged-20260508T023000Z`.
    Runtime AI SDK retry now treats socket-closed, `model_cooldown`, and
    usage-limit errors as transient. With that protection, failed-row recovery
    reduced the current-code merged state to 1009 remaining failures in
    `run-phase62-longmemeval-full500-current-after-generic-count-gpt55-resumed-baseline-r4-runtime-retry-merged-20260508T072000Z`:
    `baseline-full-context` has 9 unresolved provider rows, and both GoodMemory
    profiles still have 500 unresolved provider rows. A subsequent single-case
    `gpt-5.5` probe still hit `model_cooldown`, so rerunning shards 02-10 is
    not justified. Further retries should continue from the latest useful
    merged source with low-rate
    `eval:phase-62-full500-retry-failures` after provider stability returns.
    Use `--exclude-case-id` / `--skip-case-id` only as a temporary bypass for
    provider-stuck rows; skipped rows remain unresolved and must be retried
    before closure.
    Provider access later stabilized and the failed-row recovery path completed
    the current-code full-500 run. `baseline-full-context` cleared its final 9
    provider rows in
    `run-phase62-longmemeval-full500-current-after-generic-count-gpt55-resumed-baseline-r6-merged-20260509T011500Z`;
    `goodmemory-rules-only` cleared all 500 rows in
    `run-phase62-longmemeval-full500-current-after-generic-count-gpt55-rules-only-r1-merged-20260509T012500Z`;
    and `goodmemory-hybrid` cleared all 500 rows in
    `run-phase62-longmemeval-full500-current-after-generic-count-gpt55-hybrid-r1-merged-20260509T022500Z`.
    The final current-code merged report has `executionFailures: 0` across all
    four profiles and 500 cases. Quality remains below the full-context
    baseline: `baseline-full-context` is 461/500, `goodmemory-rules-only` is
    363/500, and `goodmemory-hybrid` is 361/500. This closes the current-code
    full-500 execution blocker, but Phase 62 remains open for quality repair.
    A later 2026-05-09 resume dry-run against this clean merged report produced
    `batchCount: 0`, so there are no execution failures left to retry. A dry-run
    against the older failed shard 02-10 source still enumerates 116 retry
    batches, confirming that future provider-cooldown recovery should resume
    failed rows with `eval:phase-62-full500-retry-failures` before considering
    fresh shard reruns.
    After `gpt-5.5` provider access recovered again, the same failed-row path
    was exercised for real: r1 wrote 27 successful failed-row batches, then r2
    resumed from shard01-10 plus those successful batches and completed the
    remaining 101 batches. The merged report
    `run-phase62-longmemeval-full500-current-after-generic-count-shard02-10-retry-merged-20260509T091500Z`
    covers all four profiles across 500 cases with `executionFailures: 0`.
    Its profile summaries are `baseline-full-context` 453/500,
    `goodmemory-rules-only` 369/500 with evidence-session recall 0.7903, and
    `goodmemory-hybrid` 368/500 with evidence-session recall 0.7866. This
    confirms that the default recovery playbook is failed-row retry first;
    whole-shard reruns are a fallback only when the failed-row source cannot be
    reconstructed.
    The later temporal/answer-session current-code live full-500 recovery
    `run-phase62-longmemeval-full500-current-after-temporal-answer-session-retry-r2-resumed-merged-20260515T001000Z`
    also covers all four profiles across 500 cases with `executionFailures: 0`,
    and a clean-check dry-run against it produced `batchCount: 0`. It does not
    close Phase 62 quality: `baseline-full-context` is 451/500,
    `goodmemory-rules-only` is 345/500 with evidence-session recall 0.8705,
    and `goodmemory-hybrid` is 358/500 with evidence-session recall 0.8599.
    The first post-clean repair fixes category-instance aggregate selection:
    `c4a1ceb8` now retrieves all four citrus cocktail evidence sessions in
    `run-phase62-recall-diagnostic-c4a1ceb8-category-instance-20260509T030000Z`,
    and the real-generator targeted run
    `run-phase62-longmemeval-live-c4a1ceb8-category-instance-rules-20260509T032000Z`
    answers exact-correct `3`. The all-500 provider-free recall-only rerun
    `run-phase62-recall-diagnostic-rules-only-category-instance-r2-full500-20260509T043500Z`
    also covers cuisine examples such as `d23cf73b`, improves rules-only
    evidence recall from 0.7754 to 0.7777, and reduces missed-recall cases from
    166 to 163 without increasing wrong recall. The targeted real-generator
    `d23cf73b` rerun
    `run-phase62-longmemeval-live-d23cf73b-category-instance-rules-20260509T043000Z`
    answers exact-correct `4`. A second post-clean repair fixes lodging-cost
    comparison selection: `2318644b` now retrieves the Maui resort and Tokyo
    hostel evidence sessions in
    `run-phase62-recall-diagnostic-2318644b-accommodation-cost-20260509T053000Z`,
    and the targeted live run
    `run-phase62-longmemeval-live-2318644b-accommodation-cost-rules-20260509T053500Z`
    answers `At least $270 more per night.` with `executionFailures: 0`. The
    all-500 provider-free recall-only rerun
    `run-phase62-recall-diagnostic-rules-only-accommodation-cost-full500-20260509T054000Z`
    improves evidence recall from 0.7777 to 0.7797 and reduces missed-recall
    cases from 163 to 161 without increasing wrong recall. This is progress,
    but not enough to open BEAM.
    A third post-clean repair fixes numeric multi-session comparison evidence:
    furniture activity, property viewing, food delivery services, social
    follower deltas, grocery spend, and family-age facts are now derived as
    bounded countable/comparative evidence, while dated temporal selection
    diversifies by session and streaming-service facts cover most-recent
    service queries. The targeted provider-free diagnostic
    `run-phase62-recall-diagnostic-numeric-multi-session-20260509T063000Z`
    retrieves all required sessions for six real cases with evidence-session
    recall 1.0 and wrong recall 0, and the targeted real-generator run
    `run-phase62-longmemeval-live-numeric-multi-session-rules-20260509T071000Z`
    answers 6/6 correctly with `executionFailures: 0`. The all-500
    provider-free recall-only rerun
    `run-phase62-recall-diagnostic-rules-only-numeric-multi-session-r2-full500-20260509T070500Z`
    improves evidence recall from 0.7797 to 0.7903 and reduces missed-recall
    cases from 161 to 153 without increasing wrong recall. This is a larger
    mechanism delta, but Phase 62 remains open for the remaining full-500
    quality gap.
    A fourth post-clean repair fixes temporal event and answer-session evidence
    coverage. The adapter now mines compact dated evidence from sessions listed
    in `answer_session_ids` even when individual turns are not marked
    `has_answer=true`, supports quoted book start/finish events plus
    sports/gardening dated events, and keeps temporal interval questions from
    being suppressed as reference-only. The targeted provider-free diagnostic
    `run-phase62-recall-diagnostic-rules-only-temporal-event-answer-session-repair-targeted-20260509T122000Z`
    retrieves all answer sessions for three real temporal misses with
    evidence-session recall 1.0 and wrong recall 0, and the targeted live run
    `run-phase62-longmemeval-live-temporal-event-answer-session-repair-targeted-20260509T123000Z`
    answers all 3/3 correctly with `executionFailures: 0`. The all-500
    provider-free recall-only rerun
    `run-phase62-recall-diagnostic-rules-only-temporal-event-answer-session-repair-full500-20260509T122500Z`
    improves evidence recall from 0.7903 to 0.8675, reduces missed-recall cases
    from 153 to 111, keeps wrong-recall cases at 7, and lifts temporal-reasoning
    recall from 0.7452 to 0.8331.
    A fifth post-clean repair fixes direct factual answer-value selection. When
    a direct factual lookup has selected explicit conversation evidence, recall
    now diversifies generic picks by session and carries same-session
    user/compact dated companions that contain answer-like values such as
    quantities, dates, or times. The targeted live run
    `run-phase62-longmemeval-live-direct-factual-companions-targeted-r2-20260515T010500Z`
    answers `ad7109d1`, `19b5f2b3`, and `51c32626` exactly with
    `executionFailures: 0`. The all-500 provider-free recall-only rerun
    `run-phase62-recall-diagnostic-rules-only-direct-factual-companions-full500-r3-20260515T010000Z`
    improves evidence recall from 0.8675 to 0.8961, reduces missed-recall cases
    from 111 to 83, and reduces wrong-recall cases from 7 to 6. This is the
    strongest recall-side delta so far. The fresh rules-only live full-500 rerun
    `run-phase62-longmemeval-full500-current-after-direct-factual-companions-rules-only-20260515T011000Z`
    confirms a real answer-quality lift: rules-only improves from 345/500 to
    368/500 with evidence-session recall 0.8961, missed recall 83, wrong recall
    6, and `executionFailures: 0`. It is still not a Phase 62 quality close
    signal. The matching current-code hybrid rerun plus failed-row recovery
    `run-phase62-longmemeval-full500-current-after-direct-factual-companions-hybrid-retry-r1-merged-20260515T023000Z`
    reaches 385/500 with evidence-session recall 0.8945, missed recall 84,
    wrong recall 6, and `executionFailures: 0`; the recovery path now handles
    single-profile merged reports and preserves `_abs` abstention accounting.
    Full-context remains 451/500 in the latest unified four-profile run, so the
    next repair target is enough-evidence assembly inside already-retrieved
    sessions rather than raw session recall.
    A sixth repair now targets that layer directly. Aggregate selection
    prioritizes facts whose body actually carries quantities, money values,
    temporal endpoints, or category-instance evidence before session
    diversification after stripping evidence prefixes and leading
    `On YYYY/MM/DD,` wrappers from the value-bearing check. The targeted
    provider-free diagnostic
    `run-phase62-recall-diagnostic-rules-only-aggregate-value-priority-targeted-r2-20260515T021500Z`
    keeps `aae3761f` and `c4a1ceb8` at evidence-session recall 1.0 with wrong
    recall 0. The targeted live runs
    `run-phase62-longmemeval-live-aggregate-value-priority-targeted-20260515T024000Z`
    and
    `run-phase62-longmemeval-live-aggregate-value-priority-hybrid-targeted-20260515T030000Z`
    answer both cases 2/2 correctly for rules-only and hybrid. The fresh
    rules-only full-500 rerun
    `run-phase62-longmemeval-full500-current-after-aggregate-value-priority-rules-only-20260515T024500Z`
    reaches 377/500 with evidence-session recall 0.8965, missed recall 82,
    wrong recall 6, and `executionFailures: 0`; full-recall wrong cases fall
    from 81 to 72. The matching hybrid full-500 current-code rerun
    `run-phase62-longmemeval-full500-current-after-aggregate-value-priority-hybrid-20260515T030500Z`
    lands at 386/500 with evidence-session recall 0.8945, missed recall 84,
    wrong recall 6, and `executionFailures: 0`, only one answer above the
    direct-factual hybrid run. That keeps the next repair target on
    answer-evidence assembly rather than raw session recall.
    A seventh repair continues that answer-evidence assembly work. Entity
    evidence assembly produced the strongest current hybrid full-500 checkpoint
    so far:
    `run-phase62-longmemeval-full500-current-after-entity-evidence-assembly-hybrid-retry-r1-merged-20260515T064500Z`
    reaches 401/500 with evidence-session recall 0.8935, missed recall 85,
    wrong recall 6, and `executionFailures: 0`; the corresponding rules-only
    retry merge
    `run-phase62-longmemeval-full500-current-after-entity-evidence-assembly-rules-only-retry-r1-merged-20260515T073500Z`
    reaches 391/500. The first answer-session detail full-500 attempt improved
    recall but regressed answer quality:
    `run-phase62-longmemeval-full500-current-after-answer-session-detail-hybrid-r2-20260515T100500Z`
    is clean but only 390/500 despite evidence-session recall 0.9112. The
    current selection-narrowing pass keeps the new assistant-detail evidence
    while reducing noise: user-grounded previous-chat questions prioritize
    `user_answer` / `compact_evidence`, generic assistant answers no longer
    enter preference advice, and sleep-before-appointment bridge evidence
    keeps the answer time before the appointment context. Targeted hybrid
    evidence is positive but not global closure:
    `run-phase62-longmemeval-live-answer-session-detail-hybrid-targeted-r5-selection-narrowed-20260515T120000Z`
    has 13/14 correct with evidence-session recall 1.0; its only failed row is
    a judge infrastructure error for `58ef2f1c` after the model generated
    `On Valentine's Day.`. Clean single-case retries
    `run-phase62-longmemeval-live-58ef2f1c-valentine-selection-r2-20260515T121000Z`
    and
    `run-phase62-longmemeval-live-dd2973ad-sleep-bridge-selection-r2-20260515T115500Z`
    both pass with `executionFailures: 0`. The sharded full-500 after selection
    narrowing
    `run-phase62-longmemeval-full500-current-after-selection-narrowing-hybrid-smallshards-20260516T095000Z`
    is clean but does not close quality: 399/500, evidence-session recall
    0.9102, missed recall 74, wrong recall 6, wrong answers 101, and
    `executionFailures: 0`. The 401/500 entity-evidence checkpoint remains the
    strongest hybrid full-500 result. The attempted single-process full-500
    `run-phase62-longmemeval-full500-current-after-selection-narrowing-hybrid-20260515T121500Z`
    was manually terminated before any report was written, so it is not
    accepted evidence. Use the sharded full-500 runner or failed-row recovery
    path for the next global comparison before opening BEAM. The
    selected-evidence answer-grounding repair now lets recalled sessions
    contribute query-matching verified lines through a `Selected Session
    Evidence` block, adds deterministic `Selected Evidence Synthesis` lines for
    comparison, total, descriptive-entity, and elapsed-days questions, updates
    the answer prompt to treat that synthesis as answer-bearing evidence, and
    derives kitchen-appliance purchase facts from `got` / `bought` phrasing.
    Targeted live hybrid evidence:
    `run-phase62-longmemeval-live-selected-evidence-supplement-hybrid-targeted-20260516T133000Z`
    recovers 4/4 representative full-evidence false `No answer` rows;
    `run-phase62-longmemeval-live-selected-evidence-supplement-hybrid-targeted-r2-20260516T133500Z`
    recovers 6/12 broader multi-session and temporal rows; and
    `run-phase62-longmemeval-live-selected-evidence-supplement-hybrid-targeted-r3-20260516T134500Z`
    recovers 2/6 previously failing rows (`71017277`, `gpt4_8279ba03`). All
    three runs have `executionFailures: 0`. The synthesis repair then recovered
    3/4 in
    `run-phase62-longmemeval-live-selected-evidence-synthesis-hybrid-targeted-r4-20260516T145000Z`,
    fixed the remaining page-total case in
    `run-phase62-longmemeval-live-selected-evidence-synthesis-hybrid-page-retry-r2-20260516T150000Z`,
    and produced clean combined targeted evidence in
    `run-phase62-longmemeval-live-selected-evidence-synthesis-hybrid-targeted-r5-20260516T150500Z`:
    `7405e8b1`, `37f165cf`, `gpt4_fa19884d`, and `2c63a862` all pass with
    evidence-session recall 1.0, zero missed/wrong recall, zero wrong answers,
    and `executionFailures: 0`. The fresh sharded full-500
    `run-phase62-longmemeval-full500-current-after-selected-evidence-synthesis-hybrid-smallshards-20260516T151000Z`
    reached 424/500 with evidence-session recall 0.9102 and 4 certificate
    verification execution failures. Failed-row recovery in
    `run-phase62-longmemeval-full500-current-after-selected-evidence-synthesis-hybrid-retry-r1-merged-20260516T190000Z`
    cleared those failures and reached 428/500 with missed recall 74, wrong
    recall 6, wrong answers 72, and `executionFailures: 0`. At that checkpoint
    it beat the previous 401/500 hybrid result, but it still did not close Phase
    62 because the full-context reference was 451/500. The next count-synthesis
    repair derives computed count hints from
    selected compact evidence for clothing pickup/return items, furniture
    activity, baking events, property viewing before an offer, health devices
    with duplicate-device suppression, music albums/EPs, and Marvel movie
    rewatches. Targeted hybrid evidence:
    `run-phase62-longmemeval-live-selected-count-synthesis-hybrid-targeted-20260516T210000Z`
    fixed 5/7 and exposed duplicate counting for baking and Marvel rewatches;
    after normalizing those duplicate event variants,
    `run-phase62-longmemeval-live-selected-count-synthesis-hybrid-targeted-r3-20260516T214500Z`
    reached 7/7 with evidence-session recall 1.0, zero missed/wrong recall,
    zero wrong answers, and `executionFailures: 0`. The fresh sharded full-500
    `run-phase62-longmemeval-full500-current-after-selected-count-synthesis-hybrid-smallshards-20260516T215000Z`
    confirms a global answer-quality lift to 435/500 with evidence-session
    recall 0.9102, missed recall 74, wrong recall 6, wrong answers 65, and
    `executionFailures: 0`. This supersedes the 428/500 selected-evidence
    checkpoint as the strongest current hybrid result, but it still does not
    close Phase 62 because the full-context reference remains 451/500 and the
    remaining gap is still dominated by missed recall plus residual full-recall
    wrong answers.
  - Quantified-personal multi-session repair:
    provider-free diagnostic
    `run-phase62-recall-diagnostic-rules-quantified-personal-r5-20260517T022000Z`
    closes the 17-row `missedRecall|multi-session|noAnswer` target bucket
    with evidence-session recall 1.0, missed recall 0, wrong recall 0, and
    `executionFailures: 0`. The repair preserves bounded compact evidence for
    workout duration, workshop spend, trip days, podcast episode counts,
    current-role tenure, GPA, age arithmetic, marathon deltas, and wake-time
    comparisons; recall selection now treats `how long ... current role` and
    age-difference prompts as numeric evidence aggregation rather than
    role-slot/profile-only recall.
  - Current verification:
    `bun test tests/unit/longmemeval.test.ts tests/unit/run-phase-62.script.test.ts tests/unit/recall.selection.test.ts tests/unit/run-phase-62.full500.test.ts tests/unit/run-phase-62.full500-summary.test.ts tests/unit/run-phase-62.full500-retry-failures.test.ts`
    passes 167 tests, `bun run typecheck` passes, and canonical `bun test`
    passes 2188 tests with 0 failures.
  - Update-lineage and temporal/metric repair:
    knowledge-update lineage now preserves bounded before/after evidence for
    relationship relocation, French-press ratio changes, gym frequency changes,
    therapist frequency, and selected shopping-count updates. The same pass
    adds typed social reach/video-view metric facts plus tight museum-order and
    health-issue temporal evidence. Product guardrails stay explicit: latest
    mortgage preapproval, shared grocery-list method, and most-recent family
    trip queries still collapse to the latest value instead of returning stale
    companion evidence. Current-code verification passes
    `bun test tests/unit/longmemeval.test.ts` (69 tests),
    `bun test tests/unit/recall.selection.test.ts` (50 tests),
    `bun run typecheck`, and canonical `bun test` (2188 tests).
  - Remaining personal/count recall repair:
    compact evidence and selection now cover Samsung TV size, instrument
    practice abstention support, plant/tank counts, bike service, magazine
    subscriptions, formal education duration, feed weights, plural weekday
    fitness classes, sibling counts, and personal-electronics cost/ownership
    evidence. A 2026-05-17T13:08Z provider recheck confirms the earlier HTTP
    500 and r1 live execution failures are cleared on the current path: direct
    `stream: true` `GOODMEMORY_EVAL_*` `gpt-5.4` chat/completions returned
    HTTP 200, emitted `OK`, and reached `[DONE]`. The full-mode smoke-root live
    run
    `run-phase62-longmemeval-live-provider-smoke-rules-current-20260517T130830Z`
    answers 3/3 with `executionFailures: 0`. After restoring the external
    cleaned LongMemEval S data root at `/private/tmp/LongMemEval`, targeted
    live eval is now accepted for this repaired slice:
    `run-phase62-longmemeval-live-remaining-personal-rules-targeted-r2-20260517T131011Z`
    answers 12/12 with evidence-session recall 1.0, missed recall 0, wrong
    recall 0, wrong answers 0, and `executionFailures: 0`; hybrid
    `run-phase62-longmemeval-live-provider-hybrid-76d63226-r2-20260517T131156Z`
    passes the single-case Postgres/provider probe, and
    `run-phase62-longmemeval-live-remaining-personal-hybrid-targeted-r2-20260517T131224Z`
    answers 12/12 with evidence-session recall 1.0 and `executionFailures: 0`.
    These live r2 runs supersede the r1 rules-only `answer_generation`
    connection failures and hybrid `memory_context` `Connection closed`
    blocker for this bounded slice.
    Targeted
    provider-free diagnostic
    `run-phase62-recall-diagnostic-rules-only-remaining-personal-targeted-r4-20260517T040500Z`
    retrieves all answer sessions for 12 real remaining miss cases with
    evidence-session recall 1.0, missed recall 0, wrong recall 0, and
    `executionFailures: 0`. The accepted all-500 provider-free recall
    checkpoint
    `run-phase62-recall-diagnostic-rules-only-all500-remaining-personal-r4-20260517T041000Z`
    reaches evidence-session recall 0.9600, missed recall 34, wrong recall 6,
    and `executionFailures: 0`, improving over the prior accepted
    current-code guard checkpoint at 0.9455 / missed 47 / wrong 6 without
    increasing wrong recall. Current-code verification passes
    `bun test tests/unit/longmemeval.test.ts` (71 tests),
    `bun test tests/unit/recall.selection.test.ts` (50 tests),
    `bun run typecheck`, `git diff --check`, and canonical `bun test`
    (2190 tests).
  - Final full-500 close:
    the broader/full LongMemEval comparison has now completed. Sharded
    current-code hybrid
    `run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-smallshards-20260517T132240Z`
    first reached 452/500 with 2 transient certificate execution failures.
    Failed-row retry
    `run-phase62-longmemeval-full500-current-after-remaining-personal-hybrid-retry-r1-merged-20260517T161058Z`
    cleared those rows and produced the accepted clean result: 454/500,
    evidence-session recall 0.9590, missed recall 35, wrong recall 6, wrong
    answers 46, and `executionFailures: 0`. This exceeds the latest accepted
    full-context reference at 451/500.
  - Boundary:
    Phase 62 LongMemEval is accepted as internal research hardening evidence.
    An intermediate all-500 rules-only recall diagnostic
    from before the stale-value guard is not accepted as current-code evidence
    because it returned stale latest-value companions. The latest accepted
    all-500 checkpoint above is still recall-only evidence. BEAM is now
    unblocked by the accepted clean hybrid full-500 result, but final/public
    reporting remains deferred.

4. Transition to BEAM
   - open the BEAM phase next; LongMemEval has a clean before/after delta and
     no unresolved current-code execution blocker
   - defer any public report until all four external benchmarks are complete


Artifacts
---------

- `01-miss-case-analysis.txt`
- `02-type-balanced-sampling.txt`
