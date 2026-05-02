# GoodMemory Full ImplicitMemBench 300-Case Research Summary

Initial run date: `2026-04-28`

Latest rerun update: `2026-05-01`

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

- `reports/eval/research/phase-49/goodmemory/run-phase49-full-postphase53-pg-20260502-shard-01`
- `reports/eval/research/phase-49/goodmemory/run-phase49-full-postphase53-pg-20260502-shard-02`
- `reports/eval/research/phase-49/goodmemory/run-phase49-full-postphase53-pg-20260502-shard-03`
- `reports/eval/research/phase-49/goodmemory/run-phase49-full-postphase53-pg-20260502-shard-04`
- `reports/eval/research/phase-49/goodmemory/run-phase49-full-postphase53-pg-20260502-shard-05`

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
| `goodmemory-raw-experience` | 37 | 200 | 18.5% |
| `goodmemory-distilled-feedback` | 92 | 200 | 46.0% |

#### By Dataset Family

| Dataset | Raw | Distilled |
| --- | ---: | ---: |
| `classical_conditioning` | 28 / 100 | 64 / 100 |
| `procedural_memory` | 9 / 100 | 28 / 100 |

#### By Scorer Family

| Scorer | Raw | Distilled |
| --- | ---: | ---: |
| `text_behavior_judge` | 37 / 165 | 85 / 165 |
| `structured_first_action` | 0 / 35 | 7 / 35 |

#### Priming

| Profile | Average Score |
| --- | ---: |
| `goodmemory-raw-experience` | 3.2647 |

#### Execution Quality

- `executionFailures`
  - raw: `3`
  - distilled: `0`
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
| overall raw blocking pass rate | `15.5%` | `18.5%` | `+3.0 pts` |
| overall distilled blocking pass rate | `43.5%` | `46.0%` | `+2.5 pts` |
| conditioning distilled | `63 / 100` | `64 / 100` | `+1` |
| procedural distilled | `24 / 100` | `28 / 100` | `+4` |
| structured first-action distilled | `3 / 35` | `7 / 35` | `+4` |
| raw execution failures | `17` | `3` | `-14` |
| distilled execution failures | `9` | `0` | `-9` |
| raw explicit recall leaks | `2` | `1` | `-1` |
| distilled explicit recall leaks | `0` | `0` | `0` |

## What The Results Say

### 1. Raw experience replay is still weak

The central result did not change: `goodmemory-raw-experience` remains far
below the upstream baseline. Phase 53 recovered part of the post-Phase-52 drop,
but raw replay is still not a reliable product mechanism by itself.

- baseline: `54.0%`
- initial raw: `21.0%`
- post-Phase-51 raw: `17.0%`
- post-Phase-52 raw: `15.5%`
- post-Phase-53 raw: `18.5%`

This means the current GoodMemory stack does not yet turn most learning and
interference examples into reliable downstream behavior when the final probe is
probe-only.

### 2. Distillation remains useful, and Phase 53 moved the full-300 frontier

`goodmemory-distilled-feedback` still carries the real value in the system.
The strongest family remains `classical_conditioning`, where explicit policy
distillation continues to outperform raw replay:

- baseline: `55 / 100`
- initial distilled: `54 / 100`
- post-Phase-51 distilled: `64 / 100`
- post-Phase-52 distilled: `63 / 100`
- post-Phase-53 distilled: `64 / 100`

Phase 53's larger movement was on `procedural_memory`:

- baseline: `53 / 100`
- initial distilled: `23 / 100`
- post-Phase-51 distilled: `25 / 100`
- post-Phase-52 distilled: `24 / 100`
- post-Phase-53 distilled: `28 / 100`

So the value is still concentrated in explicit rule distillation for local
behavioral constraints. Phase 53 recovered the prior high-water mark and moved
it from `89 / 200` to `92 / 200`, but the result still trails the upstream
baseline and should remain research evidence.

### 3. Strict first-action enactment is the weakest surface

The `structured_first_action` subgroup remains poor across all profiles:

- baseline: `2 / 35`
- initial raw: `0 / 35`
- initial distilled: `3 / 35`
- post-Phase-51 raw: `0 / 35`
- post-Phase-51 distilled: `3 / 35`
- post-Phase-52 distilled: `3 / 35`
- post-Phase-53 distilled: `7 / 35`

Phase 53's exact command recovery moved this surface, but `7 / 35` is still
too low for a product claim. The remaining gap is exact syntax/tool execution
coverage beyond the currently compiled command patterns.

### 4. Phase 53 preserved hygiene while improving execution quality

The post-Phase-53 rerun kept the cleaner leakage profile established after
Phase 51 while reducing live execution noise:

- post-Phase-51 raw/distilled leaks: `2 / 0`
- post-Phase-52 raw/distilled leaks: `2 / 0`
- post-Phase-53 raw/distilled leaks: `1 / 0`
- post-Phase-53 raw/distilled execution failures: `3 / 0`

That is a real product-quality win: the distilled path improved without
reintroducing explicit recall leakage, and all distilled live execution
failures cleared in this run.

### 5. The biggest remaining misses are still structural

The post-Phase-53 rerun still shows persistent failure families:

1. forbidden-term blocking remains soft:
   `conditioned_jargon_avoidance` landed at only `1 / 10`
2. distrust/escalation routing is still partial:
   `conditioned_api_distrust` stayed at `4 / 10`
3. directory/path rewrite improved but remains incomplete:
   `conditioned_directory_restriction` reached `4 / 10`
4. broader procedural syntax and exact format execution remain weak:
   `session_key_prefix_rule`, `reversed_parameter_protocol`,
   `the_eccentric_api_call`, `the_scribe_s_signature`, and
   `character_voice_consistency` stayed at or near zero

### 6. The research harness still needs better operator ergonomics

The post-Phase-51 rerun carried more transport/time-budget failures:

- raw execution failures: `0 -> 18`
- distilled execution failures: `0 -> 8`

The post-Phase-52 rerun stayed noisy:

- raw execution failures: `17`
- distilled execution failures: `9`

The post-Phase-53 sharded Postgres run improved this:

- raw execution failures: `3`
- distilled execution failures: `0`

Those failures do not invalidate the behavioral trend, but they do mean the
Phase 49 live research harness still needs stronger retry/checkpoint/failure
accounting if full-300 runs are going to be a reliable operator workflow.

## Where GoodMemory Actually Helped

Across the GoodMemory full runs, the strongest evidence is still on
local, constraint-shaped behavior.

The most reliable post-Phase-53 wins are:

- `conditioned_protocol_preference.json`
  - post-Phase-53 distilled `9 / 10`
- `context_dependent_api_behavior.json`
  - post-Phase-53 distilled `9 / 10`
- `conditioned_api_aversion.json`
  - post-Phase-53 distilled `9 / 10`
- `conditioned_brevity.json`
  - post-Phase-53 distilled `10 / 10`
- `tool_use_with_side_effects.json`
  - post-Phase-53 distilled `7 / 10`
- `logiql_query_language.json`
  - post-Phase-53 distilled `7 / 7`
- `the_forbidden_square.json`
  - post-Phase-53 distilled `6 / 6`
- `the_ternary_logic_system.json`
  - post-Phase-53 distilled `6 / 6`

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
  - distilled `0 / 7`
- `corporate_etiquette_mandate.json`
  - baseline `4 / 6`
  - post-Phase-53 distilled `1 / 6`

Typical error shape:

- memory preserved "there should be a subject, greeting, and sign-off"
- final behavior missed the exact required prefix or closing form

### 3. Hard text constraints are still too soft

The post-Phase-53 rerun confirmed that several conditioning families still
need harder enforcement instead of structured-but-soft control.

Representative failures:

- `conditioned_jargon_avoidance.json`
  - post-Phase-53 distilled `1 / 10`
  - the answer often used the forbidden jargon term while also providing a good
    analogy
- `tool_use_with_side_effects.json`
  - post-Phase-53 distilled `7 / 10`
  - the answer often picked the safer tool or safer reset but still omitted a
    required warning or backup step
- `conditioned_directory_restriction.json`
  - post-Phase-53 distilled `4 / 10`
  - the answer often knew a redirect was needed, but still confused the unsafe
    requested path with the safe replacement path
- `conditioned_api_distrust.json`
  - post-Phase-53 distilled `4 / 10`
  - the answer still often fell back to generic analysis instead of escalating
    to a specialist path or warning/refusing the default path

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

The biggest procedural failures did not move much in the rerun:

- `reversed_parameter_protocol.json`
  - post-Phase-53 distilled `0 / 7`
- `session_key_prefix_rule.json`
  - post-Phase-53 distilled `0 / 7`
- `the_scribe_s_signature.json`
  - post-Phase-53 distilled `0 / 7`
- `the_eccentric_api_call.json`
  - post-Phase-53 distilled `0 / 7`
- `the_modified_recurrence_sequence.json`
  - post-Phase-53 distilled `1 / 7`
- `the_omega_operation.json`
  - post-Phase-53 distilled `1 / 6`

These are not "small formatting misses." They show that the system still
struggles to convert one or two remembered examples into a transferable,
applicability-bounded procedural rule.

## Current Bottom Line

The post-Phase-53 rerun is a meaningful improvement, but only in one part of
the problem:

- GoodMemory is now much cleaner and materially stronger at distilled
  conditioning behavior.
- GoodMemory is still weak at raw internalization.
- GoodMemory is still weak at broad procedural transfer.
- GoodMemory improved exact first-action enactment, but `7 / 35` is still weak.

That means the next general-capability slice should focus on:

1. stronger forbidden-term and path/file rewrite guarantees
2. stronger anti-exemplar-collapse procedural compilation
3. broader exact-format and exact-action executors beyond the covered command
   patterns

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
