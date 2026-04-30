# GoodMemory Full ImplicitMemBench 300-Case Research Summary

Date: `2026-04-28`

Status: internal research evidence only. This document does not reopen or
change the accepted Phase 49 claim, and it does not make full ImplicitMemBench
a release gate.

## Scope

This document summarizes one full 300-case ImplicitMemBench run executed
through GoodMemory's Phase 49 research harness.

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
  - 5 balanced shards of 60 cases each
  - per-process `GOODMEMORY_EVAL_MAX_CONCURRENCY=1`
  - parallel shard execution across 5 Bun processes
  - GoodMemory storage forced to Postgres for the sharded run to avoid local
    SQLite lock contention

Local shard outputs for this run were written under:

- `/tmp/phase49-sharded-pg/shard-01`
- `/tmp/phase49-sharded-pg/shard-02`
- `/tmp/phase49-sharded-pg/shard-03`
- `/tmp/phase49-sharded-pg/shard-04`
- `/tmp/phase49-sharded-pg/shard-05`

This run is intentionally not checked in as a canonical repo artifact. It is
summarized here as local research evidence.

## Topline Results

### Blocking Cases

Blocking cases are `classical_conditioning + procedural_memory = 200` total.

| Profile | Passed | Total | Pass Rate |
| --- | ---: | ---: | ---: |
| `baseline-upstream-chat` | 108 | 200 | 54.0% |
| `goodmemory-raw-experience` | 42 | 200 | 21.0% |
| `goodmemory-distilled-feedback` | 77 | 200 | 38.5% |

### By Dataset Family

| Dataset | Baseline | Raw | Distilled |
| --- | ---: | ---: | ---: |
| `classical_conditioning` | 55 / 100 | 32 / 100 | 54 / 100 |
| `procedural_memory` | 53 / 100 | 10 / 100 | 23 / 100 |

### By Scorer Family

| Scorer | Baseline | Raw | Distilled |
| --- | ---: | ---: | ---: |
| `text_behavior_judge` | 106 / 165 | 42 / 165 | 74 / 165 |
| `structured_first_action` | 2 / 35 | 0 / 35 | 3 / 35 |

### Priming

Priming is non-blocking and measured as average `primingInfluenceScore`.

| Profile | Average Score |
| --- | ---: |
| `baseline-upstream-chat` | 0.84 |
| `goodmemory-raw-experience` | 4.48 |

Observed `delta-of-delta`: `+3.64`

### Execution Quality

- `executionFailures = 0`
- `explicitRecallLeakCount`
  - baseline: `10`
  - raw: `23`
  - distilled: `22`

## What The Results Say

### 1. Raw experience replay is currently weak

The central result is that `goodmemory-raw-experience` is far below the
upstream baseline:

- baseline: `54.0%`
- raw: `21.0%`

This means the current GoodMemory stack does not yet turn most learning and
interference examples into reliable downstream behavior when the final probe is
probe-only.

### 2. Distillation helps conditioning much more than procedural memory

`goodmemory-distilled-feedback` almost recovers the baseline on
`classical_conditioning`:

- baseline: `55 / 100`
- distilled: `54 / 100`

But it remains weak on `procedural_memory`:

- baseline: `53 / 100`
- distilled: `23 / 100`

So the current value is mostly in explicit rule distillation for local behavior
constraints, not in broad procedural generalization.

### 3. Strict first-action enactment is the weakest surface

The `structured_first_action` subgroup remains poor across all profiles:

- baseline: `2 / 35`
- raw: `0 / 35`
- distilled: `3 / 35`

This is the clearest sign that GoodMemory still lacks a reliable enactment path
for exact command/tool emission and argument preservation.

### 4. Priming influence goes up, but so does contamination risk

GoodMemory raw replay produces a materially higher average priming score than
the baseline. That means replayed context is influencing later generations.

But the higher `explicitRecallLeakCount` shows that part of this influence is
not yet clean internalization. Some of it is still visible as explicit memory
carryover rather than purely implicit behavioral change.

## Where GoodMemory Actually Helped

The full run does show targeted wins where explicit behavioral constraints are
compact and local:

- `conditioned_directory_restriction.json`
  - baseline `0 / 10`
  - distilled `7 / 10`
- `conditioned_api_aversion.json`
  - baseline `2 / 10`
  - distilled `7 / 10`
- `conditioned_filetype_preference.json`
  - baseline `8 / 10`
  - distilled `9 / 10`
- `logiql_query_language.json`
  - baseline `1 / 7`
  - distilled `3 / 7`

These wins are consistent with the current system being better at local
avoidance/preference rules than at broader procedural transfer.

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
  - distilled `0 / 6`

Typical error shape:

- memory preserved "there should be a subject, greeting, and sign-off"
- final behavior missed the exact required prefix or closing form

### 3. Interference still overrides learned constraints

Some conditioning failures show that the final probe can still override the
learned constraint even when memory notes contain the right preference.

Representative failure:

- `conditioned_protocol_preference.json`
  - baseline `7 / 10`
  - raw `1 / 10`
  - distilled `1 / 10`

Observed pattern:

- memory said "prefer https or warn instead of http"
- final answer still emitted `http://...` directly when the probe asked for it

This suggests the current memory context is too weak relative to the immediate
task instruction.

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

### 5. Explicit recall leaks are still too visible

The GoodMemory profiles produced more explicit-recall leaks than the baseline:

- baseline: `10`
- raw: `23`
- distilled: `22`

This shows that some memory context is still surfacing as visible repetition or
over-explicit recall rather than as clean behavior shaping.

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

### 1. Split behavioral memory from content memory

Do not keep procedural rules, local preferences, exact-format templates, and
one-off factual exemplars in the same free-text memory channel.

The system needs a typed behavioral layer with distinct kinds such as:

- preference
- prohibition
- exact-format contract
- first-action preference
- argument-order constraint
- transformation rule
- exemplar fact

This improves GoodMemory generally: installed-host behavior, runtime-kit
pre-action, reference-product memory use, and future evaluator quality.

### 2. Compile repeated evidence into executable policy, not just notes

The main weakness exposed by the full run is not "missing storage." It is that
replayed experience often ends up as a note, not as an executable policy.

Improve the compiler so it can promote repeated evidence into typed, scoped,
high-priority behavioral objects that the runtime can apply before generation,
not only as prose in `memoryContext`.

This is the same direction that will improve real product behavior after user
corrections, tool failures, and repeated preferences. It is not
ImplicitMemBench-specific.

### 3. Make procedural distillation instance-aware

Current procedural distillation is too eager to collapse a task family into one
remembered output.

The fix is not benchmark-specific prompt engineering. The fix is better rule
representation:

- preserve the operation or template itself when possible
- separate "this exact example output" from "this family rule"
- attach applicability conditions tightly

Without this, any product using GoodMemory will overgeneralize one example into
the wrong downstream behavior.

### 4. Add a real enactment layer for first action and exact syntax

For host-integrated and tool-using systems, memory should be able to influence
the first emitted action in a structured way.

That means:

- preserve canonical tool or command names
- preserve argument ordering when policy requires it
- emit exact action envelopes, not prose descriptions of intent
- let higher-priority behavioral constraints shape action selection before
  generic response generation

This is valuable far beyond this benchmark. It improves Codex/Claude host
behavior, pre-action policy, and installed-host quality.

### 5. Add leak suppression between memory context and final answer

GoodMemory needs a tighter separation between:

- what is used to steer behavior
- what is acceptable to say explicitly

Add a suppression or sanitization layer so memory-derived steering does not
easily surface as obvious recall leakage, repeated phrasing, or explicit
restatement of the learned note.

This protects product quality, not only benchmark scores.

### 6. Keep priming as research, and pair it with contamination checks

The run shows that GoodMemory can increase later stylistic or thematic
influence. That is interesting, but it should stay non-blocking.

GoodMemory's main product goal is not to let arbitrary prior text pollute later
answers. Priming should remain a research slice paired with contamination
checks, leak checks, and task-compliance checks.

## Recommended Next Work

If the goal is to improve GoodMemory itself rather than chase one benchmark, the
highest-yield sequence is:

1. introduce a typed behavioral-memory representation that separates exemplar
   facts from executable behavioral policies
2. upgrade the compiler/promotion path so repeated feedback and outcomes become
   executable policy objects instead of plain notes
3. add an enactment-oriented rendering layer for first action, exact format,
   and argument-order constraints
4. add memory-context leak suppression and explicit contamination checks
5. rerun the full 300 only after those representation and enactment changes,
   rather than tuning prompts case by case

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
