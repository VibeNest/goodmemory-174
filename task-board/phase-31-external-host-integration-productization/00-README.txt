Phase 31 Breakdown
==================

Status
------
- Phase 31 is queued and not started.
- Scope: turn the accepted Codex host path and the accepted public reference path into one external product line for `coding_agent`.
- Canonical line:
  - `goodmemory`
  - `goodmemory/ai-sdk`
  - `goodmemory/host`
  - installed-package Bun CLI bootstrap
- Codex remains the only gate-blocking live host path.
- Claude Code must reach bootstrap/docs/example/package-smoke parity without doubling gate scope.


Execution Order
---------------
1. 01-canonical-product-line-and-public-boundary.txt
2. 02-adapter-level-agent-event-contracts.txt
3. 03-selective-evidence-and-proposal-compilation.txt
4. 04-coding-agent-recall-and-context-integration.txt
5. 05-codex-claude-bootstrap-and-installed-surface.txt
6. 06-external-gate-and-closure.txt


Acceptance
----------
- public package boundaries stay frozen to `goodmemory`, `goodmemory/ai-sdk`, and `goodmemory/host`
- adapter-level public event input exists and remains optional
- adapter-level public event input uses a distinct `*AgentEvent` family with stable event identity and lineage keys
- event ingestion is selective and proposal-driven rather than transcript-dump-driven
- event excerpts pass redaction/policy checks before they can enter evidence, proposal inputs, or exported artifacts
- coding-agent recall/context uses accepted event-backed procedural patterns without raw trace injection
- installed-package bootstrap works for Codex and Claude Code without repo-internal imports
- deterministic/live evaluation uses a frozen dual baseline:
  - pre-Phase-31 public text-only adapter path
  - no-memory baseline
- Codex has one canonical passing external-host evidence chain and remains the only live gate blocker
- Claude reaches bootstrap/reference parity and package-smoke coverage


Canonical Inputs
----------------
- `docs/开发安排.md`
- `docs/GoodMemory-Reference-Integration-Guide.md`
- `docs/GoodMemory-Codex-Handoff-Setup-Guide.md`
- `docs/GoodMemory-Current-Status-and-Evidence.md`
- `task-board/28-phase-27-reference-integration-gate-and-adoption-evidence.txt`
- `task-board/31-phase-30-trace-backed-behavioral-enactment-and-live-closure.txt`


Files in This Folder
--------------------
- 01-canonical-product-line-and-public-boundary.txt
  Freeze what Phase 31 is allowed to make public and what must remain internal.

- 02-adapter-level-agent-event-contracts.txt
  Add optional public host/AI SDK event-ingestion inputs without widening the core API.

- 03-selective-evidence-and-proposal-compilation.txt
  Convert accepted external agent events into evidence, experiences, and proposal inputs with strict anti-transcript guardrails.

- 04-coding-agent-recall-and-context-integration.txt
  Make the canonical coding-agent path consume accepted event-backed procedural patterns on the external surface.

- 05-codex-claude-bootstrap-and-installed-surface.txt
  Ship the installed-package bootstrap path, docs, examples, and consumer smoke for Codex and Claude Code.

- 06-external-gate-and-closure.txt
  Add the dedicated Phase 31 gate, archive the canonical evidence chain, and sync stable docs/task-board entrypoints.
