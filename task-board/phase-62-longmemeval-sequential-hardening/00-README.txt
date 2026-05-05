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
   - full repository regression passes after the repair; an unrelated concurrent
     `bun pm pack` release-test race is locked so package tarball noise does not
     mask LongMemEval regressions
   - broader question-type slices remain required after provider cooldown clears
   - latest local verification passes `bun run typecheck`, `bun test`, and
     `bun run gate:phase-62`; live 18-case execution is waiting on provider
     cooldown clearance
   - while answer generation is provider-blocked, `eval:phase-62-recall-diagnostic`
     provides a durable provider-free recall diagnostic for the fixed 18-case
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

4. Transition to BEAM
   - open the BEAM phase only after LongMemEval has a clear before/after delta
   - defer any public report until all four external benchmarks are complete


Artifacts
---------

- `01-miss-case-analysis.txt`
- `02-type-balanced-sampling.txt`
