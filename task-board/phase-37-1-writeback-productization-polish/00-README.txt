Phase 37.1 Breakdown: Writeback Productization Polish
=====================================================

This folder contains the implementation checklist for the accepted productization polish after Phase 37.

Follow the parent task file:

- `task-board/39-phase-37-1-writeback-productization-polish.txt`

Working rules:

- TDD first.
- Keep Phase 37 evidence immutable.
- Keep writeback opt-in.
- Never persist raw transcripts.
- Use installed-host internal modules only; do not add a root public writeback API.
- After each feature, run targeted regressions and staged-diff code review.
- Phase 37.1 closure evidence lives in `reports/quality-gates/phase-37-1/run-20260424100757/phase-37-1-quality-gate.json`.
- Local real-ledger dogfood validation uses `.tmp-goodmemory-phase37-1-local/` by default and must not overwrite canonical closure artifacts.
