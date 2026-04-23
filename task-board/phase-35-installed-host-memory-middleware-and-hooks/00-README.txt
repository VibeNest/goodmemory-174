Phase 35 Breakdown
==================

Status
------
- Phase 35 is closed again after the Phase 34 public-boundary/proposal-first reopen.
- Scope: turn the accepted external host line into a global-install, repo-opt-in, hook-injected memory middleware path for Codex and Claude Code.
- Root `goodmemory` API stays unchanged.
- Canonical direction:
  - `goodmemory install codex`
  - `goodmemory install claude`
  - explicit repo `enable` / `disable`
  - `SessionStart` and `UserPromptSubmit` hooks for dynamic recall injection
  - `goodmemory-mcp` for deep read and debug
  - explicit `remember` / `feedback` / `forget` write CLI
- Codex remains the only live gate blocker.
- Claude Code must reach install/hook/docs/package-smoke parity without doubling gate scope.
- Phase 35 closure is backed by deterministic, live installed-package, and gate evidence listed below.


Execution Order
---------------
1. 01-freeze-canonical-middleware-contract.txt
2. 02-global-installers-and-repo-opt-in.txt
3. 03-hook-lifecycle-and-context-injection.txt
4. 04-goodmemory-mcp-and-read-only-tools.txt
5. 05-manual-write-cli-and-compatibility-paths.txt
6. 06-phase-35-evals-gate-and-closure.txt


Acceptance
----------
- installed-host middleware remains layered on the accepted `goodmemory`, `goodmemory/ai-sdk`, and `goodmemory/host` packages
- hooks are the canonical always-on recall path; compiled artifacts become projection/fallback, not the only host path
- MCP is read-only in v1 and does not become the default recall transport
- repo opt-in is explicit and host-scoped
- user-level install is idempotent and reversible
- installed-host storage defaults stay user-level and do not break the accepted repo-local CLI defaults
- one Codex live report proves hook-injected continuity and prompt-time recall on the installed path
- current closure evidence:
  - `reports/eval/fallback/phase-35/run-20260423173045/report.json`
  - `reports/eval/live-memory/phase-35/run-phase35-live-current/report.json`
  - `reports/quality-gates/phase-35/run-20260423213045/phase-35-quality-gate.json`
  - `docs/archive/quality-gates/GoodMemory-Phase-35-Quality-Gate.md`


Canonical Inputs
----------------
- `docs/GoodMemory-PRD.md`
- `docs/GoodMemory-First-Principles-and-Reference-Architecture.md`
- `docs/GoodMemory-Current-Status-and-Evidence.md`
- `task-board/33-phase-32-external-host-integration-productization.txt`
- `task-board/34-phase-33-node-compatible-package-boundary-and-node-first-integration.txt`
- `task-board/35-phase-34-host-pre-action-policy-and-veto-contract.txt`
- `docs/GoodMemory-Unified-Self-Evolving-Roadmap.md`


Files in This Folder
--------------------
- 01-freeze-canonical-middleware-contract.txt
  Freeze what Phase 35 is allowed to make public and how install/hook/MCP relate to the accepted Phase 32 and Phase 34 paths.

- 02-global-installers-and-repo-opt-in.txt
  Add the global install/uninstall plus repo enable/disable contract and config merging rules.

- 03-hook-lifecycle-and-context-injection.txt
  Add hook payload contracts plus `SessionStart` and `UserPromptSubmit` handlers for automatic recall injection.

- 04-goodmemory-mcp-and-read-only-tools.txt
  Ship the read-only MCP server and tool surface on the installed package path.

- 05-manual-write-cli-and-compatibility-paths.txt
  Add explicit write CLI for installed-host users and preserve compatibility with the accepted bootstrap/export flow.

- 06-phase-35-evals-gate-and-closure.txt
  Add the dedicated gate, archive the canonical evidence chain, and sync docs/task-board entrypoints.
