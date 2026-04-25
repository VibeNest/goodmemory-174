Phase 41 Breakdown: Installed Host Pre-Action Unification
=========================================================

This folder contains the execution checklist for making installed Codex the
canonical pre-action path after the accepted Phase 40 release proof.

Follow the parent task file:

- `task-board/43-phase-41-installed-host-pre-action-unification.txt`

Working rules:

- TDD first.
- Keep accepted Phase 34, Phase 35, Phase 37, and Phase 40 guarantees
  regression-covered.
- Do not widen the root `GoodMemory` API.
- Do not remove the bootstrap wrapper in this phase.
- Use the installed config, storage, providers, and scope path for all new
  pre-action behavior.
- Keep the runtime shape two-stage:
  - installed `pre-tool-use` hook denies or redirects
  - installed `goodmemory codex action` bridge executes and records lineage
- Codex is the only canonical implementation and live blocker in this phase.
- After each task, run targeted regressions plus `bun run typecheck`.

Task order:

1. contract and failing tests
2. installed `pre-tool-use` hook contract
3. installed action bridge runtime
4. managed `PreToolUse` registration and status surface
5. deterministic Phase 41 eval
6. tarball-first installed Codex live evidence
7. Phase 41 quality gate and closure docs
