Phase 34 Breakdown
==================

Status
------
- Phase 34 is closed.
- Scope: add explicit host pre-action policy and veto behavior on `goodmemory/host` for the canonical `coding_agent + goodmemory + goodmemory/host + Codex` line.
- Root `goodmemory` API stays unchanged.
- Canonical landed code covers:
  - public `HostActionIntent` and `HostActionAssessmentResult`
  - `HostAdapter.assessAction()`
  - deterministic policy compilation
  - internal audit recording for assessed actions
  - installed-package Codex action-gate runtime rewrite/block behavior
  - deterministic/live Phase 34 evidence and `gate:phase-34`
  - synchronized package, task-board, current-status, and archive closure artifacts


Execution Order
---------------
1. 01-freeze-canonical-boundary.txt
2. 02-host-pre-action-contract-and-policy-engine.txt
3. 03-action-lineage-and-audit-recording.txt
4. 04-codex-runtime-rewrite-and-claude-parity.txt
5. 05-phase-34-evals-and-gate.txt
6. 06-docs-and-closure.txt


Acceptance
----------
- host pre-action decisions are explicit and deterministic
- veto/rewrite logic remains scoped to `goodmemory/host`
- `actionId` becomes the durable lineage anchor for later realized host events
- Codex runtime can switch the first step from the original action to the recommended safe first step
- the installed-package Codex action-gate wrapper is the canonical live enforcement path, while `.codex/hooks.json` and `codex/rules/goodmemory.rules` stay parity-only scaffolds
- Phase 34 closure uses a dedicated deterministic/live gate against the Phase 32 soft-guard path and the no-memory baseline


Canonical Inputs
----------------
- `docs/GoodMemory-PRD.md`
- `docs/GoodMemory-First-Principles-and-Reference-Architecture.md`
- `docs/GoodMemory-Current-Status-and-Evidence.md`
- `task-board/33-phase-32-external-host-integration-productization.txt`
- `task-board/34-phase-33-node-compatible-package-boundary-and-node-first-integration.txt`
- `docs/开发安排.md`
