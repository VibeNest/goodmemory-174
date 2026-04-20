Phase 19 Subtasks
=================

Purpose
-------
This folder decomposes reviewer and maintenance strategy rollout into executable slices.

Use it together with:

- task-board/20-phase-19-reviewer-and-maintenance-strategy-rollout.txt


Status Snapshot
---------------
- Phase 19 is closed. All six phase-19 subtask files are currently marked `[DONE]`.
- Closure evidence:
  - `docs/archive/quality-gates/GoodMemory-Phase-19-Reviewer-Quality-Gate.md`
  - `docs/archive/quality-gates/GoodMemory-Phase-19-Maintenance-Quality-Gate.md`
  - `reports/quality-gates/phase-19-reviewer/run-20260419101816/phase-19-reviewer-quality-gate.json`
  - `reports/quality-gates/phase-19-maintenance/run-20260419101816/phase-19-maintenance-quality-gate.json`
- Treat this folder as the historical execution record for Phase 19, not as the active queue.
- If Phase 19 regresses later, reopen the affected subtask file with `[WIP]` or `[BLOCKED]` only after failing evidence exists.


Execution Order
---------------
1. 01-shared-rollout-substrate.txt
2. 02-reviewer-rollout-family.txt
3. 03-maintenance-rollout-family.txt
4. 04-family-shadow-gate-dashboard-artifacts.txt
5. 05-dedicated-quality-gates.txt
6. 06-public-surface-re-evaluation-and-guidance.txt


Execution Rule
--------------
- finish the shared rollout substrate before wiring reviewer or maintenance families
- finish reviewer rollout before maintenance rollout begins
- keep retrieval-first and phase-18 host guarantees regression-covered after every slice
- run the targeted regression list in each subtask file before moving on


Status Rule
-----------
Use:

- [TODO]
- [WIP]
- [DONE]
