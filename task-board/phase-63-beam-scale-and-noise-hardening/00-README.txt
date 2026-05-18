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
     - `scripts/run-phase-63-eval.ts`
     - `scripts/run-phase-63-gate.ts`
     - `tests/unit/beam.test.ts`
     - `tests/unit/run-phase-63.script.test.ts`
     - `tests/unit/run-phase-63.gate.test.ts`

3. Initial full comparison
   - run no-memory, full-context, rules-only, and hybrid profiles
   - use low concurrency first and preserve execution failures as structured
     rows
   - prefer failed-row retry over rerunning clean shards if provider failures
     interrupt the run

4. BEAM-specific miss intake
   - group failures by noise/distractor selection, token budget pressure,
     scale-sensitive recall loss, stale/wrong recall, answer synthesis, and
     provider execution failure
   - do not patch GoodMemory until the failure family is clear

5. Generic GoodMemory repair loop
   - carry forward Phase 62 mechanisms instead of adding benchmark-specific
     routing
   - repair reusable retrieval, selection, compression, or synthesis behavior
   - rerun the same BEAM slice/full set to prove the delta


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
- P63-T005 is the next executable task: run the first external-root BEAM
  comparison. The current runner can consume JSON exports named
  `beam_100k.json` or `100K.json`; direct upstream Parquet ingestion or a
  documented conversion workflow still needs to be added before claiming a full
  BEAM comparison.
- Final/public reporting remains deferred until LongMemEval, BEAM,
  MemoryAgentBench, and LoCoMo are all complete.
