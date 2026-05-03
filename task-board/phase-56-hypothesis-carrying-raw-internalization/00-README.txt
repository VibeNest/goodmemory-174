Phase 56 Breakdown: Hypothesis-Carrying Raw Internalization
=============================================================================

Status
------

[DONE] Phase 56 is closed. The targeted gate is accepted and the required
Postgres-backed 5-shard full-300 follow-up has been written back into the
research summary.

Intent
------

Turn raw carryover from exemplar retrieval into:

- support/conflict retrieval
- transient task hypothesis formation
- probe-time raw execution for high-confidence symbolic and exact host-action
  cases


Workstreams
-----------

1. `01-support-conflict-retrieval.txt`
2. `02-raw-task-hypothesis.txt`
3. `03-raw-transient-executor.txt`
4. `04-diagnostics-gate-and-full300.txt`


Current Evidence
----------------

- deterministic targeted eval:
  `reports/eval/fallback/phase-56/run-phase56-fallback-current/report.json`
- live-memory targeted eval:
  `reports/eval/live-memory/phase-56/run-phase56-live-current/report.json`
- current targeted live result:
  - raw `11 / 12`
  - distilled `12 / 12`
- accepted quality gate:
  `reports/quality-gates/phase-56/run-20260504003000/phase-56-quality-gate.json`
- required full-300 follow-up:
  - raw `45 / 200`
  - distilled `152 / 200`
  - conditioning raw/distilled `22 / 100`, `87 / 100`
  - procedural raw/distilled `23 / 100`, `65 / 100`
  - structured first-action raw/distilled `8 / 35`, `21 / 35`

Closure
-------

- accepted `gate:phase-56` artifact exists
- required Postgres-backed 5-shard full-300 follow-up rerun completed
