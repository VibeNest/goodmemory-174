Phase 55 Breakdown: Probe-Conditioned Raw Carryover And Retrieval Calibration
=============================================================================

Status
------

[DONE] Closed.

Intent
------

Turn the Phase 54 exemplar-aware raw lane into a more selective,
probe-conditioned episodic carryover path. This phase is not about adding more
rules. It is about retrieving the right prior experience, suppressing
interference, abstaining when confidence is low, and keeping the prompt-side
raw payload minimal.


Workstreams
-----------

1. `01-raw-lane-isolation-and-query-intent.txt`
2. `02-candidate-generation-reranker-and-interference-ledger.txt`
3. `03-runtime-carryover-rendering-and-consolidation.txt`
4. `04-eval-gate-and-full300-follow-up.txt`


Closure Shape
-------------

- targeted deterministic/live evidence for the calibrated raw carryover path
- frozen-baseline comparison proving raw improvement without explicit leak
  regression
- distilled targeted coverage preserved
- a required post-gate full-300 rerun recorded back into the research doc as
  follow-up evidence


Evidence
--------

- deterministic targeted eval:
  `reports/eval/fallback/phase-55/run-phase55-fallback-current/report.json`
- live-memory targeted eval:
  `reports/eval/live-memory/phase-55/run-phase55-live-current/report.json`
- quality gate:
  `reports/quality-gates/phase-55/run-20260503233000/phase-55-quality-gate.json`
- Postgres-backed full-300 follow-up:
  `docs/GoodMemory-ImplicitMemBench-Full-300-Research-Summary.md`
