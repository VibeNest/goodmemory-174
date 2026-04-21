Phase 30 Breakdown
==================

Status
------
- Phase 30 is in progress.
- P30-T001 is complete and regression-covered.
- P30-T003 is complete and regression-covered for deterministic replay.
- No deterministic gate, live-memory behavioral report, or archive closure exists yet.


Goal
----
Make behavioral adaptation evidence trace-backed on the accepted Codex coding-agent path.

The accepted Phase 25 contract already proves deterministic outcome telemetry and Layer D reporting. Phase 30 must prove that the first **real host/runtime action** changes after GoodMemory has stored or promoted the relevant experience.


Tasks
-----
[DONE] P30-T001 Define the internal first-action trace contract and add parser/extractor regressions
[TODO] P30-T002 Wire the accepted Codex host path to emit first-action behavioral traces
[DONE] P30-T003 Bridge failed host traces into existing outcome telemetry and validated-pattern promotion
[TODO] P30-T004 Add deterministic trace-backed behavioral eval and report contract
[TODO] P30-T005 Add provider-backed live-memory behavioral eval and make it gate-required
[TODO] P30-T006 Add `gate:phase-30`, archive closure evidence, and sync current-status/task-board docs


Acceptance
----------
- First-action scoring reads host/runtime traces, not model prose or self-reported JSON.
- Codex is the only gate-blocking host path.
- Failed first actions from traces become `tool_outcome` telemetry with evidence lineage.
- Repeated trace-derived failures can promote into active `validated_pattern` feedback.
- Phase 30 closure requires a canonical accepted provider-backed live-memory behavioral report.
- Phase 25 `layer_d` metrics remain canonical and unchanged.
- Public API, Phase 28 local backend claims, and Phase 29 release boundary remain stable.
