Phase 40 Breakdown: v0.2 Release Proof and Product Eval
=======================================================

This folder contains the execution checklist for proving GoodMemory is ready as
a v0.2 public product surface after Phase 39 closes.

Follow the parent task file:

- `task-board/42-phase-40-v0-2-release-proof-and-product-eval.txt`

Working rules:

- Phase 40 is active because Phase 39 is closed and accepted.
- TDD first.
- Keep Phase 38 and Phase 39 accepted claims regression-covered.
- Do not add new large API families to make release evidence pass.
- Treat `0.2.0` as a governed runtime plus bridge release, not a dashboard,
  cloud, analytics, or raw CRUD release.
- Prove adoption through package-boundary and consumer smokes, not docs alone.
- Prove product value through with-GoodMemory versus no-memory eval, not only
  phase-specific correctness gates.
- Runtime archive remains off by default; no raw transcript archive becomes part
  of the release claim.
