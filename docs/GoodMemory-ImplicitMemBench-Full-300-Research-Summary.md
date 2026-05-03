# GoodMemory Full ImplicitMemBench 300-Case Research Summary

Initial run date: `2026-04-28`

Latest rerun update: `2026-05-04`

Status: internal research evidence only. This document does not reopen or
change the accepted Phase 49 claim, and it does not make full ImplicitMemBench
a release gate.

Phase 53 later closed on targeted deterministic/live behavioral evidence plus
a follow-up Postgres-backed full-300 rerun. That full-300 rerun remains
research evidence and does not make ImplicitMemBench a release gate.

## Scope

This document summarizes full 300-case ImplicitMemBench executions through
GoodMemory's Phase 49 research harness:

- the initial full run used to establish the first full-300 baseline versus
  GoodMemory comparison
- a post-Phase-51 GoodMemory rerun used to test whether typed behavioral
  memory and later conditioning/enactment improvements actually moved the
  full benchmark
- a post-Phase-52 GoodMemory rerun used to check whether structured
  text-response enactment extended the full-300 frontier
- a post-Phase-53 GoodMemory rerun used to check whether harder surface
  determinism, escalation routing, and exact command recovery moved the same
  benchmark without changing the release gate
- a post-Phase-54 GoodMemory rerun used to check whether exemplar-first raw
  carryover and the accepted raw-internalization slice improved the same full
  benchmark under the established sharded Postgres-backed setup
- a post-Phase-55 GoodMemory rerun used to check whether probe-conditioned raw
  carryover and retrieval calibration generalized beyond the targeted raw gate
  and moved the same benchmark under the same sharded Postgres-backed setup
- a post-Phase-56 GoodMemory rerun used to check whether hypothesis-carrying
  raw internalization finally moved the full-300 raw benchmark, not just the
  targeted gate

The goal was not to measure prompt-following alone. The comparison keeps the
upstream baseline and the GoodMemory-mediated path separate:

- `baseline-upstream-chat`
  - upstream-style prompt injection of learning, interference, and probe into
    one final generation
- `goodmemory-raw-experience`
  - replay learning and interference into GoodMemory, then give the final
    generator only `memoryContext + test_probe`
- `goodmemory-distilled-feedback`
  - same probe-only final generation, with explicit feedback distillation for
    procedural and conditioning cases

Priming remains paired `experimental/control` and is intentionally absent from
`goodmemory-distilled-feedback`.

## Run Setup

- Upstream benchmark checkout:
  - local external checkout at `/tmp/ImplicitMemBench`
- Total cases:
  - `300`
  - `100` `classical_conditioning`
  - `100` `procedural_memory`
  - `100` `priming`
- Scorer routing:
  - `35` `structured_first_action`
  - `165` `text_behavior_judge`
  - `100` `priming_pair_judge`
- Execution mode:
  - Phase 49 live research harness
  - 5 balanced shards of 60 cases each for the initial run
  - 5 balanced shards of mixed-family workload for the post-Phase-51 rerun
  - per-process `GOODMEMORY_EVAL_MAX_CONCURRENCY=1`
  - parallel shard execution across 5 Bun processes
  - GoodMemory storage forced to Postgres for sharded runs to avoid local
    SQLite lock contention
  - GoodMemory paths used provider-backed embeddings and assisted extraction
    through the configured `GOODMEMORY_EMBEDDING_*` and
    `GOODMEMORY_ASSISTED_EXTRACTOR_*` environment variables

Local shard outputs for the initial run were written under:

- `/tmp/phase49-sharded-pg/shard-01`
- `/tmp/phase49-sharded-pg/shard-02`
- `/tmp/phase49-sharded-pg/shard-03`
- `/tmp/phase49-sharded-pg/shard-04`
- `/tmp/phase49-sharded-pg/shard-05`

The post-Phase-51 rerun wrote GoodMemory shard reports under:

- `reports/eval/research/phase-49/goodmemory/run-phase49-full-shard-01-pg-20260501`
- `reports/eval/research/phase-49/goodmemory/run-phase49-full-shard-02-pg-20260501`
- `reports/eval/research/phase-49/goodmemory/run-phase49-full-shard-03-pg-20260501`
- `reports/eval/research/phase-49/goodmemory/run-phase49-full-shard-04-pg-20260501`
- `reports/eval/research/phase-49/goodmemory/run-phase49-full-shard-05-pg-20260501`

The post-Phase-53 rerun used 5 balanced local shard roots under
`/tmp/gm-phase53-shards-20260502/` and wrote GoodMemory shard reports under:

- `reports/eval/research/phase-49/goodmemory/run-phase49-full-postphase53-pg-20260502-r3-shard-01`
- `reports/eval/research/phase-49/goodmemory/run-phase49-full-postphase53-pg-20260502-r3-shard-02`
- `reports/eval/research/phase-49/goodmemory/run-phase49-full-postphase53-pg-20260502-r3-shard-03`
- `reports/eval/research/phase-49/goodmemory/run-phase49-full-postphase53-pg-20260502-r3-shard-04`
- `reports/eval/research/phase-49/goodmemory/run-phase49-full-postphase53-pg-20260502-r3-shard-05`

The post-Phase-54 rerun used 5 balanced local shard roots under
`/tmp/ImplicitMemBench-phase54-shards-20260503/` and wrote GoodMemory shard
reports under:

- `reports/eval/research/phase-49/goodmemory/run-phase49-postphase54-shard-01-20260503`
- `reports/eval/research/phase-49/goodmemory/run-phase49-postphase54-shard-02-20260503`
- `reports/eval/research/phase-49/goodmemory/run-phase49-postphase54-shard-03-20260503`
- `reports/eval/research/phase-49/goodmemory/run-phase49-postphase54-shard-04-20260503`
- `reports/eval/research/phase-49/goodmemory/run-phase49-postphase54-shard-05-20260503`

The post-Phase-55 rerun used 5 balanced local shard roots under
`/tmp/ImplicitMemBench-phase55-shards-20260503/` and wrote GoodMemory shard
reports under:

- `reports/eval/research/phase-49/goodmemory/run-phase49-postphase55-r1-shard-01-20260503`
- `reports/eval/research/phase-49/goodmemory/run-phase49-postphase55-r1-shard-02-20260503`
- `reports/eval/research/phase-49/goodmemory/run-phase49-postphase55-r1-shard-03-20260503`
- `reports/eval/research/phase-49/goodmemory/run-phase49-postphase55-r1-shard-04-20260503`
- `reports/eval/research/phase-49/goodmemory/run-phase49-postphase55-r1-shard-05-20260503`

The post-Phase-56 rerun used the established 5 balanced local shard roots under
`/tmp/ImplicitMemBench-phase54-shards-20260503/` and wrote GoodMemory shard
reports under:

- `reports/eval/research/phase-49/goodmemory/run-phase49-postphase56-shard-01-20260504`
- `reports/eval/research/phase-49/goodmemory/run-phase49-postphase56-shard-02-20260504`
- `reports/eval/research/phase-49/goodmemory/run-phase49-postphase56-shard-03-20260504`
- `reports/eval/research/phase-49/goodmemory/run-phase49-postphase56-shard-04-20260504`
- `reports/eval/research/phase-49/goodmemory/run-phase49-postphase56-shard-05-20260504`

These runs are intentionally not promoted to release-gate status. They remain
research evidence only.

## Topline Results

### Initial Full-300 Run (`2026-04-28`)

#### Blocking Cases

Blocking cases are `classical_conditioning + procedural_memory = 200` total.

| Profile | Passed | Total | Pass Rate |
| --- | ---: | ---: | ---: |
| `baseline-upstream-chat` | 108 | 200 | 54.0% |
| `goodmemory-raw-experience` | 42 | 200 | 21.0% |
| `goodmemory-distilled-feedback` | 77 | 200 | 38.5% |

#### By Dataset Family

| Dataset | Baseline | Raw | Distilled |
| --- | ---: | ---: | ---: |
| `classical_conditioning` | 55 / 100 | 32 / 100 | 54 / 100 |
| `procedural_memory` | 53 / 100 | 10 / 100 | 23 / 100 |

#### By Scorer Family

| Scorer | Baseline | Raw | Distilled |
| --- | ---: | ---: | ---: |
| `text_behavior_judge` | 106 / 165 | 42 / 165 | 74 / 165 |
| `structured_first_action` | 2 / 35 | 0 / 35 | 3 / 35 |

#### Priming

Priming is non-blocking and measured as average `primingInfluenceScore`.

| Profile | Average Score |
| --- | ---: |
| `baseline-upstream-chat` | 0.84 |
| `goodmemory-raw-experience` | 4.48 |

Observed `delta-of-delta`: `+3.64`

#### Execution Quality

- `executionFailures = 0`
- `explicitRecallLeakCount`
  - baseline: `10`
  - raw: `23`
  - distilled: `22`

### Post-Phase-51 GoodMemory Rerun (`2026-05-01`)

The rerun refreshed GoodMemory only. It did **not** rerun the upstream baseline,
so comparisons in this section are against the prior GoodMemory full run, not a
same-day baseline refresh.

#### Blocking Cases

| Profile | Passed | Total | Pass Rate |
| --- | ---: | ---: | ---: |
| `goodmemory-raw-experience` | 34 | 200 | 17.0% |
| `goodmemory-distilled-feedback` | 89 | 200 | 44.5% |

#### By Dataset Family

| Dataset | Raw | Distilled |
| --- | ---: | ---: |
| `classical_conditioning` | 25 / 100 | 64 / 100 |
| `procedural_memory` | 9 / 100 | 25 / 100 |

#### By Scorer Family

| Scorer | Raw | Distilled |
| --- | ---: | ---: |
| `text_behavior_judge` | 34 / 165 | 86 / 165 |
| `structured_first_action` | 0 / 35 | 3 / 35 |

#### Priming

| Profile | Average Score |
| --- | ---: |
| `goodmemory-raw-experience` | 2.86 |

#### Execution Quality

- `executionFailures`
  - raw: `18`
  - distilled: `8`
- `explicitRecallLeakCount`
  - raw: `2`
  - distilled: `0`

### Post-Phase-52 GoodMemory Rerun (`2026-05-02`)

This rerun again refreshed GoodMemory only. It used the same external
benchmark checkout shape, but explicitly ran with provider-backed Postgres
storage plus the configured embedding and assisted-extractor stack from the
repo `.env`.

#### Blocking Cases

| Profile | Passed | Total | Pass Rate |
| --- | ---: | ---: | ---: |
| `goodmemory-raw-experience` | 31 | 200 | 15.5% |
| `goodmemory-distilled-feedback` | 87 | 200 | 43.5% |

#### By Dataset Family

| Dataset | Raw | Distilled |
| --- | ---: | ---: |
| `classical_conditioning` | 24 / 100 | 63 / 100 |
| `procedural_memory` | 7 / 100 | 24 / 100 |

#### By Scorer Family

| Scorer | Raw | Distilled |
| --- | ---: | ---: |
| `text_behavior_judge` | 31 / 165 | 84 / 165 |
| `structured_first_action` | 0 / 35 | 3 / 35 |

#### Priming

| Profile | Average Score |
| --- | ---: |
| `goodmemory-raw-experience` | 2.3833 |

#### Execution Quality

- `executionFailures`
  - raw: `17`
  - distilled: `9`
- `explicitRecallLeakCount`
  - raw: `2`
  - distilled: `0`

### Post-Phase-53 GoodMemory Rerun (`2026-05-02`)

This rerun refreshed GoodMemory only. It was executed as 5 balanced shards with
`GOODMEMORY_STORAGE_PROVIDER=postgres`,
`GOODMEMORY_STORAGE_URL=$GOODMEMORY_TEST_POSTGRES_URL`, and per-process
`GOODMEMORY_EVAL_MAX_CONCURRENCY=1`.

#### Blocking Cases

| Profile | Passed | Total | Pass Rate |
| --- | ---: | ---: | ---: |
| `goodmemory-raw-experience` | 36 | 200 | 18.0% |
| `goodmemory-distilled-feedback` | 90 | 200 | 45.0% |

#### By Dataset Family

| Dataset | Raw | Distilled |
| --- | ---: | ---: |
| `classical_conditioning` | 28 / 100 | 62 / 100 |
| `procedural_memory` | 8 / 100 | 28 / 100 |

#### By Scorer Family

| Scorer | Raw | Distilled |
| --- | ---: | ---: |
| `text_behavior_judge` | 36 / 165 | 83 / 165 |
| `structured_first_action` | 0 / 35 | 7 / 35 |

#### Priming

| Profile | Average Score |
| --- | ---: |
| `goodmemory-raw-experience` | 3.3333 |

#### Execution Quality

- `executionFailures`
  - raw: `5`
  - distilled: `0`
- `explicitRecallLeakCount`
  - raw: `1`
  - distilled: `1`

### Post-Phase-53 Continued Hardening Rerun (`2026-05-02`, instance-grounded synthesis + structured scoring fix)

This rerun reflects the additional hardening landed after the earlier
post-Phase-53 snapshot:

- conditioning synthesis now prefers path-root recovery before file-extension
  fallback, so directory-restriction learning is not overwritten by `.tar` /
  `.bin` artifact noise
- contradictory safe-path warnings are rebuilt from the original unsafe query
  target instead of self-contradicting around the redirected path
- structured first-action cases now score against each instance's
  `expected_pattern` rather than a task-level static exemplar
- `copy_file` first-action recovery no longer gets confused by contractions
  such as `I'm` in the probe

It was again executed as explicit Postgres-backed balanced shards, with the
same embedding and assisted-extractor stack used by the live GoodMemory path.

#### Blocking Cases

| Profile | Passed | Total | Pass Rate |
| --- | ---: | ---: | ---: |
| `goodmemory-raw-experience` | 32 | 200 | 16.0% |
| `goodmemory-distilled-feedback` | 121 | 200 | 60.5% |

#### By Dataset Family

| Dataset | Raw | Distilled |
| --- | ---: | ---: |
| `classical_conditioning` | 23 / 100 | 87 / 100 |
| `procedural_memory` | 9 / 100 | 34 / 100 |

#### By Scorer Family

| Scorer | Raw | Distilled |
| --- | ---: | ---: |
| `text_behavior_judge` | 32 / 165 | 115 / 165 |
| `structured_first_action` | 0 / 35 | 6 / 35 |

#### Priming

| Profile | Average Score |
| --- | ---: |
| `goodmemory-raw-experience` | 3.12 |

#### Execution Quality

- `executionFailures`
  - raw: `4`
  - distilled: `0`
- `explicitRecallLeakCount`
  - raw: `2`
  - distilled: `0`

### Post-Phase-54 GoodMemory Rerun (`2026-05-03`, exemplar-first raw carryover + balanced shard rerun)

This rerun was executed after Phase 54 closed on targeted deterministic/live
evidence. It kept the established research execution strategy:

- 5 balanced mixed-family shards
- explicit Postgres-backed GoodMemory storage
- per-process concurrency `1`
- provider-backed embeddings and assisted extraction

It also kept the current full-benchmark contract honest by running the same
Phase 49 research harness rather than a benchmark-specific side path.

#### Blocking Cases

| Profile | Passed | Total | Pass Rate |
| --- | ---: | ---: | ---: |
| `goodmemory-raw-experience` | 42 | 200 | 21.0% |
| `goodmemory-distilled-feedback` | 151 | 200 | 75.5% |

#### By Dataset Family

| Dataset | Raw | Distilled |
| --- | ---: | ---: |
| `classical_conditioning` | 14 / 100 | 85 / 100 |
| `procedural_memory` | 28 / 100 | 66 / 100 |

#### By Scorer Family

| Scorer | Raw | Distilled |
| --- | ---: | ---: |
| `text_behavior_judge` | 37 / 165 | 130 / 165 |
| `structured_first_action` | 5 / 35 | 21 / 35 |

#### Priming

| Profile | Average Score |
| --- | ---: |
| `goodmemory-raw-experience` | 1.1263 |

#### Execution Quality

- `executionFailures`
  - raw: `19`
  - distilled: `3`
- `explicitRecallLeakCount`
  - raw: `3`
  - distilled: `0`

### Post-Phase-55 GoodMemory Rerun (`2026-05-03`, probe-conditioned raw carryover + retrieval calibration)

This rerun again refreshed GoodMemory only. It kept the same external benchmark
checkout shape and the same provider-backed research execution contract:

- 5 balanced mixed-family shards
- explicit Postgres-backed GoodMemory storage
- per-process concurrency `1`
- provider-backed embeddings and assisted extraction

The point of this rerun was not to celebrate the Phase 55 targeted gate. It was
to check whether the new raw carryover isolation and retrieval calibration would
survive the broader full-300 workload.

#### Blocking Cases

| Profile | Passed | Total | Pass Rate |
| --- | ---: | ---: | ---: |
| `goodmemory-raw-experience` | 35 | 200 | 17.5% |
| `goodmemory-distilled-feedback` | 148 | 200 | 74.0% |

#### By Dataset Family

| Dataset | Raw | Distilled |
| --- | ---: | ---: |
| `classical_conditioning` | 17 / 100 | 82 / 100 |
| `procedural_memory` | 18 / 100 | 66 / 100 |

#### By Scorer Family

| Scorer | Raw | Distilled |
| --- | ---: | ---: |
| `text_behavior_judge` | 34 / 165 | 126 / 165 |
| `structured_first_action` | 1 / 35 | 22 / 35 |

#### Priming

| Profile | Average Score |
| --- | ---: |
| `goodmemory-raw-experience` | 1.8065 |

#### Execution Quality

- `executionFailures`
  - raw: `8`
  - distilled: `1`
- `explicitRecallLeakCount`
  - raw: `4`
  - distilled: `2`

### Post-Phase-56 GoodMemory Rerun (`2026-05-04`, hypothesis-carrying raw internalization + Postgres 5-shard follow-up)

This rerun executed the required post-gate follow-up for Phase 56. It kept the
same external benchmark-root contract and the same provider-backed research
execution setup:

- 5 balanced mixed-family shards
- explicit Postgres-backed GoodMemory storage
- per-process concurrency `1`
- provider-backed embeddings and assisted extraction

The point was to check whether the new support/conflict retrieval, transient
task hypotheses, and probe-time raw execution generalized beyond the targeted
gate and into the full 300-case workload.

#### Blocking Cases

| Profile | Passed | Total | Pass Rate |
| --- | ---: | ---: | ---: |
| `goodmemory-raw-experience` | 45 | 200 | 22.5% |
| `goodmemory-distilled-feedback` | 152 | 200 | 76.0% |

#### By Dataset Family

| Dataset | Raw | Distilled |
| --- | ---: | ---: |
| `classical_conditioning` | 22 / 100 | 87 / 100 |
| `procedural_memory` | 23 / 100 | 65 / 100 |

#### By Scorer Family

| Scorer | Raw | Distilled |
| --- | ---: | ---: |
| `text_behavior_judge` | 37 / 165 | 131 / 165 |
| `structured_first_action` | 8 / 35 | 21 / 35 |

#### Priming

| Profile | Average Score |
| --- | ---: |
| `goodmemory-raw-experience` | 0.8352 |

#### Execution Quality

- `executionFailures`
  - raw: `15`
  - distilled: `4`
- `explicitRecallLeakCount`
  - raw: `1`
  - distilled: `0`

### Delta Versus The Initial GoodMemory Run

| Metric | Initial | Post-Phase-51 | Delta |
| --- | ---: | ---: | ---: |
| overall raw blocking pass rate | `21.0%` | `17.0%` | `-4.0 pts` |
| overall distilled blocking pass rate | `38.5%` | `44.5%` | `+6.0 pts` |
| conditioning distilled | `54 / 100` | `64 / 100` | `+10` |
| procedural distilled | `23 / 100` | `25 / 100` | `+2` |
| structured first-action distilled | `3 / 35` | `3 / 35` | `0` |
| raw explicit recall leaks | `23` | `2` | `-21` |
| distilled explicit recall leaks | `22` | `0` | `-22` |

### Delta Versus The Post-Phase-51 GoodMemory Rerun

| Metric | Post-Phase-51 | Post-Phase-52 | Delta |
| --- | ---: | ---: | ---: |
| overall raw blocking pass rate | `17.0%` | `15.5%` | `-1.5 pts` |
| overall distilled blocking pass rate | `44.5%` | `43.5%` | `-1.0 pts` |
| conditioning distilled | `64 / 100` | `63 / 100` | `-1` |
| procedural distilled | `25 / 100` | `24 / 100` | `-1` |
| structured first-action distilled | `3 / 35` | `3 / 35` | `0` |
| raw explicit recall leaks | `2` | `2` | `0` |
| distilled explicit recall leaks | `0` | `0` | `0` |

### Delta Versus The Post-Phase-52 GoodMemory Rerun

| Metric | Post-Phase-52 | Post-Phase-53 | Delta |
| --- | ---: | ---: | ---: |
| overall raw blocking pass rate | `15.5%` | `18.0%` | `+2.5 pts` |
| overall distilled blocking pass rate | `43.5%` | `45.0%` | `+1.5 pts` |
| conditioning distilled | `63 / 100` | `62 / 100` | `-1` |
| procedural distilled | `24 / 100` | `28 / 100` | `+4` |
| structured first-action distilled | `3 / 35` | `7 / 35` | `+4` |
| raw execution failures | `17` | `5` | `-12` |
| distilled execution failures | `9` | `0` | `-9` |
| raw explicit recall leaks | `2` | `1` | `-1` |
| distilled explicit recall leaks | `0` | `1` | `+1` |

### Delta Versus The Earlier Post-Phase-53 Snapshot

| Metric | Earlier Post-Phase-53 | Continued Hardening | Delta |
| --- | ---: | ---: | ---: |
| overall raw blocking pass rate | `18.0%` | `16.0%` | `-2.0 pts` |
| overall distilled blocking pass rate | `45.0%` | `60.5%` | `+15.5 pts` |
| conditioning distilled | `62 / 100` | `87 / 100` | `+25` |
| procedural distilled | `28 / 100` | `34 / 100` | `+6` |
| structured first-action distilled | `7 / 35` | `6 / 35` | `-1` |
| raw execution failures | `5` | `4` | `-1` |
| distilled execution failures | `0` | `0` | `0` |
| raw explicit recall leaks | `1` | `2` | `+1` |
| distilled explicit recall leaks | `1` | `0` | `-1` |

### Delta Versus The Post-Phase-53 Continued Hardening Rerun

| Metric | Continued Hardening | Post-Phase-54 | Delta |
| --- | ---: | ---: | ---: |
| overall raw blocking pass rate | `16.0%` | `21.0%` | `+5.0 pts` |
| overall distilled blocking pass rate | `60.5%` | `75.5%` | `+15.0 pts` |
| conditioning distilled | `87 / 100` | `85 / 100` | `-2` |
| procedural distilled | `34 / 100` | `66 / 100` | `+32` |
| structured first-action distilled | `6 / 35` | `21 / 35` | `+15` |
| raw execution failures | `4` | `19` | `+15` |
| distilled execution failures | `0` | `3` | `+3` |
| raw explicit recall leaks | `2` | `3` | `+1` |
| distilled explicit recall leaks | `0` | `0` | `0` |

### Delta Versus The Post-Phase-54 GoodMemory Rerun

| Metric | Post-Phase-54 | Post-Phase-55 | Delta |
| --- | ---: | ---: | ---: |
| overall raw blocking pass rate | `21.0%` | `17.5%` | `-3.5 pts` |
| overall distilled blocking pass rate | `75.5%` | `74.0%` | `-1.5 pts` |
| conditioning raw | `14 / 100` | `17 / 100` | `+3` |
| procedural raw | `28 / 100` | `18 / 100` | `-10` |
| conditioning distilled | `85 / 100` | `82 / 100` | `-3` |
| procedural distilled | `66 / 100` | `66 / 100` | `0` |
| structured first-action raw | `5 / 35` | `1 / 35` | `-4` |
| structured first-action distilled | `21 / 35` | `22 / 35` | `+1` |
| raw execution failures | `19` | `8` | `-11` |
| distilled execution failures | `3` | `1` | `-2` |
| raw explicit recall leaks | `3` | `4` | `+1` |
| distilled explicit recall leaks | `0` | `2` | `+2` |

### Delta Versus The Post-Phase-55 GoodMemory Rerun

| Metric | Post-Phase-55 | Post-Phase-56 | Delta |
| --- | ---: | ---: | ---: |
| overall raw blocking pass rate | `17.5%` | `22.5%` | `+5.0 pts` |
| overall distilled blocking pass rate | `74.0%` | `76.0%` | `+2.0 pts` |
| conditioning raw | `17 / 100` | `22 / 100` | `+5` |
| procedural raw | `18 / 100` | `23 / 100` | `+5` |
| conditioning distilled | `82 / 100` | `87 / 100` | `+5` |
| procedural distilled | `66 / 100` | `65 / 100` | `-1` |
| structured first-action raw | `1 / 35` | `8 / 35` | `+7` |
| structured first-action distilled | `22 / 35` | `21 / 35` | `-1` |
| raw execution failures | `8` | `15` | `+7` |
| distilled execution failures | `1` | `4` | `+3` |
| raw explicit recall leaks | `4` | `1` | `-3` |
| distilled explicit recall leaks | `2` | `0` | `-2` |

## What The Results Say

### 1. Raw experience replay is still weak, but Phase 56 finally moved the full-300 raw line again

The central result did not change: `goodmemory-raw-experience` remains far
below the upstream baseline. Phase 53 recovered part of the post-Phase-52 drop,
but raw replay is still not a reliable product mechanism by itself.

- baseline: `54.0%`
- initial raw: `21.0%`
- post-Phase-51 raw: `17.0%`
- post-Phase-52 raw: `15.5%`
- post-Phase-53 raw: `18.0%`
- post-Phase-53 continued hardening raw: `16.0%`
- post-Phase-54 raw: `21.0%`
- post-Phase-55 raw: `17.5%`
- post-Phase-56 raw: `22.5%`

This means the current GoodMemory stack does not yet turn most learning and
interference examples into reliable downstream behavior when the final probe is
probe-only. But unlike Phase 55, Phase 56 did improve the full-300 raw result:
it finally beat both the post-Phase-55 rerun and the earlier post-Phase-54
raw high-water mark. The gain is still modest, but it is no longer only a
targeted-slice effect.

### 2. Distillation remains the strongest path, and Phase 56 set a new full-300 high-water mark

`goodmemory-distilled-feedback` still carries the real value in the system.
The strongest family remains `classical_conditioning`, and this new rerun is
the first one where explicit policy distillation crossed a clear majority of
blocking cases on the full 300-item suite:

- baseline: `55 / 100`
- initial distilled: `54 / 100`
- post-Phase-51 distilled: `64 / 100`
- post-Phase-52 distilled: `63 / 100`
- post-Phase-53 distilled: `62 / 100`
- post-Phase-53 continued hardening distilled: `87 / 100`
- post-Phase-54 distilled: `85 / 100`
- post-Phase-55 distilled: `82 / 100`
- post-Phase-56 distilled: `87 / 100`

The same rerun also lifted `procedural_memory`, though that family is still
well below baseline:

- baseline: `53 / 100`
- initial distilled: `23 / 100`
- post-Phase-51 distilled: `25 / 100`
- post-Phase-52 distilled: `24 / 100`
- post-Phase-53 distilled: `28 / 100`
- post-Phase-53 continued hardening distilled: `34 / 100`
- post-Phase-54 distilled: `66 / 100`
- post-Phase-55 distilled: `66 / 100`
- post-Phase-56 distilled: `65 / 100`

So the value is still concentrated in explicit rule distillation for local
behavioral constraints, but the effect is now much broader. The post-Phase-54
rerun moved GoodMemory from the earlier `121 / 200` distilled high-water mark
to `151 / 200`, driven mostly by a large procedural jump rather than another
conditioning-only step. The post-Phase-55 rerun stayed strong at `148 / 200`
and improved operator reliability, but it did not surpass the post-Phase-54
high-water mark. Phase 56 finally pushed the distilled line to `152 / 200`,
setting a new best full-300 GoodMemory result. It is still research evidence,
not a release hard gate.

### 3. Strict first-action enactment is the weakest surface

The `structured_first_action` subgroup remains poor across all profiles:

- baseline: `2 / 35`
- initial raw: `0 / 35`
- initial distilled: `3 / 35`
- post-Phase-51 raw: `0 / 35`
- post-Phase-51 distilled: `3 / 35`
- post-Phase-52 distilled: `3 / 35`
- post-Phase-53 distilled: `7 / 35`
- post-Phase-53 continued hardening distilled: `6 / 35`
- post-Phase-54 distilled: `21 / 35`
- post-Phase-55 distilled: `22 / 35`
- post-Phase-56 raw: `8 / 35`
- post-Phase-56 distilled: `21 / 35`

The continued hardening rerun fixed a real scoring bug by switching procedural
structured cases to instance-level expected actions, and the post-Phase-54
rerun finally pushed this surface to `21 / 35`. Phase 55 nudged that to
`22 / 35`. Phase 56 kept the distilled line roughly flat, but it materially
improved raw strict-action carryover to `8 / 35`. That is still below where a
strong host-action memory layer should be, but it is no longer the near-zero
surface it was in earlier reruns.

### 4. Execution quality is mixed: raw operator noise rose again, but the leak surface is cleaner

The continued hardening rerun kept the distilled path at `executionFailures = 0`
and recovered the zero-leak distilled profile:

- post-Phase-51 raw/distilled leaks: `2 / 0`
- post-Phase-52 raw/distilled leaks: `2 / 0`
- post-Phase-53 raw/distilled leaks: `1 / 1`
- post-Phase-53 continued hardening raw/distilled leaks: `2 / 0`
- post-Phase-54 raw/distilled leaks: `3 / 0`
- post-Phase-55 raw/distilled leaks: `4 / 2`
- post-Phase-56 raw/distilled leaks: `1 / 0`
- post-Phase-53 raw/distilled execution failures: `5 / 0`
- post-Phase-53 continued hardening raw/distilled execution failures: `4 / 0`
- post-Phase-54 raw/distilled execution failures: `19 / 3`
- post-Phase-55 raw/distilled execution failures: `8 / 1`
- post-Phase-56 raw/distilled execution failures: `15 / 4`

The useful product-quality movement is still real, but the operator story is
not monotonic. Phase 55 cleaned up the harness substantially. Phase 56 gave
back some of that execution stability, but it also removed the distilled leak
regression and sharply reduced raw explicit-recall leakage. So the full-300
win is real, but it did not come with cleaner runtime behavior across every
dimension.

### 5. The biggest remaining misses are still structural

The continued hardening rerun removed `conditioned_directory_restriction` from
the top failure list entirely, but the main structural misses are still these:

1. broader procedural exactness is still weak:
   `session_key_prefix_rule`, `reversed_parameter_protocol`,
   `the_eccentric_api_call`, `the_scribe_s_signature`, and
   `character_voice_consistency` stayed at or near zero
2. bounded style/voice procedural transfer is still fragile:
   `character_voice_consistency` remains `0 / 7`
3. symbolic generalization is still underfit:
   `the_modified_recurrence_sequence` and `the_omega_operation` remain at
   `1 / 7` and `1 / 6`
4. some conditioning families are improved but not yet solved:
   `conditioned_jargon_avoidance` is `8 / 10`, `tool_use_with_side_effects`
   is `7 / 10`, and `emotion_driven_strategy_shift` is `5 / 10`

### 6. The research harness still needs better operator ergonomics

The post-Phase-51 rerun carried more transport/time-budget failures:

- raw execution failures: `0 -> 18`
- distilled execution failures: `0 -> 8`

The post-Phase-52 rerun stayed noisy:

- raw execution failures: `17`
- distilled execution failures: `9`

The post-Phase-53 sharded Postgres run improved this:

- raw execution failures: `5`
- distilled execution failures: `0`

The continued hardening rerun improved the raw side slightly again while
keeping the distilled path clean:

- raw execution failures: `4`
- distilled execution failures: `0`

Those failures do not invalidate the behavioral trend, but they do mean the
Phase 49 live research harness still needs stronger retry/checkpoint/failure
accounting if full-300 runs are going to be a reliable operator workflow.

## Where GoodMemory Actually Helped

Across the GoodMemory full runs, the strongest evidence is still on
local, constraint-shaped behavior.

The most reliable wins in the continued hardening rerun are:

- `conditioned_protocol_preference.json`
  - continued hardening distilled `9 / 10`
- `context_dependent_api_behavior.json`
  - continued hardening distilled `10 / 10`
- `conditioned_api_aversion.json`
  - continued hardening distilled `9 / 10`
- `conditioned_brevity.json`
  - continued hardening distilled `10 / 10`
- `conditioned_directory_restriction.json`
  - continued hardening distilled `10 / 10`
- `tool_use_with_side_effects.json`
  - continued hardening distilled `7 / 10`
- `the_forbidden_square.json`
  - continued hardening distilled `6 / 6`
- `the_ternary_logic_system.json`
  - continued hardening distilled `6 / 6`

These wins are still consistent with the system being better at local
avoidance/preference or bounded symbolic-rule tasks than at broader procedural
transfer.

## Main Failure Modes

### 1. Instance collapse inside procedural distillation

Several procedural families are currently over-distilled into one remembered
answer or one narrow exemplar, instead of a transferable rule.

Representative failures:

- `the_modified_recurrence_sequence.json`
  - distilled memory kept pushing one remembered value such as `P(2)=10`
  - later probes in the same family expected different outputs like `13`, `29`,
    or `61`
- `the_omega_operation.json`
  - remembered one example like `2 ⊗ 3 = 31`
  - failed to derive or transfer the broader operation rule across other probes

This is not a benchmark-only issue. It indicates that the current memory
compiler is too willing to compress procedural learning into exemplar facts
instead of typed rule structure.

### 2. Exact-format procedural templates are not retained tightly enough

Some procedural families require exact openings, subject prefixes, or closings.
The current distilled path often retains the rough pattern but misses the exact
contract.

Representative failures:

- `the_scribe_s_signature.json`
  - baseline `6 / 7`
  - continued hardening distilled `3 / 7`
- `corporate_etiquette_mandate.json`
  - baseline `4 / 6`
  - continued hardening distilled `5 / 6`

Typical error shape:

- memory preserved "there should be a subject, greeting, and sign-off"
- final behavior missed the exact required prefix or closing form

### 3. Hard text constraints are still too soft

The post-Phase-53 rerun confirmed that several conditioning families still
need harder enforcement instead of structured-but-soft control.

Representative remaining failures:

- `conditioned_jargon_avoidance.json`
  - continued hardening distilled `8 / 10`
  - the answer is much better than before, but some probes still leak the
    forbidden technical term while attempting the right analogy shape
- `tool_use_with_side_effects.json`
  - continued hardening distilled `7 / 10`
  - the answer often picked the safer tool or safer reset but still omitted a
    required warning or backup step
- `conditioned_api_distrust.json`
  - continued hardening distilled `9 / 10`
  - the remaining misses are rarer now, but the unresolved cases still show
    incomplete escalation to the specialist route

This points to a remaining gap: typed policy needs stronger hard-constraint
response planning, not just improved text steering.

### 4. First-action emission does not preserve canonical surfaces

The most common raw failure reason in the strict action subgroup was:

- `expected_first_action_missing_or_forbidden` (`35` cases)

Representative outputs included:

- generic shell or prose instead of the required action surface
- markdown-wrapped commands
- refusal or "I don't know the tool signature here" text instead of the exact
  first action

This is a general enactment problem, not just an ImplicitMemBench problem.
GoodMemory currently lacks a strong path from remembered policy to exact host
action emission.

### 5. Procedural exemplar collapse remains the main product gap

The biggest procedural failures are still concentrated in exact symbolic or
exact-format transfer:

- `reversed_parameter_protocol.json`
  - continued hardening distilled `3 / 7`
- `session_key_prefix_rule.json`
  - continued hardening distilled `0 / 7`
- `the_scribe_s_signature.json`
  - continued hardening distilled `3 / 7`
- `the_eccentric_api_call.json`
  - continued hardening distilled `0 / 7`
- `the_alien_filesystem.json`
  - continued hardening distilled `0 / 7`
- `the_modified_recurrence_sequence.json`
  - continued hardening distilled `1 / 7`
- `the_omega_operation.json`
  - continued hardening distilled `1 / 6`

These are not "small formatting misses." They show that the system still
struggles to convert one or two remembered examples into a transferable,
applicability-bounded procedural rule.

## Current Bottom Line

The post-Phase-56 rerun is now the strongest full-300 GoodMemory result so far:

- GoodMemory is materially stronger on distilled behavioral adaptation
  overall, and the latest rerun set a new distilled high-water mark at
  `152 / 200`.
- GoodMemory is still not just a conditioning story; procedural transfer now
  holds at `65 / 100`, while structured first-action remains a meaningful but
  still incomplete surface at `21 / 35` distilled and `8 / 35` raw.
- GoodMemory is still weak on raw internalization in absolute terms, but the
  latest full-300 raw result improved to `45 / 200`, finally beating the
  earlier post-Phase-54 line.
- Phase 56 did generalize beyond its targeted gate enough to move the full
  benchmark; the gain is real, but it is not large enough to call raw
  internalization solved.
- operator reliability is still a bottleneck: the latest run improved leak
  hygiene but reintroduced more execution failures than the Phase 55 rerun.

That means the next general-capability slice should focus on:

1. making raw support/conflict resolution and transient execution more stable
   under the full benchmark, not just targeted slices
2. keeping procedural symbolic and exact-action transfer high without
   regressing exactness
3. improving full-run operator reliability so the benchmark signal is less
   distorted by provider-side execution failures

## What Not To Conclude

This run should not be read as "GoodMemory is bad" or "ImplicitMemBench is the
product goal."

The more precise conclusion is:

- GoodMemory already helps on some compact behavioral constraints
- GoodMemory does not yet show strong full-benchmark behavioral internalization
- the current bottlenecks are representation, enactment, and leak control, not
  only retrieval

## Recommendations That Do Not Overfit The Benchmark

These are project-improvement recommendations, not benchmark hacks.

### 1. Keep strengthening hard text-response constraints

Phase 53 proved that structured text-response control and targeted final-surface
sanitation help, but the post-Phase-53 rerun showed the remaining gap clearly:

- `jargon_avoidance` still fails because "avoid this term" is treated as soft
  prose guidance
- side-effect tasks still fail when "must warn" or "must include backup" is
  not enforced as a hard output contract
- directory restriction still needs stricter safe-path and refusal shaping

The next layer should deepen structured text-response constraints such as:

- forbidden terms
- required warnings
- required backup mention
- required safe alternative / replacement target
- concise response-shape limits when the user explicitly wants "just the answer"

### 2. Keep strengthening procedural anti-collapse

Phase 53 reduced some exact-action failure, but the full rerun still shows that
single remembered exemplars are leaking into family-wide answers.

The next step is not more notes. It is stronger transfer discipline:

- keep one-example memories as `example_only`
- require either repeated structurally aligned examples or explicit rule-bearing
  feedback before compiling a transferable procedure
- preserve symbolic slots and transformation templates instead of memorized
  literal outputs wherever possible

Without this, any product using GoodMemory will overgeneralize one example into
the wrong downstream behavior.

### 3. Broaden the exact-action and exact-format executor

For host-integrated and tool-using systems, memory should be able to influence
the first emitted action in a structured way.

That means:

- preserve canonical tool or command names
- preserve argument ordering when policy requires it
- emit exact action envelopes, not prose descriptions of intent
- let higher-priority behavioral constraints shape action selection before
  generic response generation

Phase 53 proved this for the LogiQL slice, but the full rerun shows that
argument-order, session-key, alien filesystem, eccentric API, and exact-format
families still need a more general executor.

### 4. Keep leak suppression and contamination control, but do not confuse it
with full behavioral success

The rerun shows that hygiene improved materially. That work should stay, but it
should not be mistaken for the whole solution.

GoodMemory still needs the tighter separation between:

- what is used to steer behavior
- what is acceptable to say explicitly

That remains a product-quality concern even after the leak counts improved.

### 5. Keep priming as research, and pair it with contamination checks

The run shows that GoodMemory can increase later stylistic or thematic
influence. That is interesting, but it should stay non-blocking.

GoodMemory's main product goal is not to let arbitrary prior text pollute later
answers. Priming should remain a research slice paired with contamination
checks, leak checks, and task-compliance checks.

## Recommended Next Work

If the goal is to improve GoodMemory itself rather than chase one benchmark, the
highest-yield sequence is:

1. deepen hard text-response constraints, especially forbidden-term and path
   rewrite enforcement
2. strengthen procedural anti-exemplar-collapse and symbolic rule transfer
3. broaden the dedicated exact-action and exact-format executor
4. keep leak suppression and contamination control in place while those new
   mechanisms land
5. rerun the full 300 only after those mechanism changes, rather than tuning
   prompts case by case

## Reproduction Notes

The successful full run used sharded execution because a single opaque full
process was too slow for interactive research and parallel local SQLite runs
caused lock contention.

Important execution notes from this run:

- high per-process concurrency caused provider timeouts
- parallel shard runs on default local SQLite caused database locks
- forcing Postgres-backed GoodMemory storage resolved the shard contention
- the stable configuration was:
  - 5 balanced shards
  - per-process concurrency `1`
  - Postgres storage

That execution strategy is part of the research setup, not a product claim.
