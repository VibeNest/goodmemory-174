Phase 31 Breakdown
==================

Status
------
- Phase 31 is closed and accepted.
- Scope: strengthen the accepted Phase 30 Codex host evidence chain without changing the public surface.
- Codex remains the only live gate host in this slice.
- External host productization has moved to Phase 32.


Execution Order
---------------
1. 01-codex-event-normalization-and-runtime-resolution.txt
2. 02-native-outcome-provenance.txt
3. 03-native-correction-lineage.txt
4. 04-phase-31-runners-and-gate.txt
5. 05-phase-renumber-and-queue-shift.txt
6. 06-archive-and-closure.txt


Acceptance
----------
- executable blocking traces use host-lifecycle outcomes
- warning-only traces keep native provenance without synthetic failure telemetry
- at least one canonical live case contains native `correctionOfStepIndex`
- `eval:phase-31`, `eval:phase-31-live-memory`, and `gate:phase-31` are regression-covered
- Phase 30 remains closed while Phase 31 becomes the newer accepted internal closure slice
- queued external productization work is renumbered to Phase 32 and left out of this gate


Canonical Inputs
----------------
- `docs/GoodMemory-Current-Status-and-Evidence.md`
- `docs/archive/quality-gates/GoodMemory-Phase-30-Quality-Gate.md`
- `task-board/31-phase-30-trace-backed-behavioral-enactment-and-live-closure.txt`


Files in This Folder
--------------------
- 01-codex-event-normalization-and-runtime-resolution.txt
  Move Codex exec parsing and binary resolution into `src/host`.

- 02-native-outcome-provenance.txt
  Replace synthetic executable outcomes with host-lifecycle outcomes.

- 03-native-correction-lineage.txt
  Capture targeted corrections from native host events and bridge them into telemetry.

- 04-phase-31-runners-and-gate.txt
  Add the Phase 31 eval/live/gate scripts and tests.

- 05-phase-renumber-and-queue-shift.txt
  Move the queued external productization slice to Phase 32.

- 06-archive-and-closure.txt
  Check in accepted artifacts and sync the stable docs.
