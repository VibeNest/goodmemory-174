Phase 61 Breakdown: Priming Abstraction And Contamination-Safe Output
====================================================================

Purpose
-------
The Phase 60 full-300 run made priming official-comparable, but the controlled
GoodMemory priming lane credited `0 / 100`. Phase 61 addresses the mechanism:
GoodMemory should carry abstract thematic pressure without copying priming nouns,
leaking memory, breaking strict JSON, or adding commentary.

Tasks
-----
- [x] Correct Phase 60 summary semantics so comparable full-300 rates are not
  inflated by blocking-only profiles.
- [x] Add structured priming violation diagnostics and examples.
- [x] Add an internal latent priming packet with abstract cues and a source-noun
  blacklist.
- [x] Route GoodMemory priming prompts through the latent packet instead of raw
  memory context.
- [x] Add strict JSON candidate repair and source-noun removal before priming
  judging.
- [x] Add a one-command 10-shard live full-300 operator wrapper:
  `bun run eval:phase-61-full300`.
- [x] Run a post-Phase-61 full-300 Postgres-backed rerun and update the research
  summary with the new comparable priming numbers.

Evidence
--------
- Targeted tests:
  - `bun test tests/unit/eval.phase60.test.ts`
  - `bun test tests/unit/implicitmembench-research.test.ts`
- Regression commands:
  - `bun test tests/unit/eval.phase60.test.ts tests/unit/implicitmembench-research.test.ts tests/unit/model-adapters.test.ts`
  - `bun run typecheck`
  - `bun run eval:phase-60`
  - `bun run eval:phase-60-overall`
  - `bun run gate:phase-60`
- Live full-300 operator command:
  - `bun run eval:phase-61-full300`
  - optional explicit run id:
    `bun run eval:phase-61-full300 -- --run-id run-phase61-full300-YYYYMMDD-rN`
  - default sharding:
    `10` shards, with shard-level concurrency `6`
  - default per-shard case concurrency:
    `1`, overridable through `--max-concurrency` or
    `GOODMEMORY_PHASE61_FULL300_MAX_CONCURRENCY`
  - default output:
    `reports/eval/live/phase-61-full300/<run-id>/overall-summary.json`
  - timeout policy:
    both `GOODMEMORY_IMPLICITMEMBENCH_TIMEOUT_MS` and
    `GOODMEMORY_IMPLICITMEMBENCH_PRIMING_TIMEOUT_MS` are raised to at least
    `180000ms` for the live full-300 wrapper unless the caller provides a
    higher general timeout.
- Post-Phase-61 full-300 rerun:
  - run id:
    `run-phase61-full300-20260505T030809Z`
  - summary:
    `reports/eval/live/phase-61-full300/run-phase61-full300-20260505T030809Z/overall-summary.json`
  - official-comparable best GoodMemory full-300 score:
    `159.59 / 300 = 53.20%`
  - GoodMemory priming:
    `12 / 100` credited cases, average influence `1.59`, task violations `0`,
    source-noun contamination `5`, explicit recall leaks `0`
  - boundary:
    improves over the Phase 60 comparable baseline, but does not exceed the
    paper's `66%` reference line.
- Post-rerun priming-strength follow-up:
  - [x] Broaden latent priming semantic-field inference beyond the original
    volcanic/alchemy/abyss/jazz paths to cover oracle, arctic, cathedral,
    espionage, mycelium, and orbital themes.
  - [x] Make contamination repair emit semantic-field-specific safe candidates
    instead of a fixed generic fallback.
  - [x] Treat generic modifiers such as `many`, `layered`, and `order` as
    non-source-noun stop words so they do not create false contamination.
  - [x] Rerun Phase 61 full-300 after this follow-up to measure priming lift:
    `run-phase61-full300-20260505T080002Z`.
  - latest measured priming:
    `56 / 100` credited cases, average influence `24.71`, task violations `0`,
    source-noun contamination `0`, explicit recall leaks `0`.
  - latest full-300 boundary:
    best official-comparable GoodMemory score is `145.71 / 300 = 48.57%`;
    this is below the paper's `66%` reference line, and the run still has `2`
    distilled text-generation timeouts from the older `90000ms` general
    timeout.

Boundary
--------
This is internal research/eval hardening. It does not change the public
GoodMemory API or create a release hard gate.
