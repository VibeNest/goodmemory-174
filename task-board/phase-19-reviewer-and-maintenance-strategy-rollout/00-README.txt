Phase 19 Subtasks
=================

Purpose
-------
This folder decomposes reviewer and maintenance strategy rollout into executable slices.

Use it together with:

- task-board/20-phase-19-reviewer-and-maintenance-strategy-rollout.txt


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
