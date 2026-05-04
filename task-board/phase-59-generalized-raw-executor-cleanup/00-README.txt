Phase 59 Breakdown: Generalized Raw Executor Cleanup
====================================================

Boundary
--------
This is an internal research/runtime phase. It does not add a public API,
public config flag, public durable memory kind, or README-facing benchmark
claim. Full-300 remains an internal research follow-up.

Reopen Status
-------------
Phase 59 is reopened after the post-gate five-shard Postgres-backed full-300
rerun missed the raw research target. The targeted gate remains accepted as a
regression floor. The later `phase59-reopen9` five-shard Postgres-backed rerun
met the reopened internal research target, so the Phase 59 research target is
closed again without turning full-300 into a release gate or public claim.

Implementation Checklist
------------------------
- [x] Add Phase 59 renamed and synthetic targeted fixtures.
- [x] Add Phase 59 deterministic and live-memory runner scripts.
- [x] Add a Phase 59 gate command and diagnostics entrypoint.
- [x] Replace Phase 58 surface literals with generic extraction for operation,
  protocol, filetype, path-root, and precondition contracts.
- [x] Generalize structured first-action recovery for argument order, reversed
  parameters, token wrappers, pipe paths, and query-like commands.
- [x] Strengthen symbolic/formula execution with grounded-rule guards.
- [x] Keep final leak suppression after text repair, fallback, and computed
  responses.
- [x] Re-run full-300 with five Postgres-backed shards and archive the internal
  follow-up summary.
- [x] Add cue-sufficiency diagnostics for no-candidate, insufficient-candidate,
  and sufficient-but-unenacted raw failures.
- [x] Add latent cue retrieval for correction-backed raw experiences while
  rejecting corrected traces with no cue overlap.
- [x] Bind host-action rule exemplars to compatible exact action exemplars when
  the selected raw evidence only states the rule.
- [ ] Add raw contract consolidation for trigger, inhibition, replacement,
  slots, source ids, and confidence.
- [ ] Add conflict-to-inhibition repair for correction-backed conflict pairs.
- [ ] Add selected-but-not-enacted post-checks that name the missing operation
  type.
- [ ] Run Phase 59 reopened ablation against Phase 58 and Phase 59-current on
  the same five-shard Postgres-backed setup.

The remaining unchecked items are useful hardening and ablation follow-ups, not
blockers for the reopened Phase 59 research target now that the measured
full-300 criteria have been met.
- [x] Run the `phase59-reopen9` five-shard Postgres-backed full-300 follow-up
  after exact-action wrapper, concise exact-answer repair, and priming
  fail-open reliability fixes.

Canonical Commands
------------------
- `bun run typecheck`
- `bun test tests/unit/eval.phase59.test.ts tests/unit/evolution.behavioral-policy.test.ts tests/unit/evolution.raw-behavioral-exemplars.test.ts tests/unit/implicitmembench-diagnostics.test.ts tests/unit/implicitmembench-research.test.ts tests/unit/run-phase-59.script.test.ts tests/unit/runtime-kit.test.ts`
- `bun run eval:phase-59`
- `bun run eval:phase-59-live-memory`
- `bun run eval:phase-59-diagnostics -- --report <report.json> --output <summary.json>`
- `bun run gate:phase-59`

Accepted Targeted Result
------------------------
- raw blocking: `58 / 60`
- distilled blocking: `60 / 60`
- execution failures: `0`
- explicit recall leaks: `0`
- raw diagnosis: selected-and-passed `58`, selected-but-not-enacted `2`,
  memory-miss `0`, support-conflict `0`, wrong-exemplar `0`,
  operator-failure `0`
- cue-sufficiency diagnosis: passed `58`, cue-disconnect `2`,
  no-candidate `0`, candidate-insufficient `0`, candidate-conflict `0`,
  wrong-exemplar `0`, executor-unsafe `0`, sufficient-not-enacted `0`,
  operator-failure `0`

Full-300 Follow-Up
------------------
Post-gate result:
- raw blocking: `88 / 200`
- distilled blocking: `151 / 200`
- raw blocking execution failures: `4`
- raw non-blocking execution failures: `5`
- raw explicit recall leaks: `1`
- distilled execution failures: `2`
- distilled explicit recall leaks: `0`

Reopened target remains research-only:
- raw blocking pass target: at least `115 / 200`
- distilled blocking pass target: at least `150 / 200`
- raw explicit recall leak target: `0`
- raw blocking execution failure target: `<= 2`

The follow-up should use the same five-shard Postgres-backed setup used for
Phase 49 full-300 GoodMemory research evals. It is not a release gate and must
not become a README-level public claim.

First reopened implementation attempt:
- shard runs:
  `run-phase49-postphase59-reopened-shard-01-20260504` through
  `run-phase49-postphase59-reopened-shard-05-20260504`
- raw blocking: `81 / 200`
- distilled blocking: `149 / 200`
- raw blocking execution failures: `0`
- raw explicit recall leaks: `0`
- distilled execution failures: `0`
- distilled explicit recall leaks: `0`
- cue-sufficiency diagnosis: passed `81`, no-candidate `116`,
  cue-disconnect `66`, candidate-conflict `25`, wrong-exemplar `8`,
  candidate-insufficient `2`, sufficient-not-enacted `2`, operator-failure `0`

This reopened attempt is not closure. It removes operator/leak noise but misses
the raw target and the distilled floor. The host-action rule-plus-example repair
landed after this run and needs a new full-300 rerun before it can be counted.

Second reopened implementation checkpoint:
- shard runs:
  `run-phase59-reopen9-shard-01-20260504` through
  `run-phase59-reopen9-shard-05-20260504`
- repo summary artifact:
  `reports/quality-gates/phase-59/run-20260504193000/phase-59-reopen9-full300-research-summary.json`
- local raw diagnosis artifact:
  `/tmp/phase59-reopen9-full300-final-raw-diagnostics-20260504.json`
- raw blocking: `115 / 200`
- distilled blocking: `153 / 200`
- raw blocking execution failures: `0`
- raw non-blocking execution failures: `93`
- raw explicit recall leaks: `0`
- distilled blocking execution failures: `0`
- distilled explicit recall leaks: `0`
- diagnosis: selected-and-passed `115`, memory-miss `21`,
  selected-but-not-enacted `36`, support-conflict `27`, wrong-exemplar `7`,
  hypothesis-missing `1`, operator-failure `93`
- cue-sufficiency diagnosis: passed `115`, no-candidate `21`,
  cue-disconnect `33`, candidate-conflict `27`, wrong-exemplar `7`,
  candidate-insufficient `1`, sufficient-not-enacted `3`,
  operator-failure `93`

This checkpoint meets the reopened research-only Phase 59 target. The
non-blocking operator failures are priming-lane timeouts after fail-open
classification; raw blocking execution failures are `0`.

Reopen Development Plan
-----------------------
1. Diagnosis first:
   - regenerate the raw diagnostics from the five shard reports
   - persist the diagnosis as a quality-gate side artifact, not a `/tmp`-only
     note
   - split `memory_miss` into no-candidate, insufficient-candidate, and
     cue-disconnect misses

2. Retrieval and consolidation:
   - derive role/consequence/failure-symptom cue keys from learning and
     interference text
   - consolidate repeated raw episodes into transient procedural contracts
   - keep contracts source-backed and internal

3. Execution:
   - route every selected contract into computed response, canonical first
     action, text-response plan, or explicit abstention
   - treat correction-backed conflict pairs as inhibition plus replacement
   - keep wrong-exemplar guards strict when formula/action families diverge

4. Verification:
   - add renamed synthetic tests for cue-disconnect retrieval and contract
     consolidation
   - keep Phase 59 targeted raw at least `58 / 60`
   - run full-300 five-shard Postgres-backed ablation before re-closing
