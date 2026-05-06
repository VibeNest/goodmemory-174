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
   - broader/full LongMemEval coverage remains required before BEAM unless it
     is explicitly deferred with rationale
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
  - Phase 62 remains open for broader/full LongMemEval coverage. Do not open
    BEAM from this board until the full-500 decision is recorded as either
    executed evidence or an explicit deferral with rationale.

4. Transition to BEAM
   - open the BEAM phase only after LongMemEval has a clear before/after delta
   - defer any public report until all four external benchmarks are complete


Artifacts
---------

- `01-miss-case-analysis.txt`
- `02-type-balanced-sampling.txt`
